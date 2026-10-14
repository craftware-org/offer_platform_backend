import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TextInput, View } from 'react-native';
import { OfferCard } from '@/components/offer-card';
import { colors, space } from '@/components/theme';
import { Body, Button, ErrorText, Notice, Segmented, styles } from '@/components/ui';
import { apiPage, errorMessage } from '@/lib/api';
import { formatInr } from '@/lib/money';
import { useCustomerLocation } from '@/lib/location';
import type { DiscoveredOffer, Interpretation, PageMeta } from '@/lib/types';

const SORTS = [
  { value: '', label: 'Best match' },
  { value: 'nearest', label: 'Nearest' },
  { value: 'newest', label: 'Newest' },
  { value: 'ending_soon', label: 'Ending soon' },
  { value: 'discount', label: 'Biggest discount' },
];

export default function SearchScreen() {
  const params = useLocalSearchParams<{ q?: string; category?: string }>();
  const loc = useCustomerLocation();
  const [text, setText] = useState(params.q ?? '');
  const [q, setQ] = useState(params.q ?? '');
  const [sort, setSort] = useState('');
  const [items, setItems] = useState<DiscoveredOffer[]>([]);
  const [meta, setMeta] = useState<(PageMeta & { interpretation?: Interpretation }) | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryKey = JSON.stringify(loc.query);

  // A new search from the home screen (tab params change).
  useEffect(() => {
    if (params.q !== undefined) {
      setText(params.q);
      setQ(params.q);
    }
  }, [params.q]);

  async function load(nextPage: number, mode: 'replace' | 'append' | 'refresh') {
    if (mode === 'refresh') setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await apiPage<DiscoveredOffer, { interpretation?: Interpretation }>('/discover/offers', {
        auth: false,
        query: { q, sort, category: params.category, page: nextPage, pageSize: 20, ...JSON.parse(queryKey) },
      });
      setItems((prev) => (mode === 'append' ? [...prev, ...res.items] : res.items));
      setMeta(res.meta);
      setPage(nextPage);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!loc.ready) return;
    void load(1, 'replace');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when the search inputs change
  }, [q, sort, queryKey, params.category, loc.ready]);

  const i = meta?.interpretation;
  const chips = [
    i?.text ? `“${i.text}”` : null,
    i?.maxPrice ? `under ${formatInr(i.maxPrice)}` : null,
    i?.minDiscount ? `${i.minDiscount}%+ off` : null,
    i?.locality ? `in ${i.locality.name}` : null,
    i?.radiusKm ? `within ${i.radiusKm} km` : null,
  ].filter(Boolean);

  return (
    <FlatList
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      data={items}
      keyExtractor={(o) => o.id}
      renderItem={({ item }) => <OfferCard offer={item} />}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(1, 'refresh')} colors={[colors.brand600]} />}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!loading && meta && page < meta.totalPages) void load(page + 1, 'append');
      }}
      ListHeaderComponent={
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Search offers"
              placeholderTextColor={colors.textFaint}
              value={text}
              onChangeText={setText}
              onSubmitEditing={() => setQ(text.trim())}
              returnKeyType="search"
              accessibilityLabel="Search offers"
            />
            <Button title="Search" onPress={() => setQ(text.trim())} />
          </View>
          <Segmented options={SORTS} value={sort} onChange={setSort} />
          {i?.needsLocation && <Notice>“Near me” needs your location: use the Home tab to share it, or choose a city.</Notice>}
          {chips.length > 0 && <Body muted small>Searching for {chips.join(' · ')}</Body>}
          {meta && <Text style={{ color: colors.textFaint, fontSize: 13 }}>{meta.totalItems} {meta.totalItems === 1 ? 'offer' : 'offers'}</Text>}
          <ErrorText>{error}</ErrorText>
        </View>
      }
      ListEmptyComponent={!loading && !error ? <Body muted>No offers match. Try other words or a larger area.</Body> : null}
      ListFooterComponent={loading ? <ActivityIndicator color={colors.brand600} style={{ marginTop: space.lg }} /> : null}
    />
  );
}
