import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { useApp } from '@/data/AppProvider';
import { useTheme } from '@/theme/useTheme';

/** Entry gate: sign in, then onboarding, then the app. */
export default function Index() {
  const { ready, session, profile, loadError, refresh } = useApp();
  const { colors } = useTheme();
  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />
      </View>
    );
  }
  if (loadError && (!session || !profile)) {
    return (
      <Screen title={t('load.failedTitle')}>
        <AppText muted>{t('load.failedBody')}</AppText>
        <Button label={t('common.retry')} onPress={() => void refresh()} />
      </Screen>
    );
  }
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile?.onboardedAt) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
