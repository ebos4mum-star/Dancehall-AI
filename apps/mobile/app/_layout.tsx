import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider } from '@/data/AppProvider';
import { DraftProvider } from '@/food/draft';
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
        <DraftProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen
              name="progress"
              options={{ headerShown: true, title: t('progress.title') }}
            />
            <Stack.Screen name="goals" options={{ headerShown: true, title: t('goals.title') }} />
            <Stack.Screen
              name="privacy"
              options={{ headerShown: true, title: t('privacy.title') }}
            />
            <Stack.Screen
              name="food/camera"
              options={{ headerShown: true, title: t('cam.title') }}
            />
            <Stack.Screen
              name="food/review"
              options={{ headerShown: true, title: t('rev.title') }}
            />
            <Stack.Screen name="food/add" options={{ headerShown: true, title: t('add.title') }} />
            <Stack.Screen
              name="food/history"
              options={{ headerShown: true, title: t('hist.title') }}
            />
            <Stack.Screen
              name="food/saved"
              options={{ headerShown: true, title: t('saved.title') }}
            />
            <Stack.Screen
              name="food/swap"
              options={{ headerShown: true, title: t('swap.title') }}
            />
            <Stack.Screen
              name="food/plan"
              options={{ headerShown: true, title: t('plan.title') }}
            />
            <Stack.Screen
              name="dance/[id]"
              options={{ headerShown: true, title: t('tabs.dance') }}
            />
            <Stack.Screen
              name="dance/session"
              options={{ headerShown: true, title: t('ses.title') }}
            />
            <Stack.Screen
              name="dance/schedule"
              options={{ headerShown: true, title: t('sch.title') }}
            />
            <Stack.Screen
              name="dance/history"
              options={{ headerShown: true, title: t('hst.title') }}
            />
            <Stack.Screen
              name="dance/program"
              options={{ headerShown: true, title: t('dance.programs') }}
            />
            <Stack.Screen
              name="coach/settings"
              options={{ headerShown: true, title: t('coachset.title') }}
            />
            <Stack.Screen
              name="coach/review"
              options={{ headerShown: true, title: t('wr.title') }}
            />
          </Stack>
        </DraftProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
