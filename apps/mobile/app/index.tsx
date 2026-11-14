import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { useApp } from '@/data/AppProvider';
import { PulseStage } from '@/pulse/PulseStage';
import { brand, spacing } from '@/theme/tokens';

/** Entry gate: sign in, then onboarding, then the app. */
export default function Index() {
  const { ready, session, profile, loadError, refresh } = useApp();
  if (!ready) {
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
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile?.onboardedAt) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
