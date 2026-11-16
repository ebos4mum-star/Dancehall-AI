import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GM, type BadgeId, type CosmeticId, type Quest } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import type { GmLeagueRow } from '@/data/types';
import { t, type StringKey } from '@/i18n';
import { showMoment } from '@/pulse/moment';
import { spacing, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Card } from '@/ui/Card';
import { SectionTitle } from '@/ui/kit';
import { useCountUp } from '@/ui/motion';
import { ProgressBar } from '@/ui/ProgressBar';
import { SettingRow } from '@/ui/SettingRow';
import { haptics } from '@/ui/haptics';

import { useGamification, type Progression } from './useGamification';

/** Renders nothing for guests, while loading, or when the person switched progression off. Rewards are never forced on anyone. */
function useShown(): Progression | null {
  const p = useGamification();
  return p.enabled && p.ready ? p : null;
}

function QuestRow({ q }: { q: Quest }) {
  const { colors } = useTheme();
  const label = t(`gm.q.${q.id}` as StringKey);
  return (
    <View
      accessible
      accessibilityLabel={`${label}. ${q.done ? t('gm.questDone') : t('gm.questProgress', { a: q.progress, b: q.goal })}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: MIN_TOUCH_TARGET,
      }}
    >
      <Ionicons
        name={q.done ? 'checkmark-circle' : 'ellipse-outline'}
        size={24}
        color={q.done ? colors.primary : colors.textMuted}
      />
      <AppText style={{ flex: 1 }}>{label}</AppText>
      <AppText variant="caption" muted>
        {q.done ? t('gm.questDone') : t('gm.questProgress', { a: q.progress, b: q.goal })}
      </AppText>
    </View>
  );
}

/** Home: level, XP, streak with rest days, today's quests. Congratulates a new level once, with a haptic and Pulse. */
export function ProgressionCard() {
  const p = useShown();
  const { session } = useApp();
  const xp = useCountUp(p?.state.totalXp ?? 0);
  const celebrated = useRef(false);
  useEffect(() => {
    if (!p || celebrated.current || !session) return;
    const lvl = p.state.level.level;
    if (lvl > p.prefs.levelSeen) {
      celebrated.current = true;
      haptics.celebrate();
      showMoment(t('gm.levelUp', { n: lvl }), 'celebrate');
      void p.setPrefs({ levelSeen: lvl });
    } else if (lvl < p.prefs.levelSeen) void p.setPrefs({ levelSeen: lvl });
  }, [p, session]);
  // A quest finishing while you are looking at the screen gets a small haptic (never on first load, so opening the app is quiet).
  const doneCount = p ? p.state.dailyQuests.filter((q) => q.done).length : null;
  const lastDone = useRef<number | null>(null);
  useEffect(() => {
    if (doneCount === null) return;
    if (lastDone.current !== null && doneCount > lastDone.current) haptics.success();
    lastDone.current = doneCount;
  }, [doneCount]);
  if (!p) return null;
  const { level, streak, dailyQuests, restNudge } = p.state;
  const next = Math.min(GM.MAX_LEVEL, level.level + 1);
  const top = level.level >= GM.MAX_LEVEL;
  const status =
    streak.todayKind === 'active'
      ? t('gm.activeToday')
      : streak.todayKind === 'rest'
        ? t('gm.restToday')
        : t('gm.openToday');
  return (
    <Card>
      <SectionTitle icon="trophy" title={t('gm.title')} />
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
        <AppText variant="title" accessibilityLabel={t('gm.level', { n: level.level })}>
          {t('gm.level', { n: level.level })}
        </AppText>
        <AppText muted>{t('gm.xp', { n: xp })}</AppText>
      </View>
      <ProgressBar
        fraction={level.fraction}
        label={t('gm.barLabel', { n: level.level, pct: Math.round(level.fraction * 100), next })}
      />
      <AppText variant="caption" muted>
        {top
          ? t('gm.maxLevel')
          : t('gm.xpToNext', { n: Math.max(0, level.xpForNext - level.xpInto), next })}
      </AppText>
      <AppText variant="label">
        {streak.current > 0 ? t('gm.streakDays', { n: streak.current }) : t('gm.streakNone')}
      </AppText>
      <AppText variant="caption" muted>
        {status} {t('gm.weekTarget', { n: streak.activeDaysThisWeek, total: streak.targetDays })}
      </AppText>
      {restNudge ? <Notice>{t('gm.restNudge')}</Notice> : null}
      <AppText variant="label" accessibilityRole="header">
        {t('gm.quests')}
      </AppText>
      {dailyQuests.map((q) => (
        <QuestRow key={q.id} q={q} />
      ))}
      <AppText variant="caption" muted>
        {t('gm.xpNote')}
      </AppText>
    </Card>
  );
}

/** Workouts: this week's target and quests, beside the workouts themselves. */
export function MovementProgressCard() {
  const p = useShown();
  if (!p) return null;
  const { streak, weeklyQuests, restNudge } = p.state;
  return (
    <Card>
      <SectionTitle icon="flame" title={t('gm.weekQuests')} />
      <ProgressBar
        fraction={
          streak.targetDays ? Math.min(1, streak.activeDaysThisWeek / streak.targetDays) : 0
        }
        label={t('gm.weekTarget', { n: streak.activeDaysThisWeek, total: streak.targetDays })}
      />
      <AppText variant="caption" muted>
        {t('gm.weekTarget', { n: streak.activeDaysThisWeek, total: streak.targetDays })}
        {streak.isPlannedRestToday ? ` ${t('gm.restToday')}` : ''}
      </AppText>
      {weeklyQuests.map((q) => (
        <QuestRow key={q.id} q={q} />
      ))}
      {restNudge ? <Notice>{t('gm.restNudge')}</Notice> : null}
    </Card>
  );
}

/** Nutrition: only the "log a meal" quest, when it is one of today's. It rewards logging, never what or how much was eaten. */
export function MealQuestChip() {
  const p = useShown();
  const q = p?.state.dailyQuests.find((x) => x.id === 'log_a_meal');
  if (!p || !q) return null;
  return (
    <Card>
      <QuestRow q={q} />
    </Card>
  );
}

/** Progress: badges, the season challenge and Pulse's wardrobe. Nothing here is ever lost. */
export function BadgesCard() {
  const p = useShown();
  if (!p) return null;
  const { badges, seasonal, cosmetics } = p.state;
  return (
    <Card>
      <SectionTitle icon="ribbon" title={t('gm.badges')} />
      {badges.length === 0 ? (
        <AppText muted>{t('gm.badgesNone')}</AppText>
      ) : (
        (badges as BadgeId[]).map((b) => (
          <AppText key={b} accessibilityLabel={t(`gm.b.${b}` as StringKey)}>
            {t(`gm.b.${b}` as StringKey)}
          </AppText>
        ))
      )}
      <AppText variant="label" accessibilityRole="header">
        {t('gm.season')}
      </AppText>
      <ProgressBar
        fraction={Math.min(1, seasonal.activeDays / Math.max(1, seasonal.goalDays))}
        label={t('gm.seasonProgress', { a: seasonal.activeDays, b: seasonal.goalDays })}
      />
      <AppText variant="caption" muted>
        {seasonal.done
          ? t('gm.seasonDone')
          : t('gm.seasonProgress', { a: seasonal.activeDays, b: seasonal.goalDays })}
      </AppText>
      <AppText variant="label" accessibilityRole="header">
        {t('gm.cosmetics')}
      </AppText>
      <AppText muted>
        {cosmetics.length === 0
          ? t('gm.cosmeticsNone')
          : (cosmetics as CosmeticId[]).map((c) => t(`gm.c.${c}` as StringKey)).join(', ')}
      </AppText>
    </Card>
  );
}

/** Friends: the optional weekly league. A username and one number; joining is a switch the person controls. */
export function LeagueCard() {
  const p = useGamification();
  const { store } = useApp();
  const [joined, setJoined] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const league = useLoad(async (s) => (s.gmLeague ? s.gmLeague() : ([] as GmLeagueRow[])));
  useEffect(() => {
    if (league.data) setJoined(league.data.length > 0);
  }, [league.data]);
  if (!p.enabled || !store.gmSetLeague) return null;
  const rows = league.data ?? [];
  const on = joined ?? false;
  return (
    <Card>
      <SectionTitle icon="podium" title={t('gm.league')} />
      <AppText muted>{t('gm.leagueBody')}</AppText>
      <SettingRow
        icon="people"
        title={t('gm.leagueJoin')}
        body={t('gm.leagueJoinBody')}
        value={on}
        disabled={busy}
        onChange={async (v) => {
          setBusy(true);
          setErr(null);
          const r = await store.gmSetLeague!(v);
          setBusy(false);
          if (!r.ok) return setErr(t('gm.leagueError'));
          setJoined(v);
          league.reload();
        }}
      />
      {err || league.error ? <Notice tone="warning">{err ?? t('gm.leagueError')}</Notice> : null}
      {on && rows.length <= 1 ? <AppText muted>{t('gm.leagueEmpty')}</AppText> : null}
      {on
        ? rows.map((r, i) => (
            <AppText
              key={r.username}
              accessibilityLabel={t('gm.leagueRow', {
                rank: i + 1,
                name: r.isMe ? t('gm.leagueYou', { name: r.username }) : r.username,
                xp: r.weekXp,
              })}
            >
              {i + 1}. {r.isMe ? t('gm.leagueYou', { name: r.username }) : r.username} · {r.weekXp}{' '}
              XP
            </AppText>
          ))
        : null}
      {on ? (
        <AppText variant="caption" muted>
          {t('gm.leagueCap')}
        </AppText>
      ) : null}
    </Card>
  );
}

/** Group Goals: a one-line reminder that they are cooperative (shared total, no ranking). */
export function GroupCoopNote() {
  return (
    <AppText variant="caption" muted>
      {t('gm.groupCoop')}
    </AppText>
  );
}

/** Settings: switch rewards off, set a personal weekly target and planned rest days. */
export function GmSettingsCard() {
  const p = useGamification();
  const { colors } = useTheme();
  if (!p.ready) return null;
  const rest = new Set(p.prefs.restWeekdays);
  return (
    <Card>
      <SectionTitle icon="trophy" title={t('gm.settingsTitle')} />
      <SettingRow
        icon="sparkles"
        title={t('gm.settingsOn')}
        body={t('gm.settingsOnBody')}
        value={p.prefs.enabled}
        onChange={(v) => void p.setPrefs({ enabled: v })}
      />
      {p.prefs.enabled ? (
        <>
          <AppText variant="label" accessibilityRole="header">
            {t('gm.targetDays')}
          </AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            {[1, 2, 3, 4, 5].map((n) => {
              const sel = p.prefs.targetDaysPerWeek === n;
              return (
                <Pressable
                  key={n}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: sel }}
                  accessibilityLabel={`${n}`}
                  onPress={() => {
                    haptics.tap();
                    void p.setPrefs({ targetDaysPerWeek: n });
                  }}
                  style={{
                    minWidth: MIN_TOUCH_TARGET,
                    minHeight: MIN_TOUCH_TARGET,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                    borderWidth: sel ? 2 : 1,
                    borderColor: sel ? colors.primary : colors.border,
                  }}
                >
                  <AppText style={{ fontWeight: sel ? '800' : '500' }}>
                    {sel ? `✓ ${n}` : n}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText variant="label" accessibilityRole="header">
            {t('gm.restDays')}
          </AppText>
          <AppText variant="caption" muted>
            {t('gm.restDaysBody')}
          </AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const sel = rest.has(d);
              const atMax = !sel && rest.size >= 4;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: sel, disabled: atMax }}
                  aria-checked={sel}
                  accessibilityLabel={t(`gm.day.${d}` as StringKey)}
                  disabled={atMax}
                  onPress={() => {
                    haptics.tap();
                    const next = new Set(rest);
                    if (sel) next.delete(d);
                    else next.add(d);
                    void p.setPrefs({ restWeekdays: [...next] });
                  }}
                  style={{
                    minWidth: MIN_TOUCH_TARGET,
                    minHeight: MIN_TOUCH_TARGET,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 12,
                    borderWidth: sel ? 2 : 1,
                    borderColor: sel ? colors.primary : colors.border,
                    opacity: atMax ? 0.5 : 1,
                  }}
                >
                  <AppText style={{ fontWeight: sel ? '800' : '500' }}>
                    {sel ? '✓ ' : ''}
                    {t(`gm.day.${d}` as StringKey)}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText variant="caption" muted>
            {t('gm.forgiveNote')}
          </AppText>
        </>
      ) : null}
    </Card>
  );
}
