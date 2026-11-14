import { View } from 'react-native';
import { formatDate } from '@/lib/format';
import { t, type StringKey } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import type { Achievement, AchievementId, WeeklyHabits } from './achievements';

const title = (id: AchievementId) => t(`ach.${id}.title` as StringKey);
const body = (id: AchievementId) => t(`ach.${id}.body` as StringKey);

/** Seven days, two rows (moved / logged food). Filled = happened. An empty dot is simply an empty dot: no red, no "missed". */
export function HabitWeek({ habits }: { habits: WeeklyHabits }) {
  const { colors, spacing } = useTheme();
  const row = (label: string, pick: (d: WeeklyHabits['days'][number]) => boolean) => (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      accessible
      accessibilityLabel={`${label}: ${habits.days.filter(pick).length} / 7`}
    >
      <AppText variant="caption" muted style={{ width: 92 }}>
        {label}
      </AppText>
      {habits.days.map((d) => (
        <View
          key={d.date}
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: pick(d) ? colors.primary : 'transparent',
            borderWidth: 1.5,
            borderColor: pick(d) ? colors.primary : colors.border,
          }}
        />
      ))}
    </View>
  );
  return (
    <View style={{ gap: spacing.sm }}>
      {row(t('habit.moved'), (d) => d.moved)}
      {row(t('habit.logged'), (d) => d.logged)}
      <AppText variant="caption" muted>
        {t('habit.summary', { moved: habits.movedDays, logged: habits.loggedDays })}
      </AppText>
    </View>
  );
}

/** Private celebration: shown only to the person, never shared. */
export function Celebration({ ids }: { ids: AchievementId[] }) {
  const { colors } = useTheme();
  if (ids.length === 0) return null;
  const id = ids[0]!;
  return (
    <FadeIn>
      <Card>
        <AppText variant="label" style={{ color: colors.primary }} accessibilityLiveRegion="polite">
          {t('ach.new')}
        </AppText>
        <AppText variant="heading">{title(id)}</AppText>
        <AppText muted>{body(id)}</AppText>
      </Card>
    </FadeIn>
  );
}

export function AchievementList({ items }: { items: Achievement[] }) {
  const { spacing } = useTheme();
  return (
    <Card>
      <AppText variant="heading" accessibilityRole="header">
        {t('ach.title')}
      </AppText>
      {items.length === 0 ? <AppText muted>{t('ach.empty')}</AppText> : null}
      {items.map((a) => (
        <View key={a.id} style={{ gap: spacing.xs }} accessible>
          <AppText>{title(a.id)}</AppText>
          <AppText
            variant="caption"
            muted
          >{`${body(a.id)} ${t('ach.earnedOn', { date: formatDate(a.earnedOn) })}`}</AppText>
        </View>
      ))}
      <AppText variant="caption" muted>
        {t('ach.note')}
      </AppText>
    </Card>
  );
}
