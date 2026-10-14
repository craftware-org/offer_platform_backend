import { useState } from 'react';
import { Alert, Linking, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { errorMessage } from '@/lib/api';
import { useEngagement, type TapEvent } from '@/lib/engagement';
import { directionsUrl, offerWebUrl, whatsappDigits } from '@/lib/links';
import { Button } from './ui';
import { colors } from './theme';

/** ♡ / ♥ save toggle. */
export function SaveButton({ offerId, compact }: { offerId: string; compact?: boolean }) {
  const { isSaved, toggleSave } = useEngagement();
  const saved = isSaved(offerId);
  const onPress = () => toggleSave(offerId).catch((e) => Alert.alert('Could not save', errorMessage(e)));
  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={saved ? 'Remove from saved' : 'Save offer'}
        accessibilityState={{ selected: saved }}
        hitSlop={8}
        onPress={onPress}
        style={styles.heart}
      >
        <Text style={{ fontSize: 18, color: saved ? colors.danger : colors.text }}>{saved ? '♥' : '♡'}</Text>
      </Pressable>
    );
  }
  return <Button title={saved ? '♥ Saved' : '♡ Save'} variant="secondary" onPress={onPress} />;
}

export function FollowButton({ businessId }: { businessId: string }) {
  const { isFollowing, toggleFollow } = useEngagement();
  const following = isFollowing(businessId);
  return (
    <Button
      title={following ? '✓ Following' : '+ Follow'}
      variant={following ? 'secondary' : 'primary'}
      onPress={() => toggleFollow(businessId).catch((e) => Alert.alert('Could not follow', errorMessage(e)))}
    />
  );
}

/** Opens the Android share sheet with the offer's web link (it shows a preview on WhatsApp). */
export function ShareButton({ offerId, slug, title }: { offerId: string; slug: string; title: string }) {
  const { track } = useEngagement();
  return (
    <Button
      title="↗ Share"
      variant="secondary"
      onPress={async () => {
        const url = offerWebUrl(slug);
        try {
          const result = await Share.share({ message: `${title} ${url}`, url, title });
          if (result.action === Share.sharedAction) track('OFFER_SHARED', { offerId });
        } catch {
          // cancelled
        }
      }}
    />
  );
}

interface Contact {
  phone: string;
  whatsapp: string | null;
  website?: string | null;
  latitude: number;
  longitude: number;
}

/** Call / WhatsApp / Directions / Website; each tap is counted (for everyone, since Phase 7). */
export function ContactButtons({ contact, target }: { contact: Contact; target: { offerId?: string; businessId?: string } }) {
  const { track } = useEngagement();
  const [error, setError] = useState<string | null>(null);
  const wa = whatsappDigits(contact.whatsapp);
  const open = (type: TapEvent, url: string) => async () => {
    setError(null);
    track(type, target);
    try {
      await Linking.openURL(url);
    } catch {
      setError('No app on this phone can open that.');
    }
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.wrap}>
        <Button title="📞 Call" onPress={open('CALL_CLICKED', `tel:${contact.phone}`)} style={styles.grow} />
        {wa ? <Button title="WhatsApp" variant="secondary" onPress={open('WHATSAPP_CLICKED', `https://wa.me/${wa}`)} style={styles.grow} /> : null}
      </View>
      <View style={styles.wrap}>
        <Button
          title="📍 Directions"
          variant="secondary"
          onPress={open('DIRECTIONS_CLICKED', directionsUrl(contact.latitude, contact.longitude))}
          style={styles.grow}
        />
        {contact.website ? (
          <Button title="Website" variant="secondary" onPress={open('WEBSITE_CLICKED', contact.website)} style={styles.grow} />
        ) : null}
      </View>
      {error && <Text style={{ color: colors.danger, fontSize: 13 }}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  heart: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 999,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: { flexDirection: 'row', gap: 8 },
  grow: { flex: 1 },
});
