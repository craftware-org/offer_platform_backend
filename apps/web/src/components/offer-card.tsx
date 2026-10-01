import Link from 'next/link';
import { apiUrl } from '@/lib/config';
import { endsIn } from '@/lib/time';
import type { DiscoveredOffer, PublicOffer } from '@/lib/types';
import { OfferPrice } from './offer-price';

export function OfferCard({ offer }: { offer: PublicOffer | DiscoveredOffer }) {
  const image = offer.images[0];
  const distance = 'distanceKm' in offer ? offer.distanceKm : null;
  return (
    <Link
      href={`/offers/${offer.slug}`}
      className="card flex flex-col gap-2 p-0 transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-t-xl bg-brand-50">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element -- images come from the API (ADR-0014)
          <img src={apiUrl(image.urls.thumb)} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-2xl font-bold text-brand-600">
            {offer.headline ?? offer.title}
          </div>
        )}
        {offer.headline && (
          <span className="badge absolute top-2 left-2 bg-brand-600 text-white">{offer.headline}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 pb-4">
        <h3 className="line-clamp-2 font-medium">{offer.title}</h3>
        <p className="text-sm text-gray-600">
          {offer.business.name}
          {offer.business.isVerified && <span className="ml-1 text-green-700">✓</span>}
        </p>
        <OfferPrice type={offer.type} pricing={offer.pricing} />
        <div className="mt-auto flex justify-between pt-2 text-xs text-gray-500">
          <span>{offer.business.address.locality ?? offer.business.address.city}</span>
          <span>
            {distance !== null && `${distance} km · `}
            {endsIn(offer.expiresAt)}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function OfferGrid({ offers, empty }: { offers: (PublicOffer | DiscoveredOffer)[]; empty?: string }) {
  if (offers.length === 0) return <p className="text-sm text-gray-500">{empty ?? 'No offers yet.'}</p>;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {offers.map((o) => (
        <OfferCard key={o.id} offer={o} />
      ))}
    </div>
  );
}
