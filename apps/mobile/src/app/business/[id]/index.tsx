import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { AuthImage } from '@/components/api-image';
import { Stat } from '@/components/stat';
import { ImageUploadButton } from '@/components/form-fields';
import { colors, radius, space } from '@/components/theme';
import { Body, Button, Card, ErrorText, Heading, LoadState, Notice, Row, Screen, StatusBadge } from '@/components/ui';
import { api, apiPage, errorMessage } from '@/lib/api';
import { changeLabel, contactTaps, totalViews, type BusinessInsights } from '@/lib/insights';
import { formatDateTime } from '@/lib/time';
import type { BusinessDashboard, BusinessImage, OwnerBusiness, OwnerOffer } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

interface Warning {
  at: string;
  message: string;
  reason: string;
  offer: { id: string; title: string | null };
}

export default function BusinessDashboardScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const data = useLoad(async () => {
    const [business, dash, offers] = await Promise.all([
      api<OwnerBusiness>(`/me/businesses/${id}`),
      api<BusinessDashboard>(`/me/businesses/${id}/dashboard`),
      apiPage<OwnerOffer>(`/me/businesses/${id}/offers`, { query: { pageSize: 50 } }),
    ]);
    return { business, dash, offers: offers.items };
  }, [id]);
  const { reload } = data;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  async function submitForVerification() {
    setBusy(true);
    setError(null);
    try {
      await api(`/me/businesses/${id}/submit`, { method: 'POST' });
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function removeImage(imageId: string) {
    Alert.alert('Delete this photo?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await api(`/me/businesses/${id}/images/${imageId}`, { method: 'DELETE' });
            await reload();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);
  }

  const business = data.data?.business;
  const dash = data.data?.dash;

  const photos = (list: BusinessImage[], canDelete: boolean) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {list.map((img) => (
        <View key={img.id}>
          <AuthImage path={img.urls.thumb} style={{ width: 96, height: 96, borderRadius: radius.sm }} />
          {canDelete && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete photo"
              hitSlop={8}
              onPress={() => removeImage(img.id)}
              style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}
            >
              <Text style={{ color: colors.danger, fontSize: 12 }}>✕</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );

  return (
    <Screen refreshing={data.refreshing} onRefresh={data.refresh}>
      <Stack.Screen options={{ title: business?.name ?? 'Your business' }} />
      <LoadState loading={data.loading} error={data.error} onRetry={data.refresh}>
        {business && dash && data.data && (
          <>
            <Row style={{ flexWrap: 'wrap' }}>
              <StatusBadge status={business.status} />
              <View style={{ flex: 1 }} />
              {dash.business.publicPath && (
                <Button title="Public page" variant="link" onPress={() => router.push(dash.business.publicPath as never)} />
              )}
              <Button title="Edit details" variant="secondary" onPress={() => router.push(`/business/${id}/edit`)} />
            </Row>

            {business.statusReason && (business.status === 'REJECTED' || business.status === 'SUSPENDED') && (
              <Notice tone="danger">Admin note: {business.statusReason}</Notice>
            )}
            <ErrorText>{error}</ErrorText>

            {business.status !== 'VERIFIED' && (
              <Card>
                <Heading>Verification</Heading>
                {business.status === 'UNDER_REVIEW' ? (
                  <Body muted>
                    Submitted {business.submittedAt ? formatDateTime(business.submittedAt) : ''}. An admin will check the details and
                    photos. You can publish offers once the business is verified.
                  </Body>
                ) : (
                  <Body muted>
                    We do not ask for identity documents. Add a clear photo of your shop front (with the signboard if you have one).
                    These photos are seen only by you and our admins.
                  </Body>
                )}
                {dash.verification.items.map((item) => (
                  <Body key={item.key}>
                    {item.done ? '✅' : item.required ? '⬜' : '◻️'} {item.label}
                    {!item.required && <Text style={{ color: colors.textFaint }}> (optional)</Text>}
                  </Body>
                ))}
                <Heading>Shop photos</Heading>
                {photos(business.verificationPhotos.shop, canChangeVerification(business))}
                {canChangeVerification(business) && (
                  <ImageUploadButton path={`/me/businesses/${id}/images?kind=VERIFICATION_SHOP`} label="Add shop photo" onUploaded={reload} />
                )}
                <Heading>Owner photo (optional)</Heading>
                {photos(business.verificationPhotos.owner, canChangeVerification(business))}
                {canChangeVerification(business) && (
                  <ImageUploadButton path={`/me/businesses/${id}/images?kind=VERIFICATION_OWNER`} label="Add owner photo" onUploaded={reload} />
                )}
                {canChangeVerification(business) && (
                  <Button
                    title={busy ? 'Submitting…' : 'Submit for verification'}
                    busy={busy}
                    disabled={!dash.canSubmit}
                    onPress={() => void submitForVerification()}
                  />
                )}
              </Card>
            )}

            {business.status === 'VERIFIED' && <Engagement businessId={business.id} />}

            <Card>
              <Heading>Logo and photos</Heading>
              <Body muted small>Shown publicly once the business is verified.</Body>
              <Text style={{ fontWeight: '500', color: colors.text }}>Logo</Text>
              {business.logo && photos([business.logo], true)}
              <ImageUploadButton path={`/me/businesses/${id}/images?kind=LOGO`} label={business.logo ? 'Replace logo' : 'Add logo'} onUploaded={reload} />
              <Text style={{ fontWeight: '500', color: colors.text }}>Gallery</Text>
              {photos(business.gallery, true)}
              <ImageUploadButton path={`/me/businesses/${id}/images?kind=GALLERY`} label="Add photo" onUploaded={reload} />
            </Card>

            <Row>
              <View style={{ flex: 1 }}>
                <Heading>Offers</Heading>
              </View>
              {business.status === 'VERIFIED' && <Button title="+ New offer" onPress={() => router.push(`/business/${id}/offers/new`)} />}
            </Row>
            {business.status !== 'VERIFIED' && <Body muted>You can create offers after verification.</Body>}
            {data.data.offers.length === 0 ? (
              <Body muted>No offers yet.</Body>
            ) : (
              data.data.offers.map((o) => (
                <Pressable key={o.id} accessibilityRole="link" onPress={() => router.push(`/business/offers/${o.id}`)}>
                  <Card style={{ gap: 4 }}>
                    <Row>
                      <Text style={{ flex: 1, fontWeight: '600', fontSize: 15, color: colors.text }}>{o.title}</Text>
                      <StatusBadge status={o.status} />
                    </Row>
                    {o.headline && <Text style={{ color: colors.brand700 }}>{o.headline}</Text>}
                    <Body muted small>Until {formatDateTime(o.expiresAt)}</Body>
                  </Card>
                </Pressable>
              ))
            )}
          </>
        )}
      </LoadState>
    </Screen>
  );
}

const canChangeVerification = (b: OwnerBusiness) => b.status === 'PENDING' || b.status === 'REJECTED';

/** Warnings from the platform plus the last 30 days at a glance (the Performance screen has the rest). */
function Engagement({ businessId }: { businessId: string }) {
  const data = useLoad(async () => {
    const [insights, engagement, warnings] = await Promise.all([
      api<BusinessInsights>(`/me/businesses/${businessId}/insights`, { query: { days: 30 } }).catch(() => null),
      api<{ followers: number }>(`/me/businesses/${businessId}/engagement`).catch(() => null),
      api<Warning[]>(`/me/businesses/${businessId}/warnings`).catch(() => [] as Warning[]),
    ]);
    return { insights, followers: engagement?.followers ?? null, warnings };
  }, [businessId]);
  const t = data.data?.insights?.totals;
  const p = data.data?.insights?.previous;
  return (
    <>
      {data.data?.warnings.map((w, i) => (
        <Notice key={i}>
          {formatDateTime(w.at)} · about “{w.offer.title ?? 'an offer'}”: “{w.message}”
        </Notice>
      ))}
      {t && p && (
        <Card>
          <Row>
            <View style={{ flex: 1 }}>
              <Heading>Last 30 days</Heading>
              {data.data?.followers !== null && (
                <Body muted small>
                  {data.data?.followers} {data.data?.followers === 1 ? 'follower' : 'followers'} in total
                </Body>
              )}
            </View>
            <Button title="Performance" variant="secondary" onPress={() => router.push(`/business/${businessId}/insights`)} />
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Stat label="Page views" value={totalViews(t)} change={changeLabel(totalViews(t), totalViews(p))} />
            <Stat label="Contact taps" value={contactTaps(t)} change={changeLabel(contactTaps(t), contactTaps(p))} />
            <Stat label="Saves" value={t.saves} change={changeLabel(t.saves, p.saves)} />
            <Stat label="Shares" value={t.shares} change={changeLabel(t.shares, p.shares)} />
          </View>
        </Card>
      )}
    </>
  );
}
