import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { AuthImage } from '@/components/api-image';
import { ImageUploadButton } from '@/components/form-fields';
import { OfferPrice } from '@/components/offer-price';
import { colors, radius, space } from '@/components/theme';
import { Body, Button, Card, ErrorText, Heading, LoadState, Notice, Row, Screen, StatusBadge, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/time';
import type { OwnerOffer } from '@/lib/types';
import { useLoad } from '@/lib/use-load';

const ACTIONS: Record<string, { label: string; confirm?: string; variant: 'primary' | 'secondary' | 'danger' }> = {
  SUBMIT: { label: 'Submit for review', variant: 'primary' },
  WITHDRAW: { label: 'Withdraw from review', variant: 'secondary' },
  PAUSE: { label: 'Pause', variant: 'secondary' },
  RESUME: { label: 'Resume', variant: 'primary' },
  END: { label: 'End offer now', variant: 'danger', confirm: 'End this offer now? This cannot be undone.' },
};

export default function ManageOfferScreen() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  const data = useLoad(() => api<OwnerOffer>(`/me/offers/${offerId}`), [offerId]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { reload } = data;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  const confirm = (title: string, ok: string, destructive = false) =>
    new Promise<boolean>((resolve) =>
      Alert.alert(title, undefined, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: ok, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ], { cancelable: true, onDismiss: () => resolve(false) }),
    );

  async function act(action: string) {
    const meta = ACTIONS[action];
    if (meta?.confirm && !(await confirm(meta.confirm, meta.label, true))) return;
    setBusy(action);
    setError(null);
    try {
      data.setData(await api<OwnerOffer>(`/me/offers/${offerId}/${action.toLowerCase()}`, { method: 'POST' }));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeDraft(offer: OwnerOffer) {
    if (!(await confirm('Delete this draft?', 'Delete', true))) return;
    try {
      await api(`/me/offers/${offerId}`, { method: 'DELETE' });
      router.replace(`/business/${offer.business.id}`);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function removeImage(imageId: string) {
    if (!(await confirm('Delete this photo?', 'Delete', true))) return;
    try {
      await api(`/me/offers/${offerId}/images/${imageId}`, { method: 'DELETE' });
      await reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const offer = data.data;
  const canEdit = !!offer?.allowedActions.includes('EDIT');
  const neverSubmitted = offer?.status === 'DRAFT' && !offer.submittedAt;

  return (
    <Screen refreshing={data.refreshing} onRefresh={data.refresh}>
      <Stack.Screen options={{ title: offer?.business.name ?? 'Manage offer' }} />
      <LoadState loading={data.loading} error={data.error} onRetry={data.refresh}>
        {offer && (
          <>
            <Row style={{ flexWrap: 'wrap' }}>
              <StatusBadge status={offer.status} />
              {offer.headline && <Text style={{ color: colors.brand700 }}>{offer.headline}</Text>}
            </Row>
            <Title>{offer.title}</Title>

            {offer.statusReason && ['DRAFT', 'REJECTED', 'SUSPENDED'].includes(offer.status) && (
              <Notice tone="danger">Admin note: {offer.statusReason}</Notice>
            )}
            {offer.status === 'PENDING_REVIEW' && <Notice>Waiting for admin review.</Notice>}
            {offer.status === 'DRAFT' && offer.images.length === 0 && <Notice tone="info">Tip: offers with a photo get far more views.</Notice>}
            <ErrorText>{error}</ErrorText>

            <View style={{ gap: space.sm }}>
              {offer.allowedActions
                .filter((a) => a in ACTIONS)
                .map((a) => (
                  <Button key={a} title={ACTIONS[a]!.label} variant={ACTIONS[a]!.variant} busy={busy === a} disabled={!!busy} onPress={() => void act(a)} />
                ))}
              {canEdit && <Button title="Edit offer" variant="secondary" onPress={() => router.push(`/business/offers/${offerId}/edit`)} />}
              {['ACTIVE', 'PAUSED', 'EXPIRED'].includes(offer.status) && (
                <Button title="View public page" variant="link" onPress={() => router.push(`/offers/${offer.slug}`)} />
              )}
              {neverSubmitted && <Button title="Delete draft" variant="link" onPress={() => void removeDraft(offer)} />}
            </View>

            <Card>
              <OfferPrice type={offer.type} pricing={offer.pricing} large />
              <Body>
                {formatDateTime(offer.startsAt)} – {formatDateTime(offer.expiresAt)}
              </Body>
              {offer.description && <Body muted>{offer.description}</Body>}
              {offer.terms && <Body muted small>Terms: {offer.terms}</Body>}
            </Card>

            <Card>
              <Heading>Photos</Heading>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {offer.images.map((img) => (
                  <View key={img.id}>
                    <AuthImage path={img.urls.thumb} style={{ width: 104, height: 104, borderRadius: radius.sm }} />
                    {canEdit && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Delete photo"
                        hitSlop={8}
                        onPress={() => void removeImage(img.id)}
                        style={{ position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 }}
                      >
                        <Text style={{ color: colors.danger, fontSize: 12 }}>✕</Text>
                      </Pressable>
                    )}
                  </View>
                ))}
              </View>
              {offer.images.length === 0 && <Body muted small>No photos yet.</Body>}
              {canEdit && <ImageUploadButton path={`/me/offers/${offerId}/images`} label="Add photo" onUploaded={reload} />}
            </Card>
          </>
        )}
      </LoadState>
    </Screen>
  );
}
