import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { LocationBar } from '@/components/location-bar';
import { OfferCarousel } from '@/components/offer-card';
import { colors } from '@/components/theme';
import { Button, Heading, LoadState, Screen, Title, styles } from '@/components/ui';
import { api, apiPage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCustomerLocation } from '@/lib/location';
import type { DiscoveredOffer, HomeSections } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

export default function HomeScreen() {
  const { user } = useAuth();
  const loc = useCustomerLocation();
  const [q, setQ] = useState('');
  const [followed, setFollowed] = useState<DiscoveredOffer[]>([]);
  const queryKey = JSON.stringify(loc.query);

  const home = useLoad(
    () => (loc.ready ? api<HomeSections>('/discover/home', { auth: false, query: JSON.parse(queryKey) }) : new Promise<never>(() => {})),
    [loc.ready, queryKey],
  );

  // "From shops you follow": only for logged-in people who follow someone.
  useEffect(() => {
    if (!user) {
      setFollowed([]);
      return;
    }
    apiPage<DiscoveredOffer>('/me/feed/following', { query: { pageSize: 8 } })
      .then((r) => setFollowed(r.items))
      .catch(() => setFollowed([]));
  }, [user, home.data]);

  const search = () => router.push({ pathname: '/search', params: { q } });
  const s = home.data;

  return (
    <Screen refreshing={home.refreshing} onRefresh={home.refresh}>
      <Title>Offers from shops near you</Title>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          placeholder='Try "shoes under 2000" or "50% off"'
          placeholderTextColor={colors.textFaint}
          value={q}
          onChangeText={setQ}
          onSubmitEditing={search}
          returnKeyType="search"
          accessibilityLabel="Search offers"
        />
        <Button title="Search" onPress={search} />
      </View>
      <LocationBar />
      <LoadState loading={home.loading} error={home.error} onRetry={home.refresh}>
        {s && (
          <>
            {loc.location?.kind === 'gps' && (
              <Section title="Near you" offers={s.nearby} empty="No offers within this distance yet. Try a larger radius." />
            )}
            {followed.length > 0 && <Section title="From shops you follow" offers={followed} />}
            <Section title="Recommended" offers={s.recommended} />
            <Section title="New offers" offers={s.newOffers} />
            <Section title="Ending soon" offers={s.endingSoon} />
          </>
        )}
      </LoadState>
    </Screen>
  );
}

function Section({ title, offers, empty }: { title: string; offers: DiscoveredOffer[]; empty?: string }) {
  return (
    <View style={{ gap: 10 }}>
      <Heading>{title}</Heading>
      <OfferCarousel offers={offers} empty={empty} />
    </View>
  );
}
