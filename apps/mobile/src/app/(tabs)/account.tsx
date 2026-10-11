import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Heading, LoadState, Notice, Screen } from '@/components/ui';
import { api, errorMessage, session } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { WEB_URL } from '@/lib/config';
import { goToLogin } from '@/lib/engagement';
import type { TokenPair } from '@/lib/types';

const PASSWORD_HINT = 'At least 8 characters. Very common passwords are not allowed.';

export default function AccountScreen() {
  const { user, meta } = useAuth();
  if (user === undefined) return <LoadState loading error={null}>{null}</LoadState>;
  if (!user) {
    return (
      <Screen>
        <Card>
          <Heading>Your account</Heading>
          <Body muted>Log in to save offers, follow shops, get notifications and run your shop on {meta.appName}.</Body>
          <Button title="Log in or sign up" onPress={() => goToLogin()} />
        </Card>
        <AboutCard />
      </Screen>
    );
  }
  return <Account />;
}

function Account() {
  const { user, reload, signOut, can } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(user?.name ?? '');
    setEmail(user?.email ?? '');
  }, [user]);
  if (!user) return null;

  async function save() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, string | null> = {};
      if (name.trim() && name.trim() !== user!.name) body.name = name.trim();
      if (email.trim() !== (user!.email ?? '')) body.email = email.trim() || null;
      if (Object.keys(body).length) await api('/users/me', { method: 'PATCH', body });
      await reload();
      setMessage('Saved.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function deleteAccount() {
    Alert.alert(
      'Delete your account?',
      'Your name, phone and email are erased, and shops you own are closed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await api('/auth/account', { method: 'DELETE' });
              await signOut();
              router.replace('/');
            } catch (e) {
              setError(errorMessage(e));
            }
          },
        },
      ],
    );
  }

  const isAdmin = can('audit:read') || can('businesses:verify') || can('offers:moderate');

  return (
    <Screen>
      <Card>
        <Heading>Your account</Heading>
        {user.phone && <Body muted>Phone: {user.phone}</Body>}
        <Field label="Name" value={name} onChangeText={setName} maxLength={100} />
        <Field
          label={`Email${user.email ? (user.emailVerified ? ' (verified)' : ' (not verified)') : ''}`}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Button title={busy ? 'Saving…' : 'Save'} busy={busy} onPress={() => void save()} />
        {message && <Notice tone="success">{message}</Notice>}
        <ErrorText>{error}</ErrorText>
      </Card>

      {user.hasPassword ? <ChangePassword /> : <SetPassword onDone={reload} />}

      <Card>
        <Button title="Notifications" variant="secondary" onPress={() => router.push('/notifications')} />
        <Button title="Notification settings" variant="secondary" onPress={() => router.push('/notification-settings')} />
        <Button title="Shops you follow" variant="secondary" onPress={() => router.push('/following')} />
      </Card>

      {isAdmin && (
        <Card>
          <Heading>Admin</Heading>
          <Body muted>Review queues, reports and settings are on the website (they need 2-step login).</Body>
          <Button title="Open admin on the website" variant="secondary" onPress={() => void Linking.openURL(`${WEB_URL}/admin`)} />
        </Card>
      )}

      <Card>
        <Button
          title="Log out"
          variant="secondary"
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
        />
        <Button title="Delete account" variant="danger" onPress={deleteAccount} />
      </Card>
      <AboutCard />
    </Screen>
  );
}

function AboutCard() {
  return (
    <Card>
      <Body muted small>Version {Constants.expoConfig?.version ?? '–'}</Body>
      <Button title="Privacy policy" variant="link" onPress={() => void Linking.openURL(`${WEB_URL}/privacy`)} style={{ alignSelf: 'flex-start' }} />
      <Button title="Terms of use" variant="link" onPress={() => void Linking.openURL(`${WEB_URL}/terms`)} style={{ alignSelf: 'flex-start' }} />
    </Card>
  );
}

function SetPassword({ onDone }: { onDone: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await api('/auth/password', { method: 'POST', body: { password } });
      await onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Heading>Set a password</Heading>
      <Body muted>Log in with a password instead of a code each time.</Body>
      <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" hint={PASSWORD_HINT} />
      <Field label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
      <Button title={busy ? 'Saving…' : 'Set password'} busy={busy} disabled={password.length < 8} onPress={() => void submit()} />
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function ChangePassword() {
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setMessage(null);
    if (password !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const tokens = await api<TokenPair>('/auth/password/change', {
        method: 'POST',
        body: { currentPassword: current, newPassword: password },
      });
      await session.set(tokens); // the old session ended; continue with the new one
      setCurrent('');
      setPassword('');
      setConfirm('');
      setMessage('Password changed. You were logged out on your other devices.');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <Heading>Change password</Heading>
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry autoCapitalize="none" autoComplete="current-password" />
      <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoComplete="new-password" hint={PASSWORD_HINT} />
      <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry autoCapitalize="none" autoComplete="new-password" />
      <Button title={busy ? 'Saving…' : 'Change password'} busy={busy} disabled={!current || password.length < 8} onPress={() => void submit()} />
      {message && <Notice tone="success">{message}</Notice>}
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
