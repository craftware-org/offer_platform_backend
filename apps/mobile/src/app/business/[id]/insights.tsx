import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Stat } from '@/components/stat';
import { colors, space } from '@/components/theme';
import { Body, Card, Heading, LoadState, Row, Screen, Segmented, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { changeLabel, contactTaps, niceMax, RANGES, shortDay, totalViews, type BusinessInsights, type RangeDays } from '@/lib/insights';
import { useLoad } from '@/lib/use-load';

/** The shop's numbers (Phase 7): totals against the previous period, a daily chart and each offer. */
export default function InsightsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [days, setDays] = useState<RangeDays>(30);
  const data = useLoad(() => api<BusinessInsights>(`/me/businesses/${id}/insights`, { query: { days } }), [id, days]);
  const d = data.data;
  return (
    <Screen refreshing={data.refreshing} onRefresh={data.refresh}>
      <Segmented options={RANGES.map((r) => ({ value: r, label: `${r} days` }))} value={days} onChange={setDays} />
      <LoadState loading={data.loading} error={data.error} onRetry={data.refresh}>
        {d && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <Stat label="Page views" value={totalViews(d.totals)} change={changeLabel(totalViews(d.totals), totalViews(d.previous))} />
              <Stat label="Contact taps" value={contactTaps(d.totals)} change={changeLabel(contactTaps(d.totals), contactTaps(d.previous))} />
              <Stat label="Calls" value={d.totals.calls} change={changeLabel(d.totals.calls, d.previous.calls)} />
              <Stat label="WhatsApp" value={d.totals.whatsapp} change={changeLabel(d.totals.whatsapp, d.previous.whatsapp)} />
              <Stat label="Directions" value={d.totals.directions} change={changeLabel(d.totals.directions, d.previous.directions)} />
              <Stat label="Saves" value={d.totals.saves} change={changeLabel(d.totals.saves, d.previous.saves)} />
              <Stat label="Shares" value={d.totals.shares} change={changeLabel(d.totals.shares, d.previous.shares)} />
              <Stat label="New followers" value={d.totals.follows} change={changeLabel(d.totals.follows, d.previous.follows)} />
            </View>
            <DailyChart insights={d} />
            <Heading>Offers</Heading>
            {d.offers.length === 0 && <Body muted>No offer activity in this period.</Body>}
            {d.offers.map((o) => (
              <Pressable key={o.offerId} accessibilityRole="link" onPress={() => router.push(`/business/offers/${o.offerId}`)}>
                <Card style={{ gap: 6 }}>
                  <Row>
                    <Text style={{ flex: 1, fontWeight: '600', color: colors.text }}>
                      {o.offerId === d.bestOfferId ? '★ ' : ''}
                      {o.title}
                    </Text>
                    <StatusBadge status={o.status} />
                  </Row>
                  <Body muted small>
                    {o.views} views · {o.contactTaps} contact taps · {o.saves} saves · {o.shares} shares
                    {o.tapsPer100Views !== null ? ` · ${o.tapsPer100Views} taps per 100 views` : ''}
                  </Body>
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </LoadState>
    </Screen>
  );
}

/** Views (light) and taps (dark) per day, as simple bars. */
function DailyChart({ insights }: { insights: BusinessInsights }) {
  const max = niceMax(Math.max(0, ...insights.daily.map((p) => p.views)));
  const first = insights.daily[0];
  const last = insights.daily[insights.daily.length - 1];
  return (
    <Card>
      <Heading>Views and taps per day</Heading>
      <View
        accessible
        accessibilityLabel={`Chart of views and taps per day; up to ${max} views a day`}
        style={{ height: 120, flexDirection: 'row', alignItems: 'flex-end', gap: 1 }}
      >
        {insights.daily.map((p) => (
          <View key={p.day} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <View style={{ height: `${(p.views / max) * 100}%`, backgroundColor: colors.brand100, justifyContent: 'flex-end' }}>
              <View style={{ height: p.views ? `${Math.min(100, (p.taps / p.views) * 100)}%` : 0, backgroundColor: colors.brand600 }} />
            </View>
          </View>
        ))}
      </View>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={{ color: colors.textFaint, fontSize: 12 }}>{first ? shortDay(first.day) : ''}</Text>
        <Text style={{ color: colors.textFaint, fontSize: 12 }}>{last ? shortDay(last.day) : ''}</Text>
      </Row>
      <Body muted small>Light: page views · Dark: shares and contact taps</Body>
    </Card>
  );
}
