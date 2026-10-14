import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ApiImage } from '@/components/api-image';
import { ContactButtons, FollowButton } from '@/components/engagement';
import { OfferStack } from '@/components/offer-card';
import { colors, radius, space } from '@/components/theme';
import { Body, Card, Heading, LoadState, Screen, Title } from '@/components/ui';
import { api } from '@/lib/api';
import { useEngagement } from '@/lib/engagement';
import type { Day, PublicBusiness, PublicOffer } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const DAYS: [Day, string][] = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
];

export default function BusinessScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { track } = useEngagement();
  const { data, loading, error, refresh, refreshing } = useLoad(async () => {
    const [business, offers] = await Promise.all([
      api<PublicBusiness>(`/businesses/${encodeURIComponent(slug)}`, { auth: false }),
      api<PublicOffer[]>('/offers', { auth: false, query: { business: slug, pageSize: 50 } }),
    ]);
    return { business, offers };
  }, [slug]);

  const b = data?.business;
  useEffect(() => {
    if (b) track('BUSINESS_VIEWED', { businessId: b.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per shop
  }, [b?.id]);

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      <Stack.Screen options={{ title: b?.name ?? 'Shop' }} />
      <LoadState loading={loading} error={error} onRetry={refresh}>
        {b && data && (
          <>
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
              {b.logo && <ApiImage path={b.logo.urls.thumb} style={{ width: 72, height: 72, borderRadius: radius.md }} />}
              <View style={{ flex: 1, gap: 2 }}>
                <Title>{b.name}</Title>
                {b.isVerified && <Text style={{ color: colors.success }}>✓ Verified shop</Text>}
                <Body muted small>
                  {b.category.name} · {b.address.line1}
                  {b.address.locality ? `, ${b.address.locality.name}` : ''}, {b.address.city.name}
                </Body>
              </View>
            </View>
            <FollowButton businessId={b.id} />
            <ContactButtons
              contact={{
                phone: b.contact.phone,
                whatsapp: b.contact.whatsapp,
                website: b.contact.website,
                latitude: b.coordinates.latitude,
                longitude: b.coordinates.longitude,
              }}
              target={{ businessId: b.id }}
            />
            {b.description && <Body>{b.description}</Body>}
            {b.gallery.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
                {b.gallery.map((img) => (
                  <ApiImage key={img.id} path={img.urls.thumb} style={{ width: 200, height: 150, borderRadius: radius.sm }} />
                ))}
              </ScrollView>
            )}
            {b.openingHours && (
              <Card>
                <Heading>Opening hours</Heading>
                {DAYS.map(([key, label]) => (
                  <View key={key} style={{ flexDirection: 'row' }}>
                    <Text style={{ width: 56, color: colors.textFaint }}>{label}</Text>
                    <Text style={{ color: colors.text }}>
                      {b.openingHours?.[key]?.length ? b.openingHours[key]!.map((i) => `${i.open}–${i.close}`).join(', ') : 'Closed'}
                    </Text>
                  </View>
                ))}
              </Card>
            )}
            <Heading>Current offers</Heading>
            <OfferStack offers={data.offers} empty="No live offers right now." />
          </>
        )}
      </LoadState>
    </Screen>
  );
}
