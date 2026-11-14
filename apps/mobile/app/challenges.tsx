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
import { Choice } from '@/ui/Choice';
import { ProgressBar } from '@/ui/ProgressBar';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';

export default function Challenges() {
  const { store, profile } = useApp();
  const { spacing } = useTheme();
  const { data, error } = useLoad(async (s) => ({
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
      .then(() => haptics.success())
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
    <Screen top={false}>
      <AppText muted>{t('chal.intro')}</AppText>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {msg ? <Notice tone="warning">{msg}</Notice> : null}

      {active && progress ? (
        <Card>
          <AppText variant="heading" accessibilityRole="header">
            {t('chal.activeTitle', { n: active.lengthDays })}
          </AppText>
          <ProgressBar
            fraction={progress.fraction}
            label={t('chal.progress', { done: progress.activeDays, target: progress.targetDays })}
          />
          <AppText>
            {t('chal.progress', { done: progress.activeDays, target: progress.targetDays })}
          </AppText>
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
          <Choice
            label={t('chal.length')}
            value={length}
            onChange={(v) => {
              setLength(v);
              setTarget(null);
            }}
            options={CHALLENGE_LENGTHS.map((n) => ({
              value: String(n) as '7' | '14' | '30',
              label: t('chal.days', { n }),
            }))}
          />
          <Choice
            label={t('chal.target')}
            value={String(safeChosen)}
            onChange={setTarget}
            options={options.map((n) => ({ value: String(n), label: t('chal.activeDays', { n }) }))}
          />
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
              <AppText>{`${t('chal.days', { n: c.lengthDays })} · ${formatDate(c.startDate)}`}</AppText>
              <AppText variant="caption" muted>
                {t(`chal.status.${c.status}` as StringKey)}
              </AppText>
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
