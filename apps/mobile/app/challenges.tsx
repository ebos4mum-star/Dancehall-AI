import { Ring } from '@/ui/motion';
import { showMoment } from '@/pulse/moment';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import {
  CHALLENGE_LENGTHS,
  challengeProgress,
  defaultTargetDays,
  maxTargetDays,
} from '@/challenges/logic';
import { t, type StringKey } from '@/i18n';
import { formatDate, todayIso } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { FoodHero } from '@/food/kit';
import { IconBadge, IconChoice } from '@/ui/kit';
import { brand } from '@/theme/tokens';
import { ProgressBar } from '@/ui/ProgressBar';
import { Screen } from '@/ui/Screen';
import { SkeletonList } from '@/ui/Skeleton';
import { haptics } from '@/ui/haptics';

export default function Challenges() {
  const { store, profile } = useApp();
  const { spacing, colors } = useTheme();
  const { data, error, loading } = useLoad(async (s) => ({
    challenges: await s.listChallenges(),
    sessions: await s.listSessions(),
  }));
  const [length, setLength] = useState<'7' | '14' | '30'>('7');
  const [target, setTarget] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const tz = profile?.timeZone ?? null;

  const active = data?.challenges.find((c) => c.status === 'active') ?? null;
  const past = (data?.challenges ?? []).filter((c) => c.status !== 'active');
  const progress = useMemo(
    () => (active ? challengeProgress(active, data?.sessions ?? [], tz, new Date()) : null),
    [active, data, tz],
  );

  // Reaching the goal completes the challenge once; a failed save is retried on the next load.
  const completing = useRef<string | null>(null);
  useEffect(() => {
    if (!active || !progress?.met || completing.current === active.id) return;
    completing.current = active.id;
    store
      .setChallengeStatus(active.id, 'completed')
      .then(() => haptics.celebrate())
      .catch(() => {
        completing.current = null;
      });
  }, [active, progress?.met, store]);

  const len = Number(length);
  const def = defaultTargetDays(len);
  const options = [...new Set([Math.max(1, def - 1), def, Math.min(maxTargetDays(len), def + 2)])];
  const chosen = Number(target ?? def);
  const safeChosen = options.includes(chosen) ? chosen : def;

  const run = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };

  return (
    <Screen>
      <FoodHero
        world="me"
        title={t('ban.challenges.title')}
        line={t('ban.challenges.line')}
        pulse={progress?.met ? 'celebrate' : 'encourage'}
        stats={
          progress
            ? [
                {
                  label: t('chal.activeDaysLabel'),
                  value: `${progress.activeDays} / ${progress.targetDays}`,
                },
                { label: t('chal.daysLeftLabel'), value: String(progress.daysLeft) },
              ]
            : []
        }
      />
      <AppText muted>{t('chal.intro')}</AppText>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {msg ? <Notice tone="warning">{msg}</Notice> : null}
      {loading && !data ? <SkeletonList label={t('common.loading')} cards={2} /> : null}

      {!data ? null : active && progress ? (
        <Card>
          <AppText variant="heading" accessibilityRole="header">
            {t('chal.activeTitle', { n: active.lengthDays })}
          </AppText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <Ring
              size={112}
              stroke={12}
              fraction={progress.fraction}
              color={colors.primary}
              track={colors.border}
            >
              <View
                accessible
                accessibilityLabel={t('chal.progress', {
                  done: progress.activeDays,
                  target: progress.targetDays,
                })}
                style={{ alignItems: 'center' }}
              >
                <AppText variant="title">{`${progress.activeDays}`}</AppText>
                <AppText variant="caption" muted>{`/ ${progress.targetDays}`}</AppText>
              </View>
            </Ring>
            <View style={{ flex: 1, gap: 4 }}>
              <AppText variant="label">
                {t('chal.progress', { done: progress.activeDays, target: progress.targetDays })}
              </AppText>
              <ProgressBar
                fraction={progress.fraction}
                label={t('chal.progress', {
                  done: progress.activeDays,
                  target: progress.targetDays,
                })}
              />
            </View>
          </View>
          {progress.met ? (
            <Notice>{t('chal.met')}</Notice>
          ) : progress.ended ? (
            <Notice>{t('chal.ended', { done: progress.activeDays })}</Notice>
          ) : (
            <AppText variant="caption" muted>
              {t('chal.daysLeft', { n: progress.daysLeft })} {t('chal.rest')}
            </AppText>
          )}
          {!progress.met ? (
            <Button
              variant="secondary"
              label={progress.ended ? t('chal.close') : t('chal.stop')}
              onPress={() => run(() => store.setChallengeStatus(active.id, 'abandoned'))}
            />
          ) : null}
        </Card>
      ) : (
        <Card>
          <AppText variant="heading" accessibilityRole="header">
            {t('chal.startTitle')}
          </AppText>
          <AppText variant="label">{t('chal.length')}</AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {CHALLENGE_LENGTHS.map((n) => (
              <View key={n} style={{ flex: 1 }}>
                <IconChoice
                  icon="calendar"
                  label={t('chal.days', { n })}
                  selected={length === String(n)}
                  onPress={() => {
                    setLength(String(n) as '7' | '14' | '30');
                    setTarget(null);
                  }}
                />
              </View>
            ))}
          </View>
          <AppText variant="label">{t('chal.target')}</AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {options.map((n) => (
              <View key={n} style={{ flex: 1 }}>
                <IconChoice
                  icon="flash"
                  label={t('chal.activeDays', { n })}
                  selected={safeChosen === n}
                  onPress={() => setTarget(String(n))}
                  tint={brand.lime}
                />
              </View>
            ))}
          </View>
          <AppText variant="caption" muted>
            {t('chal.targetNote', { max: maxTargetDays(len), length: len })}
          </AppText>
          <Button
            label={t('chal.start')}
            onPress={() =>
              run(async () => {
                await store.startChallenge({
                  lengthDays: len,
                  targetDays: safeChosen,
                  startDate: todayIso(),
                });
                haptics.capture();
                showMoment(t('moment.challengeStarted'), 'welcome');
              })
            }
          />
        </Card>
      )}

      {past.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="heading" accessibilityRole="header">
            {t('chal.history')}
          </AppText>
          {past.map((c) => (
            <Card key={c.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <IconBadge
                  name={c.status === 'completed' ? 'checkmark-circle' : 'pause-circle'}
                  size={36}
                  fill={c.status === 'completed' ? colors.successBg : brand.violet}
                  color={c.status === 'completed' ? colors.success : brand.plum}
                />
                <View style={{ flex: 1 }}>
                  <AppText variant="label">{`${t('chal.days', { n: c.lengthDays })} · ${formatDate(c.startDate)}`}</AppText>
                  <AppText variant="caption" muted>
                    {t(`chal.status.${c.status}` as StringKey)}
                  </AppText>
                </View>
              </View>
            </Card>
          ))}
        </View>
      ) : null}
      <AppText variant="caption" muted>
        {t('chal.communityNote')}
      </AppText>
    </Screen>
  );
}
