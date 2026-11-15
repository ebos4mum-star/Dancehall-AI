import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { useEffect, useState } from 'react';
import { sanitizeNext } from '@dancehall/shared';
import { useAccount } from '@/account/AccountProvider';
import { useEntryTarget } from '@/account/useEntryTarget';
import { useApp } from '@/data/AppProvider';
import { PulseStage } from '@/pulse/PulseStage';
import { brand, spacing } from '@/theme/tokens';

/**
 * Entry: anyone may browse, so a guest goes straight to the app. A person with an account but no PIN is sent to set one (this also catches a setup that was
 * interrupted after the account was made), then onboarding, then back to whatever they were doing when the account screen appeared.
 */
export default function Index() {
  const { ready, session, profile, loadError, refresh } = useApp();
  const account = useAccount();
  const target = useEntryTarget();
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const finished = !!session && !!profile?.onboardedAt && account.ready && account.pinSet;
  useEffect(() => {
    if (!finished) return;
    let alive = true;
    void account
      .takePending()
      .then(
        (p) => alive && setNext(p && sanitizeNext(p.next) !== '/' ? sanitizeNext(p.next) : null),
      );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);
  if (!ready || (!!session && !account.ready)) {
    return (
      <View
        accessible
        accessibilityLabel="Loading"
        accessibilityLiveRegion="polite"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: brand.plum,
          gap: spacing.md,
        }}
      >
        <PulseStage state="idle" size={180} />
        <ActivityIndicator color={brand.lime} />
      </View>
    );
  }
  if (loadError && (!session || !profile)) {
    return (
      <Screen>
        <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl }}>
          <PulseStage state="encourage" size={180} />
          <AppText variant="title" accessibilityRole="header" style={{ textAlign: 'center' }}>
            {t('load.failedTitle')}
          </AppText>
          <AppText muted style={{ textAlign: 'center' }}>
            {t('load.failedBody')}
          </AppText>
          <Button label={t('common.retry')} onPress={() => void refresh()} />
        </View>
      </Screen>
    );
  }
  if (!session) return <Redirect href="/(tabs)" />;
  if (target) return <Redirect href={target} />;
  if (next === undefined) return null;
  return <Redirect href={(next ?? '/(tabs)') as never} />;
}
