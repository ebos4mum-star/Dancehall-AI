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

export default function WeeklyReview() {
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
    <Screen top={false}>
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
      {(reviews ?? []).length === 0 ? <AppText muted>{t('wr.empty')}</AppText> : null}
      {(reviews ?? []).map((r, i) => (
        <Reveal key={r.id} delay={i * 40}>
          <DepthCard>
            <AppText variant="heading" accessibilityRole="header">
              {t('wr.week', { date: formatDate(r.weekStart) })}
            </AppText>
            <AppText variant="label">{t('wr.highlights')}</AppText>
            {r.content.highlights.map((h) => (
              <AppText key={h}>{`• ${h}`}</AppText>
            ))}
            {r.content.nonScaleWins.length > 0 ? (
              <AppText variant="label">{t('wr.wins')}</AppText>
            ) : null}
            {r.content.nonScaleWins.map((h) => (
              <AppText key={h}>{`• ${h}`}</AppText>
            ))}
            {r.content.suggestions.length > 0 ? (
              <AppText variant="label">{t('wr.suggestions')}</AppText>
            ) : null}
            {r.content.suggestions.map((h) => (
              <AppText key={h} muted>{`• ${h}`}</AppText>
            ))}
            <AppText variant="caption" muted>
              {t('coach.simulated')}
            </AppText>
          </DepthCard>
        </Reveal>
      ))}
    </Screen>
  );
}
