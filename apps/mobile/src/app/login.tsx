import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Body, Button, Card, ErrorText, Field, Notice, Row, Screen, Segmented, Title } from '@/components/ui';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { leaveLogin, safeNext } from '@/lib/navigation';
import { needsMfa, type LoginOutcome, type LoginResult } from '@/lib/types';

type Method = 'email' | 'phone';
/** password: email/phone + password · code: one-time code (sign-up or no password) · reset: forgot password. */
type Mode = 'password' | 'code' | 'reset';


export default function LoginScreen() {
  const { meta, signIn } = useAuth();
  const params = useLocalSearchParams<{ next?: string }>();
  const next = safeNext(params.next);
  // Phone is the natural login in India; until real SMS delivery is live the default is email.
  const phoneReady = meta.loginMethods.phone?.available && meta.loginMethods.phone.delivery === 'sms';
  const [method, setMethod] = useState<Method>(phoneReady ? 'phone' : 'email');
  const [mode, setMode] = useState<Mode>('password');
  const [identity, setIdentity] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const delivery = meta.loginMethods[method]?.delivery;
  const idBody = () => ({ [method]: identity.trim() });

  function switchMode(m: Mode) {
    setMode(m);
    setCodeSent(false);
    setCode('');
    setError(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      done.current = false;
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function finish(result: LoginOutcome) {
    if (needsMfa(result)) {
      setMfaToken(result.mfaToken);
      return;
    }
    if (done.current) return;
    done.current = true;
    const user = await signIn(result);
    // New accounts, and accounts that never set a password, choose one (and a name) first.
    if (!user.hasPassword || (result.isNewUser && !user.name)) {
      router.replace(next ? { pathname: '/welcome', params: { next } } : '/welcome');
      return;
    }
    leaveLogin(next);
  }

  const requestCode = () =>
    run(async () => {
      const res = await api<{ resendAfterSeconds: number }>('/auth/otp/request', { method: 'POST', auth: false, body: idBody() });
      setCodeSent(true);
      setResendIn(res.resendAfterSeconds);
    });

  const loginWithPassword = () =>
    run(async () => {
      await finish(await api<LoginOutcome>('/auth/password/login', { method: 'POST', auth: false, body: { ...idBody(), password } }));
    });

  const loginWithCode = () =>
    run(async () => {
      await finish(await api<LoginOutcome>('/auth/otp/verify', { method: 'POST', auth: false, body: { ...idBody(), code: code.trim() } }));
    });

  const resetPassword = () =>
    run(async () => {
      await finish(
        await api<LoginOutcome>('/auth/password/reset', {
          method: 'POST',
          auth: false,
          body: { ...idBody(), code: code.trim(), newPassword },
        }),
      );
    });

  if (mfaToken) {
    return (
      <MfaStep
        busy={busy}
        error={error}
        onSubmit={(answer) =>
          run(async () => {
            await finish(await api<LoginResult>('/auth/mfa/verify', { method: 'POST', auth: false, body: { mfaToken, ...answer } }));
          })
        }
        onCancel={() => {
          setMfaToken(null);
          setError(null);
        }}
      />
    );
  }

  const title = mode === 'reset' ? 'Reset your password' : mode === 'code' ? 'Log in or sign up with a code' : `Log in to ${meta.appName}`;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Card>
          <Title>{title}</Title>
          <Segmented
            options={[
              { value: 'phone', label: 'Mobile number' },
              { value: 'email', label: 'Email' },
            ]}
            value={method}
            onChange={(m) => {
              if (codeSent) return;
              setMethod(m);
              setIdentity('');
            }}
          />
          <Field
            label={method === 'email' ? 'Email address' : 'Mobile number'}
            value={identity}
            onChangeText={setIdentity}
            editable={!codeSent}
            keyboardType={method === 'email' ? 'email-address' : 'phone-pad'}
            autoComplete={method === 'email' ? 'email' : 'tel'}
            textContentType={method === 'email' ? 'emailAddress' : 'telephoneNumber'}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={method === 'email' ? 'you@example.com' : '98450 12345'}
          />

          {mode === 'password' && (
            <>
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="current-password"
                textContentType="password"
                autoCapitalize="none"
                onSubmitEditing={() => void loginWithPassword()}
              />
              <Button title={busy ? 'Logging in…' : 'Log in'} busy={busy} disabled={!identity.trim() || !password} onPress={() => void loginWithPassword()} />
              <Row style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <Button title="Forgot password?" variant="link" onPress={() => switchMode('reset')} />
                <Button title="Log in with a code" variant="link" onPress={() => switchMode('code')} />
              </Row>
              <View style={{ borderTopWidth: 1, borderColor: '#f3f4f6', paddingTop: 12, gap: 8 }}>
                <Body muted small>
                  New here? We verify your {method === 'email' ? 'email' : 'number'} once with a code, then you choose a password.
                </Body>
                <Button title="Create an account" variant="secondary" onPress={() => switchMode('code')} />
              </View>
            </>
          )}

          {mode !== 'password' && !codeSent && (
            <>
              <Button title={busy ? 'Sending…' : 'Send code'} busy={busy} disabled={!identity.trim()} onPress={() => void requestCode()} />
              <Button title="Back to password login" variant="link" onPress={() => switchMode('password')} />
            </>
          )}

          {mode !== 'password' && codeSent && (
            <>
              <Body muted>
                We sent a 6-digit code to {identity}. It expires in 5 minutes.
              </Body>
              {delivery === 'server-log' && <Notice>Preview: codes are not delivered yet. Ask the team for the code from the server log.</Notice>}
              <Field
                label="Code"
                value={code}
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={8}
              />
              {mode === 'reset' && (
                <Field
                  label="New password"
                  value={newPassword}
                  onChangeText={setNewPassword}
                  secureTextEntry
                  autoComplete="new-password"
                  textContentType="newPassword"
                  autoCapitalize="none"
                  maxLength={128}
                  hint="At least 8 characters. Very common passwords are not allowed."
                />
              )}
              <Button
                title={busy ? 'Checking…' : mode === 'reset' ? 'Set new password and log in' : 'Log in'}
                busy={busy}
                disabled={code.trim().length < 4 || (mode === 'reset' && newPassword.length < 8)}
                onPress={() => void (mode === 'reset' ? resetPassword() : loginWithCode())}
              />
              <Row style={{ justifyContent: 'space-between' }}>
                <Button title={`Change ${method === 'email' ? 'email' : 'number'}`} variant="link" onPress={() => switchMode(mode)} />
                <Button
                  title={resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                  variant="link"
                  disabled={resendIn > 0 || busy}
                  onPress={() => void requestCode()}
                />
              </Row>
            </>
          )}
          <ErrorText>{error}</ErrorText>
        </Card>
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** Second login step for accounts with 2-step login on (admins, ADR-0018). */
function MfaStep({
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  onSubmit: (answer: { code: string } | { recoveryCode: string }) => void;
  onCancel: () => void;
}) {
  const [useRecovery, setUseRecovery] = useState(false);
  const [value, setValue] = useState('');
  const valid = useRecovery ? value.trim().length >= 8 : /^\d{6}$/.test(value.trim());
  return (
    <Screen>
      <Card>
        <Title>2-step login</Title>
        <Body muted>
          {useRecovery
            ? 'Enter one of the recovery codes you saved when you set up 2-step login. Each code works once.'
            : 'Open your authenticator app and enter the 6-digit code for this account.'}
        </Body>
        <Field
          label={useRecovery ? 'Recovery code' : 'Authenticator code'}
          value={value}
          onChangeText={setValue}
          keyboardType={useRecovery ? 'default' : 'number-pad'}
          autoCapitalize="none"
          maxLength={useRecovery ? 20 : 6}
        />
        <Button
          title={busy ? 'Checking…' : 'Continue'}
          busy={busy}
          disabled={!valid}
          onPress={() => onSubmit(useRecovery ? { recoveryCode: value.trim() } : { code: value.trim() })}
        />
        <Row style={{ justifyContent: 'space-between' }}>
          <Button
            title={useRecovery ? 'Use the authenticator app' : 'Use a recovery code'}
            variant="link"
            onPress={() => {
              setUseRecovery((r) => !r);
              setValue('');
            }}
          />
          <Button title="Cancel" variant="link" onPress={onCancel} />
        </Row>
        <ErrorText>{error}</ErrorText>
      </Card>
    </Screen>
  );
}
