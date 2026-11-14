import { View } from 'react-native';
import { IconBadge, InfoTile, SectionTitle } from '@/ui/kit';
import { STYLE_ICON } from '@/dance/meta';
import { STYLE_META } from '@/dance/meta';
import { WORKOUT_BY_ID } from '@dancehall/shared';
import { router } from 'expo-router';
import { useDanceData } from '@/dance/hooks';
import { effortKey } from '@/dance/meta';
import { ActivityBars } from '@/dance/ui';
import { t, type StringKey } from '@/i18n';
import { formatDate } from '@/lib/format';
import { sessionMinutes } from '@dancehall/shared';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { DepthCard } from '@/ui/Depth';
import { EmptyState } from '@/ui/EmptyState';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { SkeletonList } from '@/ui/Skeleton';

export default function History() {
  const { sessions, summary, error, loading } = useDanceData();
  const done = sessions
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return (
    <Screen
      top={false}
      banner={{
        world: 'dance',
        title: t('ban.danceHistory.title'),
        line: t('ban.danceHistory.line'),
        pulse: 'dance',
      }}
    >
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {loading && sessions.length === 0 ? (
        <SkeletonList label={t('common.loading')} cards={2} />
      ) : null}
      {!loading && done.length === 0 ? (
        <EmptyState
          icon="musical-notes-outline"
          title={t('hst.emptyTitle')}
          body={t('hst.empty')}
          actionLabel={t('hst.emptyCta')}
          onAction={() => router.replace('/(tabs)/dance')}
        />
      ) : null}
      <SectionTitle icon="calendar" title={t('hst.thisWeek')} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <InfoTile
          icon="musical-notes"
          label={t('hst.sessionsLabel')}
          value={String(summary.thisWeek.sessions)}
        />
        <InfoTile
          icon="time"
          label={t('hst.minutesLabel')}
          value={String(summary.thisWeek.minutes)}
        />
        <InfoTile
          icon="sunny"
          label={t('hst.daysLabel')}
          value={String(summary.thisWeek.activeDays)}
        />
      </View>
      <DepthCard>
        <AppText variant="caption" muted>
          {t('hst.weeks')}
        </AppText>
        <ActivityBars summary={summary} />
        <AppText variant="caption" muted>
          {t('hst.gentle')}
        </AppText>
      </DepthCard>
      {done.length > 0 ? <SectionTitle icon="list" title={t('hst.recent')} /> : null}
      <View style={{ gap: spacing.sm }}>
        {done.slice(0, 30).map((s) => {
          const k = effortKey(s.perceivedExertion);
          const style = WORKOUT_BY_ID.get(s.workoutId ?? '')?.style ?? null;
          const tint = style ? STYLE_META[style].from : undefined;
          return (
            <DepthCard key={s.id}>
              <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
                <IconBadge
                  name={style ? STYLE_ICON[style] : 'musical-notes'}
                  size={44}
                  fill={tint ?? '#9D80EB'}
                  color="#FFFFFF"
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="label">{s.title}</AppText>
                  <AppText
                    variant="caption"
                    muted
                  >{`${s.completedAt ? formatDate(s.completedAt) : ''} · ${t('hst.minutes', { n: sessionMinutes(s) })}${s.lowImpact ? ` · ${t('impact.low')}` : ''}${k ? ` · ${t('hst.felt', { label: t(`ses.effort.${k}` as StringKey).toLowerCase() })}` : ''}`}</AppText>
                </View>
              </View>
            </DepthCard>
          );
        })}
      </View>
    </Screen>
  );
}
