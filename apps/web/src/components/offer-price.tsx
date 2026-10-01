import { formatInr } from '@/lib/money';
import type { OfferType, PublicOffer } from '@/lib/types';

/** Price line for an offer: "₹1,199 ₹1,999", "Min. purchase ₹500", combo items, etc. */
export function OfferPrice({ type, pricing }: { type: OfferType; pricing: PublicOffer['pricing'] }) {
  const p = pricing;
  switch (type) {
    case 'PRICE_DROP':
    case 'COMBO':
      return (
        <div className="space-y-1">
          <div className="flex items-baseline gap-2">
            {p.offerPrice !== null && <span className="text-lg font-semibold">{formatInr(p.offerPrice)}</span>}
            {p.originalPrice !== null && (
              <span className="text-sm text-gray-500 line-through">{formatInr(p.originalPrice)}</span>
            )}
          </div>
          {type === 'COMBO' && p.comboItems && (
            <p className="text-xs text-gray-600">Includes: {p.comboItems.join(' + ')}</p>
          )}
        </div>
      );
    default:
      return (
        <div className="space-y-0.5 text-xs text-gray-600">
          {p.minPurchaseAmount !== null && <p>Min. purchase {formatInr(p.minPurchaseAmount)}</p>}
          {p.maxDiscountAmount !== null && <p>Max. discount {formatInr(p.maxDiscountAmount)}</p>}
          {type === 'BUY_X_GET_Y' && p.itemName && <p>On {p.itemName}</p>}
        </div>
      );
  }
}
