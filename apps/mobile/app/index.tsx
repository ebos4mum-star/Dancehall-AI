import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useApp } from '@/data/AppProvider';
import { useTheme } from '@/theme/useTheme';

/** Entry gate: sign in, then onboarding, then the app. */
export default function Index() {
  const { ready, session, profile } = useApp();
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
  if (!session) return <Redirect href="/sign-in" />;
  if (!profile?.onboardedAt) return <Redirect href="/onboarding" />;
  return <Redirect href="/(tabs)" />;
}
