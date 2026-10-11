import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { ApiImage } from '@/components/api-image';
import { ContactButtons, SaveButton, ShareButton } from '@/components/engagement';
import { OfferPrice } from '@/components/offer-price';
import { colors, space } from '@/components/theme';
import { Badge, Body, Button, Card, Heading, LoadState, Notice, Row, Screen, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { goToLogin, useEngagement } from '@/lib/engagement';
import { endsIn, formatDateTime } from '@/lib/time';
import type { PublicOffer } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

export default function OfferScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { user } = useAuth();
  const { track } = useEngagement();
  const { width } = useWindowDimensions();
  const { data: offer, loading, error, refresh, refreshing } = useLoad(
    () => api<PublicOffer>(`/offers/${encodeURIComponent(slug)}`, { auth: false }),
    [slug],
  );

  useEffect(() => {
    if (offer) track('OFFER_VIEWED', { offerId: offer.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per offer
  }, [offer?.id]);

  const b = offer?.business;
  return (
    <Screen refreshing={refreshing} onRefresh={refresh} contentStyle={{ padding: 0, gap: 0 }}>
      <Stack.Screen options={{ title: offer?.business.name ?? 'Offer' }} />
      <LoadState loading={loading} error={error} onRetry={refresh}>
        {offer && b && (
          <>
            {offer.images.length > 0 ? (
              <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                {offer.images.map((img) => (
                  <ApiImage key={img.id} path={img.urls.full} style={{ width, height: width * 0.75 }} label={offer.title} />
                ))}
              </ScrollView>
            ) : (
              <View style={{ height: width * 0.6, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center', padding: space.xl }}>
                <Text style={{ fontSize: 30, fontWeight: '700', color: colors.brand600, textAlign: 'center' }}>{offer.headline ?? offer.title}</Text>
              </View>
            )}
            <View style={{ padding: space.lg, gap: space.lg }}>
              {offer.availability !== 'ACTIVE' && (
                <Notice tone="info">{offer.availability === 'PAUSED' ? 'This offer is paused for now.' : 'This offer has ended.'}</Notice>
              )}
              {offer.headline && <Badge>{offer.headline}</Badge>}
              <Title>{offer.title}</Title>
              <OfferPrice type={offer.type} pricing={offer.pricing} large />
              <Row>
                {offer.availability !== 'EXPIRED' && <SaveButton offerId={offer.id} />}
                <ShareButton offerId={offer.id} slug={offer.slug} title={offer.headline ? `${offer.headline}: ${offer.title}` : offer.title} />
              </Row>
              {offer.description && <Body>{offer.description}</Body>}
              <Card>
                <Detail label="Valid from" value={formatDateTime(offer.startsAt)} />
                <Detail label="Valid until" value={`${formatDateTime(offer.expiresAt)} (${endsIn(offer.expiresAt)})`} />
                {offer.quantityLimit !== null && <Detail label="Limited to" value={`${offer.quantityLimit} customers`} />}
                <Detail label="Category" value={offer.category.name} />
              </Card>
              {offer.eligibility && (
                <View style={{ gap: 4 }}>
                  <Heading>Who can use it</Heading>
                  <Body muted>{offer.eligibility}</Body>
                </View>
              )}
              {offer.terms && (
                <View style={{ gap: 4 }}>
                  <Heading>Terms</Heading>
                  <Body muted>{offer.terms}</Body>
                </View>
              )}
              <Card>
                <Pressable accessibilityRole="link" onPress={() => router.push(`/businesses/${b.slug}`)}>
                  <Heading>
                    {b.name} {b.isVerified && <Text style={{ color: colors.success, fontSize: 14 }}>✓ Verified</Text>}
                  </Heading>
                  <Body muted small>
                    {b.address.line1}
                    {b.address.locality ? `, ${b.address.locality}` : ''}, {b.address.city}
                  </Body>
                  <Text style={{ color: colors.brand700, marginTop: 4 }}>See the shop and its offers ›</Text>
                </Pressable>
                <ContactButtons
                  contact={{ phone: b.phone, whatsapp: b.whatsapp, website: b.website, latitude: b.coordinates.latitude, longitude: b.coordinates.longitude }}
                  target={{ offerId: offer.id }}
                />
              </Card>
              <Button
                title="Report this offer"
                variant="link"
                onPress={() => (user ? router.push(`/report/${offer.id}`) : goToLogin(`/offers/${offer.slug}`))}
              />
            </View>
          </>
        )}
      </LoadState>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <Text style={{ width: 96, color: colors.textFaint }}>{label}</Text>
      <Text style={{ flex: 1, color: colors.text }}>{value}</Text>
    </View>
  );
}
