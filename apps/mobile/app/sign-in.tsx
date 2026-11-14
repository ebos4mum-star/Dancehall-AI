import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { t } from '@/i18n';
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
                onChangeText={setCode}
                keyboardType="number-pad"
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                maxLength={8}
              />
              <Button
                label={t('signIn.verify')}
                disabled={busy || code.length < 6}
                onPress={() =>
                  run(async () => void (await store.verifyEmailCode?.(email.trim(), code.trim())))
                }
              />
            </>
          ) : (
            <Button
              label={t('signIn.sendCode')}
              disabled={busy || !email.includes('@')}
              onPress={async () => {
                setBusy(true);
                setError(null);
                try {
                  await store.sendEmailCode?.(email.trim());
                  setSent(true);
                } catch (e) {
                  setError(errorMessage(e));
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}
        </Card>
      )}
      {error ? <Notice tone="warning">{error}</Notice> : null}
    </Screen>
  );
}
