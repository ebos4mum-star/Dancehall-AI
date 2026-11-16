import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { AccountProvider, useAccount } from '@/account/AccountProvider';
import { LockScreen } from '@/account/LockScreen';
import { AppProvider } from '@/data/AppProvider';
import { DraftProvider } from '@/food/draft';
import { CelebrationWatcher } from '@/celebrations/CelebrationWatcher';
import { MomentHost } from '@/pulse/MomentHost';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { useTheme } from '@/theme/useTheme';
import { useReducedMotion } from '@/a11y/useReducedMotion';
import { Screen } from '@/ui/Screen';

/** The app, covered by the lock screen (and hidden from screen readers) while a PIN is set and has not been entered. */
function LockLayer({ children }: { children: React.ReactNode }) {
  const { locked } = useAccount();
  return (
    <View style={{ flex: 1 }}>
      <View
        style={{ flex: 1 }}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={locked}
        aria-hidden={locked}
        pointerEvents={locked ? 'none' : 'auto'}
      >
        {children}
      </View>
      {locked ? <LockScreen /> : null}
    </View>
  );
}

export default function RootLayout() {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
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
        <AccountProvider>
          <LockLayer>
            <DraftProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  // Screens slide in for orientation; with reduced motion they simply appear.
                  animation: reduced ? 'none' : 'slide_from_right',
                  // Headers follow the theme so dark mode never shows a white bar.
                  headerStyle: { backgroundColor: colors.background },
                  headerTintColor: colors.text,
                  headerTitleStyle: { color: colors.text },
                  headerShadowVisible: false,
                  contentStyle: { backgroundColor: colors.background },
                }}
              >
                <Stack.Screen
                  name="progress"
                  options={{ headerShown: true, title: t('progress.title') }}
                />
                <Stack.Screen
                  name="goals"
                  options={{ headerShown: true, title: t('goals.title') }}
                />
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
                <Stack.Screen
                  name="food/add"
                  options={{ headerShown: true, title: t('add.title') }}
                />
                <Stack.Screen
                  name="food/history"
                  options={{ headerShown: true, title: t('hist.title') }}
                />
                <Stack.Screen
                  name="food/saved"
                  options={{ headerShown: true, title: t('saved.title') }}
                />
                <Stack.Screen
                  name="food/household"
                  options={{ headerShown: true, title: t('household.title') }}
                />
                <Stack.Screen
                  name="food/swap"
                  options={{ headerShown: true, title: t('swap.title') }}
                />
                <Stack.Screen
                  name="friends"
                  options={{ headerShown: true, title: t('social.title') }}
                />
                <Stack.Screen
                  name="food/fridge"
                  options={{ headerShown: true, title: t('fridge.title') }}
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
                  name="challenges"
                  options={{ headerShown: true, title: t('chal.title') }}
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
              <MomentHost />
              <CelebrationWatcher />
            </DraftProvider>
          </LockLayer>
        </AccountProvider>
      </AppProvider>
    </SafeAreaProvider>
  );
}
