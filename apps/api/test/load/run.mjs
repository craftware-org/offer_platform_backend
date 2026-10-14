// Load test of the main public reads and of password login (Phase 9). Each request comes from a
// random IP address (X-Forwarded-For), like many different people, so the per-IP limits don't
// stop it; the API under test must trust one proxy hop (TRUST_PROXY_HOPS=1). LOCAL TEST STACKS
// ONLY: see docs/load-test.md for how the stack is started and for the results.
//   LOAD_API=http://localhost:3100 LOAD_EMAIL=<test account> LOAD_PASSWORD=<its password> node test/load/run.mjs
import autocannon from 'autocannon';

const API = process.env.LOAD_API ?? 'http://localhost:3100';
const DURATION = Number(process.env.LOAD_SECONDS ?? 20);
const CONNECTIONS = (process.env.LOAD_CONNECTIONS ?? '10,50').split(',').map(Number);
const only = process.env.LOAD_ONLY?.split(',');

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const randomIp = () => `10.${(Math.random() * 255) | 0}.${(Math.random() * 255) | 0}.${1 + ((Math.random() * 254) | 0)}`;
const near = (lat, lng) => [lat + (Math.random() - 0.5) * 0.08, lng + (Math.random() - 0.5) * 0.08];

// What people type: product words, typos, price and discount phrases, area names.
const SEARCHES = [
  'saree', 'silk saree', 'shoes', 'running shoes', 'sare', 'shoos', 'smartphone', 'biryani', 'cake', 'haircut',
  'shoes under 2000', 'saree under 1500', '50% off', '30% off watch', 'gym', 'ac service', 'kurta', 'sweets',
  'headphones under 3000', 'bike service',
];

async function offerSlugs() {
  const res = await fetch(`${API}/api/v1/discover/offers?city=hubballi&pageSize=50`);
  const body = await res.json();
  const items = body.data?.items ?? body.data ?? [];
  if (!items.length) throw new Error('No live offers: seed the database first (test/load/seed.sql).');
  return items.map((o) => o.slug);
}

function scenarios(slugs) {
  const get = (path) => (req) => ({ ...req, method: 'GET', path: path(), headers: { 'x-forwarded-for': randomIp() } });
  const list = [
    { name: 'Home page sections', request: get(() => '/api/v1/discover/home?city=hubballi') },
    {
      name: 'Search (typed words)',
      request: get(() => `/api/v1/discover/offers?city=hubballi&q=${encodeURIComponent(pick(SEARCHES))}`),
    },
    {
      name: 'Near me (5 km)',
      request: get(() => {
        const [lat, lng] = near(15.3647, 75.124);
        return `/api/v1/discover/offers?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}&radiusKm=5`;
      }),
    },
    { name: 'Offer page', request: get(() => `/api/v1/offers/${pick(slugs)}`) },
  ];
  if (process.env.LOAD_EMAIL && process.env.LOAD_PASSWORD) {
    const body = JSON.stringify({ email: process.env.LOAD_EMAIL, password: process.env.LOAD_PASSWORD });
    list.push({
      name: 'Password login',
      request: (req) => ({
        ...req,
        method: 'POST',
        path: '/api/v1/auth/password/login',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': randomIp() },
        body,
      }),
    });
  }
  return list.filter((s) => !only || only.some((o) => s.name.toLowerCase().includes(o.toLowerCase())));
}

const run = (scenario, connections) =>
  new Promise((resolve, reject) => {
    autocannon(
      { url: API, connections, duration: DURATION, requests: [{ setupRequest: scenario.request }] },
      (err, result) => (err ? reject(err) : resolve(result)),
    );
  });

const slugs = await offerSlugs();
const rows = [];
for (const scenario of scenarios(slugs)) {
  for (const connections of CONNECTIONS) {
    const r = await run(scenario, connections);
    const row = {
      scenario: scenario.name,
      users: connections,
      'req/s': Math.round(r.requests.average),
      'p50 ms': r.latency.p50,
      'p90 ms': r.latency.p90,
      'p99 ms': r.latency.p99,
      requests: r.requests.total,
      'non-2xx': r.non2xx,
      errors: r.errors + r.timeouts,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
console.table(rows);
