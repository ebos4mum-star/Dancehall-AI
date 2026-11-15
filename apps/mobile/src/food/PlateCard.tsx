import { useMemo } from 'react';
import { View } from 'react-native';
import { plateGuidance } from '@dancehall/shared';
import { useFoodData } from '@/food/hooks';
import { useNumbersHidden, useWellness } from '@/wellness/hooks';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { DepthCard } from '@/ui/Depth';
import { Disclosure, SectionTitle } from '@/ui/kit';
import { ProgressBar } from '@/ui/ProgressBar';
import { useTheme } from '@/theme/useTheme';

/**
 * Protein, fibre and balanced-plate guidance on the Food tab. It reuses the day's diary and the person's own protein range from the calorie engine; nothing is stored.
 * With hidden numbers it shows only the static plate picture. Provisional and not medical advice.
 */
export function PlateCard() {
  const { todayLogs } = useFoodData();
  const hidden = useNumbersHidden();
  const w = useWellness();
  const { colors, spacing } = useTheme();
  const g = useMemo(
    () =>
      plateGuidance({
        items: todayLogs.flatMap((l) => l.items),
        proteinRange: w.targets.proteinG,
        hidden,
      }),
    [todayLogs, w.targets.proteinG, hidden],
  );
  return (
    <DepthCard>
      <SectionTitle icon="restaurant" title={t('plate.title')} />
      <View style={{ gap: spacing.xs }}>
        {g.model.map((m) => (
          <AppText key={m.id} variant="label" style={{ color: colors.text }}>
            {`${m.share[0]!.toUpperCase()}${m.share.slice(1)}: ${m.label}`}
          </AppText>
        ))}
      </View>
      <AppText variant="caption" muted>
        {g.note}
      </AppText>
      {!g.hidden && g.protein ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">{t('plate.protein')}</AppText>
          <ProgressBar fraction={g.protein.fraction} label={g.protein.message} />
          <AppText variant="caption" muted>
            {g.protein.message}
          </AppText>
        </View>
      ) : null}
      {!g.hidden && g.fibre ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">{t('plate.fibre')}</AppText>
          <AppText variant="caption" muted>
            {g.fibre.message}
          </AppText>
        </View>
      ) : null}
      {g.nudges.map((n) => (
        <AppText key={n} variant="caption" style={{ color: colors.text }}>
          {n}
        </AppText>
      ))}
      {!g.hidden && g.coverage.total > 0 && g.coverage.classified < g.coverage.total ? (
        <AppText variant="caption" muted>
          {t('plate.coverage', { n: g.coverage.classified, total: g.coverage.total })}
        </AppText>
      ) : null}
      <Disclosure title={t('plate.about')}>
        <AppText variant="caption" muted>
          {t('plate.aboutBody')}
        </AppText>
      </Disclosure>
    </DepthCard>
  );
}
