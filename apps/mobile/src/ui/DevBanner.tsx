import { View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { t } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

/** Always visible while the mock adapter is active, so synthetic data can never be mistaken for a real account. */
export function DevBanner() {
  const { config } = useApp();
  const { colors, spacing } = useTheme();
  if (config.authMode !== 'mock') return null;
  return (
    <View
      accessible
      accessibilityRole="alert"
      style={{
        backgroundColor: colors.warningBg,
        paddingVertical: spacing.xs,
        paddingHorizontal: spacing.md,
      }}
    >
      <AppText variant="caption" style={{ color: colors.warningText }}>
        {t('dev.banner')}
      </AppText>
    </View>
  );
}
