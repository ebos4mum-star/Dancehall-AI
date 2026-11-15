import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { maintenanceSupport } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { useShowWeight, useWellness } from '@/wellness/hooks';
import { formatWeight } from '@/lib/format';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Banner';
import { DepthCard } from '@/ui/Depth';
import { Disclosure, SectionTitle } from '@/ui/kit';
import { useTheme } from '@/theme/useTheme';

/**
 * Sustainable weight-maintenance support: a gentle step to "keep my weight steady" when a goal is reached or progress has levelled off, and calm support while
 * maintaining. It renders nothing unless it applies (weight tracked on purpose, numbers not hidden). Switching goals is always the person's tap; history is untouched.
 */
export function MaintenanceCard() {
  const { profile } = useApp();
  const showW = useShowWeight();
  const w = useWellness();
  const { spacing } = useTheme();
  const [msg, setMsg] = useState<string | null>(null);
  const { data } = useLoad(async (s) => ({
    weights: await s.listWeights(),
    goals: await s.listGoals(),
  }));
  const goal = (data?.goals ?? [])
    .filter((g) => g.status === 'active')
    .sort((a, b) => a.endDate.localeCompare(b.endDate))[0];
  const m = useMemo(
    () =>
      maintenanceSupport({
        intent: w.targets.intent,
        weightShown: showW,
        weights: data?.weights ?? [],
        activeGoal: goal
          ? {
              type: goal.type,
              startKg: goal.startKg,
              targetKg: goal.targetKg,
              startDate: goal.startDate,
            }
          : null,
        now: new Date(),
      }),
    [w.targets.intent, showW, data?.weights, goal],
  );
  if (m.state === 'not_applicable') return null;
  const units = profile?.unitSystem ?? 'metric';
  return (
    <DepthCard>
      <SectionTitle icon="shield-checkmark" title={m.title} />
      <AppText>{m.body}</AppText>
      {m.band ? (
        <AppText variant="label">
          {t('maint.band', {
            low: formatWeight(m.band.lowKg, units),
            high: formatWeight(m.band.highKg, units),
          })}
        </AppText>
      ) : null}
      {m.offerMaintain ? (
        <View style={{ gap: spacing.xs }}>
          <Button
            label={t('maint.switch')}
            onPress={async () => {
              setMsg(null);
              try {
                await w.setPrefs({ goalIntent: 'maintain', goalChosen: true });
              } catch (e) {
                setMsg(errorMessage(e));
              }
            }}
          />
          <AppText variant="caption" muted>
            {t('maint.switchNote')}
          </AppText>
        </View>
      ) : null}
      {msg ? <Notice tone="warning">{msg}</Notice> : null}
      {m.education.length > 0 ? (
        <Disclosure title={t('maint.about')}>
          {m.education.map((e) => (
            <AppText key={e} variant="caption" muted>
              {e}
            </AppText>
          ))}
        </Disclosure>
      ) : null}
      <AppText variant="caption" muted>
        {t('maint.provisional')}
      </AppText>
    </DepthCard>
  );
}
