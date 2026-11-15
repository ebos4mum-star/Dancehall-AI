import { withAccount } from '@/account/gate';
import { Ionicons } from '@expo/vector-icons';
import { IconBadge, SectionTitle } from '@/ui/kit';
import { EmptyState } from '@/ui/EmptyState';
import { brand } from '@/theme/tokens';
import { View } from 'react-native';
import { useState } from 'react';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { formatDate } from '@/lib/format';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Reveal } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';

function WeeklyReview() {
  const { store } = useApp();
  const { data: reviews } = useLoad(async (s) =>
    s.listWeeklyReviews ? s.listWeeklyReviews() : [],
  );
  const { data: usage } = useLoad(async (s) => (s.getAiUsage ? s.getAiUsage() : null));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const u = usage?.features.find((f) => f.feature === 'weekly_review');
  const generate = async () => {
    setBusy(true);
    setErr(null);
    try {
      await store.generateWeeklyReview!();
      haptics.success();
    } catch (e) {
      haptics.warning();
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      top={false}
      banner={{
        world: 'coach',
        title: t('ban.coachReview.title'),
        line: t('ban.coachReview.line'),
        pulse: 'idle',
      }}
    >
      <AppText muted>{t('wr.intro')}</AppText>
      <Notice tone="warning">{t('coach.mockBanner')}</Notice>
      {usage && !usage.personalization ? <Notice>{t('wr.needConsent')}</Notice> : null}
      <Button
        label={(reviews ?? []).length ? t('wr.regenerate') : t('wr.generate')}
        disabled={busy}
        onPress={generate}
      />
      {u ? (
        <AppText variant="caption" muted>
          {t('wr.usage', { used: u.used, allowance: u.allowance })}
        </AppText>
      ) : null}
      {err ? <Notice tone="warning">{err}</Notice> : null}
      {(reviews ?? []).length === 0 ? (
        <EmptyState icon="calendar" title={t('wr.emptyTitle')} body={t('wr.empty')} />
      ) : null}
      {(reviews ?? []).map((r, i) => (
        <Reveal key={r.id} delay={i * 40}>
          <DepthCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconBadge name="calendar" size={40} fill={brand.lime} />
              <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
                {t('wr.week', { date: formatDate(r.weekStart) })}
              </AppText>
            </View>
            <SectionTitle icon="sparkles" title={t('wr.highlights')} />
            {r.content.highlights.map((h) => (
              <AppText key={h}>{`• ${h}`}</AppText>
            ))}
            {r.content.nonScaleWins.length > 0 ? (
              <SectionTitle icon="trophy" title={t('wr.wins')} />
            ) : null}
            {r.content.nonScaleWins.map((h) => (
              <AppText key={h}>{`• ${h}`}</AppText>
            ))}
            {r.content.suggestions.length > 0 ? (
              <SectionTitle icon="bulb" title={t('wr.suggestions')} />
            ) : null}
            {r.content.suggestions.map((h) => (
              <AppText key={h} muted>{`• ${h}`}</AppText>
            ))}
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <Ionicons name="flask" size={14} color={brand.coral} />
              <AppText variant="caption" muted style={{ flex: 1 }}>
                {t('coach.simulated')}
              </AppText>
            </View>
          </DepthCard>
        </Reveal>
      ))}
    </Screen>
  );
}

/** Needs an account: a guest is sent to create one and then brought back here. */
export default withAccount(WeeklyReview, 'coach');
