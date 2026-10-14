import { router } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { endsIn } from '@/lib/time';
import type { DiscoveredOffer, PublicOffer } from '@/lib/types';
import { ApiImage } from './api-image';
import { SaveButton } from './engagement';
import { OfferPrice } from './offer-price';
import { colors, radius, space } from './theme';
import { Badge, Body } from './ui';

type AnyOffer = PublicOffer | DiscoveredOffer;

export function OfferCard({ offer, width }: { offer: AnyOffer; width?: number }) {
  const image = offer.images[0];
  const distance = 'distanceKm' in offer ? offer.distanceKm : null;
  const where = offer.business.address.locality ?? offer.business.address.city;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${offer.headline ? `${offer.headline}, ` : ''}${offer.title}, at ${offer.business.name}`}
      onPress={() => router.push(`/offers/${offer.slug}`)}
      style={({ pressed }) => [styles.card, width ? { width } : null, pressed && { opacity: 0.9 }]}
    >
      <View style={styles.imageBox}>
        {image ? (
          <ApiImage path={image.urls.thumb} style={StyleSheet.absoluteFill} />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText} numberOfLines={3}>
              {offer.headline ?? offer.title}
            </Text>
          </View>
        )}
        {offer.headline && (
          <View style={styles.headline}>
            <Badge>{offer.headline}</Badge>
          </View>
        )}
        {offer.availability !== 'EXPIRED' && (
          <View style={styles.save}>
            <SaveButton offerId={offer.id} compact />
          </View>
        )}
      </View>
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {offer.title}
        </Text>
        <Text style={styles.shop} numberOfLines={1}>
          {offer.business.name}
          {offer.business.isVerified && <Text style={{ color: colors.success }}> ✓</Text>}
        </Text>
        <OfferPrice type={offer.type} pricing={offer.pricing} />
        <View style={styles.footer}>
          <Text style={styles.meta} numberOfLines={1}>
            {where}
          </Text>
          <Text style={styles.meta}>
            {distance !== null && `${distance} km · `}
            {endsIn(offer.expiresAt)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** A horizontal row of cards (home sections). */
export function OfferCarousel({ offers, empty }: { offers: AnyOffer[]; empty?: string }) {
  if (offers.length === 0) return <Body muted>{empty ?? 'No offers yet.'}</Body>;
  return (
    <FlatList
      horizontal
      data={offers}
      keyExtractor={(o) => o.id}
      renderItem={({ item }) => <OfferCard offer={item} width={250} />}
      ItemSeparatorComponent={() => <View style={{ width: space.md }} />}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingRight: space.lg }}
    />
  );
}

/** A vertical list of cards inside a scrolling screen. */
export function OfferStack({ offers, empty }: { offers: AnyOffer[]; empty?: string }) {
  if (offers.length === 0) return <Body muted>{empty ?? 'No offers yet.'}</Body>;
  return (
    <View style={{ gap: space.md }}>
      {offers.map((o) => (
        <OfferCard key={o.id} offer={o} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  imageBox: { aspectRatio: 4 / 3, backgroundColor: colors.brand50 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.lg },
  placeholderText: { fontSize: 22, fontWeight: '700', color: colors.brand600, textAlign: 'center' },
  headline: { position: 'absolute', top: space.sm, left: space.sm },
  save: { position: 'absolute', top: space.sm, right: space.sm },
  body: { padding: space.md, gap: 4 },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  shop: { fontSize: 13, color: colors.textMuted },
  footer: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm, marginTop: 4 },
  meta: { fontSize: 12, color: colors.textFaint, flexShrink: 1 },
});
