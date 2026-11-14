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
import { View } from 'react-native';
import { PulseStage } from '@/pulse/PulseStage';
import { HeroScene } from '@/scene/HeroScene';
import { IconBadge, type IconName } from '@/ui/kit';
import { BigField } from '@/onboarding/kit';
import { brand, spacing } from '@/theme/tokens';

const PROMISES: { icon: IconName; fill: string; text: string }[] = [
  { icon: 'musical-notes', fill: brand.lime, text: 'Dance workouts you can start in a minute' },
  { icon: 'restaurant', fill: brand.coral, text: 'Food logging with no scores or shame' },
  { icon: 'sparkles', fill: brand.violet, text: 'A coach that only acts when you say so' },
];

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
    <Screen>
      <HeroScene world="today" height={360}>
        <View style={{ position: 'absolute', left: spacing.lg, right: 150, top: spacing.xl }}>
          <AppText
            variant="caption"
            style={{ color: brand.lime, fontWeight: '700', letterSpacing: 1.5 }}
          >
            DANCEHALL FIT
          </AppText>
          <AppText
            variant="title"
            accessibilityRole="header"
            style={{ color: brand.ivory, marginTop: spacing.xs }}
          >
            {t('signIn.title')}
          </AppText>
          <AppText style={{ color: brand.ivory, marginTop: spacing.sm }}>
            {t('signIn.subtitle')}
          </AppText>
        </View>
        <View style={{ position: 'absolute', right: -14, bottom: 8 }}>
          <PulseStage state="welcome" size={210} />
        </View>
      </HeroScene>
      <View style={{ gap: spacing.sm }}>
        {PROMISES.map((x) => (
          <View
            key={x.text}
            style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
          >
            <IconBadge name={x.icon} size={40} fill={x.fill} color={brand.plum} />
            <AppText style={{ flex: 1 }}>{x.text}</AppText>
          </View>
        ))}
      </View>
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
          <BigField
            icon="mail"
            label={t('signIn.emailLabel')}
            value={email}
            onChangeText={setEmail}
            editable={!sent}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          {sent ? (
            <>
              <AppText variant="caption" muted>
                {t('signIn.codeSent')}
              </AppText>
              <BigField
                icon="keypad"
                label={t('signIn.codeLabel')}
                value={code}
                onChangeText={(v) => setCode(normalizeCode(v))}
                keyboardType="number-pad"
                autoComplete="one-time-code"
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
