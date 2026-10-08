import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContactLinks, FollowButton } from '@/components/engagement-buttons';
import { OfferGrid } from '@/components/offer-card';
import { apiUrl } from '@/lib/config';
import { serverGet } from '@/lib/server-api';
import type { Day, PublicBusiness, PublicOffer } from '@/lib/types';

type Props = { params: Promise<{ slug: string }> };

const getBusiness = (slug: string) => serverGet<PublicBusiness>(`/businesses/${encodeURIComponent(slug)}`);
const DAYS: [Day, string][] = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
];

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const b = await getBusiness((await params).slug);
  if (!b) return { title: 'Business not found' };
  return {
    title: b.name,
    description: `${b.category.name} in ${b.address.locality?.name ?? b.address.city.name}`,
    openGraph: { title: b.name, images: b.logo ? [apiUrl(b.logo.urls.full)] : undefined },
  };
}

export default async function BusinessPage({ params }: Props) {
  const { slug } = await params;
  const b = await getBusiness(slug);
  if (!b) notFound();
  const offers =
    (await serverGet<PublicOffer[]>(`/offers?business=${encodeURIComponent(slug)}&pageSize=50`)) ?? [];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start gap-4">
        {b.logo && (
          // eslint-disable-next-line @next/next/no-img-element -- images come from the API (ADR-0014)
          <img src={apiUrl(b.logo.urls.thumb)} alt="" className="h-20 w-20 rounded-xl object-cover" />
        )}
        <div className="flex-1 space-y-1">
          <h1 className="text-2xl font-bold">
            {b.name} {b.isVerified && <span className="text-base text-green-700">✓ Verified</span>}
          </h1>
          <p className="text-sm text-gray-600">
            {b.category.name} · {b.address.line1}
            {b.address.locality && `, ${b.address.locality.name}`}, {b.address.city.name}
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <FollowButton businessId={b.id} />
            <ContactLinks
              contact={{
                phone: b.contact.phone,
                whatsapp: b.contact.whatsapp,
                website: b.contact.website,
                latitude: b.coordinates.latitude,
                longitude: b.coordinates.longitude,
              }}
              target={{ businessId: b.id }}
            />
          </div>
        </div>
      </header>

      {b.description && <p className="whitespace-pre-line text-gray-700">{b.description}</p>}

      {b.gallery.length > 0 && (
        <div className="flex gap-3 overflow-x-auto">
          {b.gallery.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element -- images come from the API (ADR-0014)
            <img key={img.id} src={apiUrl(img.urls.thumb)} alt="" className="h-40 rounded-lg object-cover" />
          ))}
        </div>
      )}

      {b.openingHours && (
        <section>
          <h2 className="mb-2 font-semibold">Opening hours</h2>
          <dl className="grid max-w-xs grid-cols-2 gap-1 text-sm">
            {DAYS.map(([key, label]) => (
              <div key={key} className="contents">
                <dt className="text-gray-500">{label}</dt>
                <dd>
                  {b.openingHours?.[key]?.length
                    ? b.openingHours[key]!.map((i) => `${i.open}–${i.close}`).join(', ')
                    : 'Closed'}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Current offers</h2>
        <OfferGrid offers={offers} empty="No live offers right now." />
      </section>
    </div>
  );
}
