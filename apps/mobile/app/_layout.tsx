import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/data/AppProvider';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Screen } from '@/ui/Screen';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <AppProvider
        fallback={(message) => (
          <Screen title={t('config.errorTitle')}>
            <AppText>{message}</AppText>
          </Screen>
        )}
      >
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen
            name="progress"
            options={{ headerShown: true, title: t('progress.title') }}
          />
          <Stack.Screen name="goals" options={{ headerShown: true, title: t('goals.title') }} />
          <Stack.Screen name="privacy" options={{ headerShown: true, title: t('privacy.title') }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  );
}
