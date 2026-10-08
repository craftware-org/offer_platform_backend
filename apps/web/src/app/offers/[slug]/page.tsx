import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ContactLinks, SaveButton, ShareButton } from '@/components/engagement-buttons';
import { OfferPrice } from '@/components/offer-price';
import { ReportOffer } from '@/components/report-offer';
import { apiUrl } from '@/lib/config';
import { serverGet } from '@/lib/server-api';
import { endsIn, formatDateTime } from '@/lib/time';
import type { PublicOffer } from '@/lib/types';
import { TrackView } from '@/components/track-view';

type Props = { params: Promise<{ slug: string }> };

const getOffer = (slug: string) => serverGet<PublicOffer>(`/offers/${encodeURIComponent(slug)}`);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const offer = await getOffer((await params).slug);
  if (!offer) return { title: 'Offer not found' };
  const title = offer.headline ? `${offer.headline}: ${offer.title}` : offer.title;
  const description = `${offer.business.name}, ${offer.business.address.locality ?? offer.business.address.city}`;
  const image = offer.images[0];
  return {
    title,
    description,
    openGraph: { title, description, images: image ? [apiUrl(image.urls.full)] : undefined },
  };
}

export default async function OfferPage({ params }: Props) {
  const offer = await getOffer((await params).slug);
  if (!offer) notFound();
  const b = offer.business;

  return (
    <article className="grid gap-6 md:grid-cols-2">
      <TrackView offerId={offer.id} />
      <div className="space-y-3">
        {offer.images.length > 0 ? (
          offer.images.map((img) => (
            // eslint-disable-next-line @next/next/no-img-element -- images come from the API (ADR-0014)
            <img key={img.id} src={apiUrl(img.urls.full)} alt={offer.title} className="w-full rounded-xl object-cover" />
          ))
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-brand-50 p-6 text-center text-3xl font-bold text-brand-600">
            {offer.headline ?? offer.title}
          </div>
        )}
      </div>

      <div className="space-y-4">
        {offer.availability !== 'ACTIVE' && (
          <p className="rounded-lg bg-gray-100 p-3 text-sm font-medium text-gray-700">
            {offer.availability === 'PAUSED' ? 'This offer is paused for now.' : 'This offer has ended.'}
          </p>
        )}
        {offer.headline && <span className="badge bg-brand-600 text-sm text-white">{offer.headline}</span>}
        <h1 className="text-2xl font-bold">{offer.title}</h1>
        <OfferPrice type={offer.type} pricing={offer.pricing} />
        <div className="flex flex-wrap gap-2">
          {offer.availability !== 'EXPIRED' && <SaveButton offerId={offer.id} />}
          <ShareButton offerId={offer.id} title={offer.headline ? `${offer.headline}: ${offer.title}` : offer.title} />
        </div>
        {offer.description && <p className="whitespace-pre-line text-gray-700">{offer.description}</p>}

        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">Valid from</dt>
          <dd>{formatDateTime(offer.startsAt)}</dd>
          <dt className="text-gray-500">Valid until</dt>
          <dd>
            {formatDateTime(offer.expiresAt)} <span className="text-gray-500">({endsIn(offer.expiresAt)})</span>
          </dd>
          {offer.quantityLimit !== null && (
            <>
              <dt className="text-gray-500">Limited to</dt>
              <dd>{offer.quantityLimit} customers</dd>
            </>
          )}
          <dt className="text-gray-500">Category</dt>
          <dd>{offer.category.name}</dd>
        </dl>

        {offer.eligibility && (
          <div>
            <h2 className="font-semibold">Who can use it</h2>
            <p className="text-sm whitespace-pre-line text-gray-700">{offer.eligibility}</p>
          </div>
        )}
        {offer.terms && (
          <div>
            <h2 className="font-semibold">Terms</h2>
            <p className="text-sm whitespace-pre-line text-gray-700">{offer.terms}</p>
          </div>
        )}

        <div className="card space-y-2">
          <Link href={`/businesses/${b.slug}`} className="text-lg font-semibold hover:text-brand-600">
            {b.name} {b.isVerified && <span className="text-sm text-green-700">✓ Verified</span>}
          </Link>
          <p className="text-sm text-gray-600">
            {b.address.line1}
            {b.address.locality && `, ${b.address.locality}`}, {b.address.city}
          </p>
          <ContactLinks
            contact={{
              phone: b.phone,
              whatsapp: b.whatsapp,
              website: b.website,
              latitude: b.coordinates.latitude,
              longitude: b.coordinates.longitude,
            }}
            target={{ offerId: offer.id }}
          />
        </div>
        <ReportOffer offerId={offer.id} />
      </div>
    </article>
  );
}
