import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { isGateIntent, sanitizeNext } from '@dancehall/shared';
import { useAccount } from '@/account/AccountProvider';
import { useOnce } from '@/account/gate';
import { useApp } from '@/data/AppProvider';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';

/**
 * Where a guest lands when they reach something that needs an account. It says what they were trying to do, how the account works (a PIN, no email, no password),
 * and never pretends an account exists when this build cannot create one. What they were doing is kept, so they return to it after setup.
 */
export default function AccountStart() {
  const params = useLocalSearchParams<{ next?: string; intent?: string }>();
  const { ready, session, store, config } = useApp();
  const account = useAccount();
  const [haveOpen, setHaveOpen] = useState(false);
  const next = sanitizeNext(params.next);
  const intent = isGateIntent(params.intent) ? params.intent : 'profile';
  // A new account can be created only where the data store can create one. A build that has no way to create a cloud account yet says so, and creates nothing.
  const canCreate = typeof store.signInDev === 'function';
  const expired = account.ready && account.pinSet && !session;

  useOnce(() => {
    if (next) void account.setPending(next, intent);
  });

  if (ready && session) return <Redirect href="/" />;

  const leave = () => {
    void account.clearPending();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <Screen top>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="title" accessibilityRole="header">
          {expired ? t('gate.expiredTitle') : t('gate.title')}
        </AppText>
        {expired ? (
          <AppText>{t('gate.expiredBody')}</AppText>
        ) : (
          <>
            {params.intent ? (
              <AppText variant="heading">
                {t('gate.reason', { action: t(`gate.intent.${intent}` as StringKey) })}
              </AppText>
            ) : null}
            <AppText>{t('gate.body')}</AppText>
            <AppText muted>{t('gate.how')}</AppText>
          </>
        )}
      </View>
      <Notice>{t('signIn.adultsOnly')}</Notice>
      {expired ? (
        <Card>
          <Notice tone="warning">{t('gate.expiredUnavailable')}</Notice>
          <Button
            variant="secondary"
            label={t('gate.expiredReset')}
            onPress={() => void account.signOutDevice()}
          />
        </Card>
      ) : canCreate ? (
        <Card>
          <Button
            label={t('gate.create')}
            onPress={() => router.push('/account/pin?mode=create')}
          />
          <Button
            variant="secondary"
            label={t('gate.have')}
            onPress={() => setHaveOpen((v) => !v)}
          />
          {haveOpen ? <Notice>{t('gate.haveBody')}</Notice> : null}
        </Card>
      ) : (
        <Card>
          <AppText variant="heading" accessibilityRole="header">
            {t('gate.unavailableTitle')}
          </AppText>
          <AppText>{t('gate.unavailableBody')}</AppText>
          {config.appEnv === 'development' && config.authMode === 'supabase' ? (
            <Button
              variant="secondary"
              label={t('gate.dev')}
              onPress={() => router.push('/sign-in')}
            />
          ) : null}
        </Card>
      )}
      <Button variant="secondary" label={t('gate.browse')} onPress={leave} />
    </Screen>
  );
}
