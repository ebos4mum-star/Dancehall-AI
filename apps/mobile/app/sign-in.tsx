import { useEffect, useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { t } from '@/i18n';
import {
  RESEND_COOLDOWN_SECONDS,
  isCompleteCode,
  isValidEmail,
  normalizeCode,
  normalizeEmail,
} from '@/lib/signIn';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

export default function SignIn() {
  const { store, config, refresh, ready, session } = useApp();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    if (!isValidEmail(email)) {
      setError(t('signIn.invalidEmail'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await store.sendEmailCode?.(normalizeEmail(email));
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (ready && session) return <Redirect href="/" />;

  return (
    <Screen title={t('signIn.title')}>
      <AppText muted>{t('signIn.subtitle')}</AppText>
      <Notice>{t('signIn.adultsOnly')}</Notice>
      {config.authMode === 'mock' ? (
        <Card>
          <Button
            label={t('signIn.devButton')}
            disabled={busy}
            onPress={() => run(async () => void (await store.signInDev?.()))}
          />
          <AppText variant="caption" muted>
            {t('signIn.devNote')}
          </AppText>
        </Card>
      ) : (
        <Card>
          <TextField
            label={t('signIn.emailLabel')}
            value={email}
            onChangeText={setEmail}
            editable={!sent}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
          {sent ? (
            <>
              <AppText variant="caption" muted>
                {t('signIn.codeSent')}
              </AppText>
              <TextField
                label={t('signIn.codeLabel')}
                value={code}
                onChangeText={(v) => setCode(normalizeCode(v))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={8}
              />
              <Button
                label={t('signIn.verify')}
                disabled={busy || !isCompleteCode(code)}
                onPress={() =>
                  run(async () => void (await store.verifyEmailCode?.(normalizeEmail(email), code)))
                }
              />
              <Button
                label={cooldown > 0 ? t('signIn.resendIn', { n: cooldown }) : t('signIn.resend')}
                variant="secondary"
                disabled={busy || cooldown > 0}
                onPress={sendCode}
              />
              <Button
                label={t('signIn.changeEmail')}
                variant="secondary"
                disabled={busy}
                onPress={() => {
                  setSent(false);
                  setCode('');
                  setError(null);
                }}
              />
            </>
          ) : (
            <Button
              label={t('signIn.sendCode')}
              disabled={busy || !email.trim()}
              onPress={sendCode}
            />
          )}
        </Card>
      )}
      {error ? <Notice tone="warning">{error}</Notice> : null}
    </Screen>
  );
}
