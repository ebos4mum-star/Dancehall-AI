import { View } from 'react-native';
import { t } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from './AppText';

/** Marks any AI-derived nutrition value as an estimate. Required wherever a photo-based number is shown. */
export function EstimateBadge() {
  const { colors, radius, spacing } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={t('a11y.estimateBadge')}
      style={{
        alignSelf: 'flex-start',
        backgroundColor: colors.warningBg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: spacing.xs,
      }}
    >
      <AppText variant="caption" style={{ color: colors.warningText }}>
        {t('a11y.estimateBadge')}
      </AppText>
    </View>
  );
}
