import { Text, View } from 'react-native';
import { formatInr } from '@/lib/money';
import type { OfferType, PublicOffer } from '@/lib/types';
import { colors } from './theme';

/** Price line for an offer: "₹1,199 ₹1,999", "Min. purchase ₹500", combo items, etc. (same as the website). */
export function OfferPrice({ type, pricing, large }: { type: OfferType; pricing: PublicOffer['pricing']; large?: boolean }) {
  const p = pricing;
  if (type === 'PRICE_DROP' || type === 'COMBO') {
    return (
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
          {p.offerPrice !== null && (
            <Text style={{ fontSize: large ? 22 : 17, fontWeight: '700', color: colors.text }}>{formatInr(p.offerPrice)}</Text>
          )}
          {p.originalPrice !== null && (
            <Text style={{ fontSize: 13, color: colors.textFaint, textDecorationLine: 'line-through' }}>
              {formatInr(p.originalPrice)}
            </Text>
          )}
        </View>
        {type === 'COMBO' && p.comboItems && (
          <Text style={{ fontSize: 12, color: colors.textMuted }}>Includes: {p.comboItems.join(' + ')}</Text>
        )}
      </View>
    );
  }
  const lines = [
    p.minPurchaseAmount !== null ? `Min. purchase ${formatInr(p.minPurchaseAmount)}` : null,
    p.maxDiscountAmount !== null ? `Max. discount ${formatInr(p.maxDiscountAmount)}` : null,
    type === 'BUY_X_GET_Y' && p.itemName ? `On ${p.itemName}` : null,
  ].filter(Boolean);
  if (!lines.length) return null;
  return (
    <View>
      {lines.map((l) => (
        <Text key={l} style={{ fontSize: 12, color: colors.textMuted }}>
          {l}
        </Text>
      ))}
    </View>
  );
}
