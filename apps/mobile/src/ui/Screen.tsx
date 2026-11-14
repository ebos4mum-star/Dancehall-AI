import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  const { colors, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: spacing.md,
          paddingTop: insets.top + spacing.md,
          gap: spacing.md,
        }}
      >
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {children}
      </ScrollView>
    </View>
  );
}
