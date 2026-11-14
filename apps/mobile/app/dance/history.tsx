import { View } from 'react-native';
import { useDanceData } from '@/dance/hooks';
import { effortKey } from '@/dance/meta';
import { ActivityBars } from '@/dance/ui';
import { t, type StringKey } from '@/i18n';
import { formatDate } from '@/lib/format';
import { sessionMinutes } from '@dancehall/shared';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';

export default function History() {
  const { sessions, summary, error } = useDanceData();
  const done = sessions
    .filter((s) => s.status === 'completed')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  return (
    <Screen top={false}>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {done.length === 0 ? <Notice>{t('hst.empty')}</Notice> : null}
      <DepthCard>
        <AppText variant="heading" accessibilityRole="header">
          {t('hst.thisWeek')}
        </AppText>
        <AppText>{`${t('hst.sessions', { n: summary.thisWeek.sessions })} · ${t('hst.minutes', { n: summary.thisWeek.minutes })} · ${t('hst.days', { n: summary.thisWeek.activeDays })}`}</AppText>
        <AppText variant="caption" muted>
          {t('hst.weeks')}
        </AppText>
        <ActivityBars summary={summary} />
        <AppText variant="caption" muted>
          {t('hst.gentle')}
        </AppText>
      </DepthCard>
      {done.length > 0 ? (
        <AppText variant="heading" accessibilityRole="header">
          {t('hst.recent')}
        </AppText>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        {done.slice(0, 30).map((s) => {
          const k = effortKey(s.perceivedExertion);
          return (
            <DepthCard key={s.id}>
              <AppText variant="label">{s.title}</AppText>
              <AppText
                variant="caption"
                muted
              >{`${s.completedAt ? formatDate(s.completedAt) : ''} · ${t('hst.minutes', { n: sessionMinutes(s) })}${s.lowImpact ? ` · ${t('impact.low')}` : ''}${k ? ` · ${t('hst.felt', { label: t(`ses.effort.${k}` as StringKey).toLowerCase() })}` : ''}`}</AppText>
            </DepthCard>
          );
        })}
      </View>
    </Screen>
  );
}
