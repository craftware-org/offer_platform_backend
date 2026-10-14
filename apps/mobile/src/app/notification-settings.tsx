import { useState } from 'react';
import { Text, View } from 'react-native';
import { colors } from '@/components/theme';
import { Body, Card, ErrorText, Heading, LoadState, Notice, Screen, SwitchRow } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLoad } from '@/lib/use-load';

interface Preference {
  type: string;
  audience: 'BUSINESS' | 'CUSTOMER' | 'ADMIN';
  label: string;
  inApp: boolean;
  email: boolean;
  defaults: { inApp: boolean; email: boolean };
}

const GROUPS: [Preference['audience'], string][] = [
  ['CUSTOMER', 'As a customer'],
  ['BUSINESS', 'For your shop'],
  ['ADMIN', 'Admin'],
];

/** Inbox / email choice per notification type (Phase 6). Emails go only to a verified address. */
export default function NotificationSettingsScreen() {
  const { user } = useAuth();
  const prefs = useLoad(() => api<Preference[]>('/me/notification-preferences'), []);
  const [error, setError] = useState<string | null>(null);
  const hasVerifiedEmail = !!user?.email && user.emailVerified;

  async function change(p: Preference, channel: 'inApp' | 'email', value: boolean) {
    const next = { ...p, [channel]: value };
    prefs.setData((list) => list?.map((x) => (x.type === p.type ? next : x))); // optimistic
    setError(null);
    try {
      await api('/me/notification-preferences', { method: 'PUT', body: { type: p.type, inApp: next.inApp, email: next.email } });
    } catch (e) {
      prefs.setData((list) => list?.map((x) => (x.type === p.type ? p : x)));
      setError(errorMessage(e));
    }
  }

  return (
    <Screen refreshing={prefs.refreshing} onRefresh={prefs.refresh}>
      {!hasVerifiedEmail && (
        <Notice>
          Emails go only to a verified address. Log in once with a code sent to your email to verify it; until then you get
          notifications in the app’s inbox only.
        </Notice>
      )}
      <ErrorText>{error}</ErrorText>
      <LoadState loading={prefs.loading} error={prefs.error} onRetry={prefs.refresh}>
        {GROUPS.map(([audience, title]) => {
          const items = (prefs.data ?? []).filter((p) => p.audience === audience);
          if (!items.length) return null;
          return (
            <Card key={audience}>
              <Heading>{title}</Heading>
              {items.map((p) => (
                <View key={p.type} style={{ gap: 4, paddingVertical: 4, borderTopWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 15, fontWeight: '500', color: colors.text, paddingTop: 6 }}>{p.label}</Text>
                  <SwitchRow label="In the app" value={p.inApp} onChange={(v) => void change(p, 'inApp', v)} />
                  <SwitchRow label="By email" value={p.email} disabled={!hasVerifiedEmail} onChange={(v) => void change(p, 'email', v)} />
                </View>
              ))}
            </Card>
          );
        })}
      </LoadState>
      <Body muted small>Customer emails are never sent between 10 pm and 8 am; they arrive at 8 am.</Body>
    </Screen>
  );
}
