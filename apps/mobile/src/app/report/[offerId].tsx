import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '@/components/theme';
import { Body, Button, Card, ErrorText, Field, Heading, Notice, Screen } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';

/** Report reasons from the product specification (§27), in plain words (same as the website). */
const REPORT_REASONS: [string, string][] = [
  ['OFFER_UNAVAILABLE', 'Offer not available at the shop'],
  ['WRONG_DISCOUNT', 'Wrong price or discount'],
  ['MISLEADING_INFORMATION', 'Misleading information'],
  ['BUSINESS_CLOSED', 'Shop is closed'],
  ['WRONG_LOCATION', 'Wrong location'],
  ['OFFENSIVE_CONTENT', 'Offensive content'],
  ['SUSPICIOUS_ACTIVITY', 'Looks like a scam'],
  ['OTHER', 'Something else'],
];

export default function ReportScreen() {
  const { offerId } = useLocalSearchParams<{ offerId: string }>();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api('/reports', { method: 'POST', body: { offerId, reason, note: note.trim() || undefined } });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <Screen>
        <Notice tone="success">Thanks. Our team will check this offer.</Notice>
        <Button title="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Card>
        <Heading>What’s wrong with this offer?</Heading>
        {REPORT_REASONS.map(([value, label]) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: reason === value }}
            onPress={() => setReason(value)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: reason === value ? colors.brand600 : colors.borderStrong,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {reason === value && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand600 }} />}
            </View>
            <Text style={{ fontSize: 15, color: colors.text }}>{label}</Text>
          </Pressable>
        ))}
        <Field label="Anything else we should know?" optional multiline maxLength={1000} value={note} onChangeText={setNote} />
        <Body muted small>Reports go to our team, not to the shop.</Body>
        <Button title={busy ? 'Sending…' : 'Send report'} variant="danger" busy={busy} disabled={!reason} onPress={() => void send()} />
        <ErrorText>{error}</ErrorText>
      </Card>
    </Screen>
  );
}
