// Usage: pnpm admin:add-localities --city hubballi --names "Vidya Nagar,Keshwapur,Gokul Road"
// Adds areas (localities) to a city. Idempotent: names whose slug already exists in the city are skipped.
// Admins can rename or deactivate them later through the API (PATCH /admin/localities/:id).
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { slugify } from '../common/text/slug.js';
import { loadEnvFile } from '../config/load-env-file.js';
import { parseEnv } from '../config/env.schema.js';
import { createDatabase } from '../infrastructure/database/database.module.js';
import { AuditAction, AuditService } from '../modules/audit/audit.service.js';
import { cities, localities } from '../modules/locations/locations.schema.js';

const { values } = parseArgs({ options: { city: { type: 'string' }, names: { type: 'string' } } });
const names = (values.names ?? '')
  .split(',')
  .map((n) => n.trim())
  .filter((n) => n.length >= 2 && n.length <= 100);
if (!values.city || names.length === 0) {
  console.error('Usage: --city <city-slug> --names "Area One,Area Two"');
  process.exit(1);
}

loadEnvFile();
const env = parseEnv(process.env);
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 1 });
try {
  const db = createDatabase(pool);
  const [city] = await db.select().from(cities).where(eq(cities.slug, values.city));
  if (!city) {
    console.error(`No city with slug "${values.city}".`);
    process.exitCode = 1;
  } else {
    const audit = new AuditService(db);
    let added = 0;
    for (const name of names) {
      const row = { cityId: city.id, name, slug: slugify(name, 'locality') };
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(localities)
          .values(row)
          .onConflictDoNothing({ target: [localities.cityId, localities.slug] })
          .returning();
        if (!created) return;
        added++;
        await audit.record(
          {
            actorUserId: null,
            action: AuditAction.LOCALITY_CREATED,
            entityType: 'locality',
            entityId: created.id,
            newValue: { ...row, via: 'cli' },
          },
          tx,
        );
      });
    }
    console.log(`${city.name}: added ${added}, skipped ${names.length - added} (already present).`);
  }
} finally {
  await pool.end();
}
