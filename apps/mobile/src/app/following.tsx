import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { ApiImage } from '@/components/api-image';
import { FollowButton } from '@/components/engagement';
import { OfferStack } from '@/components/offer-card';
import { colors, radius, space } from '@/components/theme';
import { Body, Card, Heading, LoadState, Screen } from '@/components/ui';
import { api, apiPage } from '@/lib/api';
import type { DiscoveredOffer, PublicBusiness } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

export default function FollowingScreen() {
  const data = useLoad(async () => {
    const [shops, feed] = await Promise.all([
      api<PublicBusiness[]>('/me/follows'),
      apiPage<DiscoveredOffer>('/me/feed/following', { query: { pageSize: 30 } }),
    ]);
    return { shops, offers: feed.items };
  }, []);

  return (
    <Screen refreshing={data.refreshing} onRefresh={data.refresh}>
      <LoadState loading={data.loading} error={data.error} onRetry={data.refresh}>
        {data.data && (
          <>
            {data.data.shops.length === 0 ? (
              <Card>
                <Body muted>You don’t follow any shops yet. Open a shop and tap “+ Follow” to hear about its new offers.</Body>
              </Card>
            ) : (
              data.data.shops.map((s) => (
                <Card key={s.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {s.logo ? (
                    <ApiImage path={s.logo.urls.thumb} style={{ width: 48, height: 48, borderRadius: radius.sm }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: radius.sm, backgroundColor: colors.brand50 }} />
                  )}
                  <Pressable style={{ flex: 1 }} accessibilityRole="link" onPress={() => router.push(`/businesses/${s.slug}`)}>
                    <Text style={{ fontWeight: '600', fontSize: 15, color: colors.text }}>{s.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13 }}>{s.category.name}</Text>
                  </Pressable>
                  <FollowButton businessId={s.id} />
                </Card>
              ))
            )}
            {data.data.offers.length > 0 && (
              <View style={{ gap: space.md }}>
                <Heading>Live offers from these shops</Heading>
                <OfferStack offers={data.data.offers} />
              </View>
            )}
          </>
        )}
      </LoadState>
    </Screen>
  );
}
