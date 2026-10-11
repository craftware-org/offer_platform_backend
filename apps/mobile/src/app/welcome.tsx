import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Body, Button, Card, ErrorText, Field, Screen, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { leaveLogin, safeNext } from '@/lib/navigation';

const PASSWORD_HINT = 'At least 8 characters. Very common passwords are not allowed.';

/** First login: choose a name (if missing) and a password, in one step (ADR-0015). */
export default function WelcomeScreen() {
  const { user, reload } = useAuth();
  const params = useLocalSearchParams<{ next?: string }>();
  const next = safeNext(params.next);
  const [name, setName] = useState(user?.name ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  async function submit() {
    setError(null);
    if (!user!.hasPassword && password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      if (!user!.name && name.trim()) await api('/users/me', { method: 'PATCH', body: { name: name.trim() } });
      if (!user!.hasPassword) await api('/auth/password', { method: 'POST', body: { password } });
      await reload();
      leaveLogin(next);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Card>
        <Title>Welcome! Finish setting up your account</Title>
        <Body muted>{user.email ?? user.phone} is verified. Choose a password so next time you can log in without a code.</Body>
        {!user.name && <Field label="Your name" value={name} onChangeText={setName} maxLength={100} autoComplete="name" />}
        {!user.hasPassword && (
          <>
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              autoCapitalize="none"
              maxLength={128}
              hint={PASSWORD_HINT}
            />
            <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" autoCapitalize="none" />
          </>
        )}
        <Button
          title={busy ? 'Saving…' : 'Continue'}
          busy={busy}
          disabled={(!user.name && !name.trim()) || (!user.hasPassword && password.length < 8)}
          onPress={() => void submit()}
        />
        <ErrorText>{error}</ErrorText>
      </Card>
    </Screen>
  );
}
