import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';
import { DevBanner } from './DevBanner';

/** Standard screen: scrollable, keyboard-aware, safe-area padded. `title` is omitted on screens that show a navigation header. */
export function Screen({
  title,
  children,
  top = true,
}: {
  title?: string;
  children: ReactNode;
  top?: boolean;
}) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: top ? insets.top : 0 }}>
      <DevBanner />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            padding: spacing.md,
            gap: spacing.md,
            paddingBottom: spacing.xxl,
          }}
        >
          {title ? (
            <AppText variant="title" accessibilityRole="header">
              {title}
            </AppText>
          ) : null}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
