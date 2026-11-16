import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  COSMETICS,
  BADGE_IDS,
  GM,
  seasonFor,
  xpToReach,
  type BadgeId,
  type CosmeticId,
  type Quest,
  type QuestId,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import type { GmLeagueRow, SocialOverview } from '@/data/types';
import { t, type StringKey } from '@/i18n';
import { PulseFigure } from '@/pulse/PulseFigure';
import { PulseStage } from '@/pulse/PulseStage';
import { brand, spacing, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Card } from '@/ui/Card';
import { SectionTitle } from '@/ui/kit';
import { useCountUp, Reveal } from '@/ui/motion';
import { SettingRow } from '@/ui/SettingRow';
import { haptics } from '@/ui/haptics';
import { AnimatedBar, BadgeArt, LevelBadge, Pop } from './art';
import { flourishFor } from './GamificationHost';
import { deviceRaw } from './prefs';
import { primaryReaction } from './rewards';
import { rewardLines } from './rewardText';
import { useProgression, type ProgressionActions, type ProgressionView } from './progressionStore';

type GroupView = SocialOverview['groups'][number];
type IconName = React.ComponentProps<typeof Ionicons>['name'];
const QUEST_ICON: Record<QuestId, IconName> = {
  move_10: 'walk',
  habit_tick: 'leaf',
  log_a_meal: 'restaurant',
  gentle_session: 'heart',
  active_days_target: 'calendar',
  try_two_styles: 'musical-notes',
};
const SEASON_ICON: Record<string, IconName> = {
  bloom: 'flower',
  sun: 'sunny',
  harvest: 'leaf',
  frost: 'snow',
};

/** Renders nothing for guests, before the first confirmed answer, or when the person switched rewards off. */
function useShown():
  (ProgressionView & ProgressionActions & { state: NonNullable<ProgressionView['state']> }) | null {
  const p = useProgression();
  return p.enabled && p.ready && p.state
    ? (p as ProgressionView & ProgressionActions & { state: NonNullable<ProgressionView['state']> })
    : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Reward banner: what was just earned, shown only from a confirmed answer, with Pulse reacting
// ---------------------------------------------------------------------------------------------------------------------
const BANNER_MS = 20_000;
export function RewardBanner() {
  const p = useProgression();
  const { colors } = useTheme();
  const r = p.reward;
  const id = r?.id;
  useEffect(() => {
    if (id === undefined) return;
    const h = setTimeout(() => p.dismissReward(), BANNER_MS);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one timer per reward
  }, [id]);
  if (!p.enabled || !r || !p.policy.banner) return null;
  const lines = rewardLines(r.summary, r.groupGoal);
  if (lines.length === 0) return null;
  const reaction = r.groupGoal ? null : primaryReaction(r.summary);
  const body = (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLiveRegion="polite"
      accessibilityLabel={t('gm.reward.aria', { text: lines.join('. ') })}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: brand.plum,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: brand.lime,
        padding: spacing.sm,
      }}
    >
      <View style={{ width: 72, height: 66, overflow: 'hidden', alignItems: 'center' }}>
        <PulseStage
          state={p.policy.pulseState}
          size={72}
          flourish={r.groupGoal ? 'confetti' : flourishFor(reaction)}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="label" style={{ color: brand.lime }}>
          {t('gm.reward.title')}
        </AppText>
        {lines.map((l) => (
          <AppText key={l} style={{ color: brand.ivory, fontWeight: '700' }}>
            {l}
          </AppText>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('gm.reward.dismiss')}
        onPress={() => p.dismissReward()}
        hitSlop={8}
        style={{
          minWidth: MIN_TOUCH_TARGET,
          minHeight: MIN_TOUCH_TARGET,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name="close"
          size={22}
          color={colors.onPrimary === '#FFFFFF' ? brand.ivory : brand.ivory}
        />
      </Pressable>
    </View>
  );
  return p.policy.motion ? <Reveal key={r.id}>{body}</Reveal> : body;
}

// ---------------------------------------------------------------------------------------------------------------------
// Quests
// ---------------------------------------------------------------------------------------------------------------------
function QuestCard({ q, motion }: { q: Quest; motion: boolean }) {
  const { colors } = useTheme();
  const label = t(`gm.q.${q.id}` as StringKey);
  const prog = q.done ? t('gm.questDone') : t('gm.questProgress', { a: q.progress, b: q.goal });
  return (
    <View
      accessible
      accessibilityLabel={`${label}. ${prog}. ${t('gm.reward.xp', { n: q.xp })}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        minHeight: MIN_TOUCH_TARGET + 8,
        padding: spacing.sm,
        borderRadius: 16,
        borderWidth: q.done ? 2 : 1,
        borderColor: q.done ? colors.primary : colors.border,
        backgroundColor: q.done ? 'rgba(184,242,68,0.18)' : colors.surface,
      }}
    >
      <Pop on={q.done} motion={motion}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: q.done ? brand.lime : brand.violet,
          }}
        >
          <Ionicons name={q.done ? 'checkmark' : QUEST_ICON[q.id]} size={22} color={brand.plum} />
        </View>
      </Pop>
      <View style={{ flex: 1, gap: 4 }}>
        <AppText style={{ fontWeight: '700' }}>{label}</AppText>
        {q.goal > 1 && !q.done ? (
          <AnimatedBar
            fraction={q.progress / q.goal}
            label={`${label}: ${prog}`}
            motion={motion}
            height={8}
          />
        ) : (
          <AppText variant="caption" muted>
            {prog}
          </AppText>
        )}
      </View>
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 12,
          backgroundColor: q.done ? brand.lime : colors.border,
        }}
      >
        <AppText variant="caption" style={{ color: brand.plum, fontWeight: '800' }}>
          {t('gm.reward.xp', { n: q.xp })}
        </AppText>
      </View>
    </View>
  );
}

/** Home: level, XP, streak with rest days, today's quests. All numbers are the confirmed ones. */
export function ProgressionCard() {
  const p = useShown();
  const xp = useCountUp(p?.state.totalXp ?? 0);
  if (!p) return null;
  const { level, streak, dailyQuests, restNudge } = p.state;
  const motion = p.policy.motion;
  const next = Math.min(GM.MAX_LEVEL, level.level + 1);
  const top = level.level >= GM.MAX_LEVEL;
  const status =
    streak.todayKind === 'active'
      ? t('gm.activeToday')
      : streak.todayKind === 'rest'
        ? t('gm.restToday')
        : t('gm.openToday');
  const nextMilestone = [3, 7, 14, 30, 60, 100, 200, 365].find((m) => m > streak.current);
  return (
    <Card>
      <SectionTitle icon="trophy" title={t('gm.title')} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <LevelBadge level={level.level} size={68} />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm }}>
            <AppText variant="title" accessibilityLabel={t('gm.level', { n: level.level })}>
              {t('gm.level', { n: level.level })}
            </AppText>
            <AppText muted>{t('gm.xp', { n: xp })}</AppText>
          </View>
          <AnimatedBar
            fraction={level.fraction}
            motion={motion}
            height={14}
            color={brand.violet}
            label={t('gm.barLabel', {
              n: level.level,
              pct: Math.round(level.fraction * 100),
              next,
            })}
          />
          <AppText variant="caption" muted>
            {top
              ? t('gm.maxLevel')
              : t('gm.xpToNext', { n: Math.max(0, level.xpForNext - level.xpInto), next })}
          </AppText>
        </View>
      </View>
      <View
        accessible
        accessibilityLabel={`${streak.current > 0 ? t('gm.streakDays', { n: streak.current }) : t('gm.streakNone')}. ${status}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}
      >
        <Ionicons
          name={streak.todayKind === 'rest' ? 'moon' : 'flame'}
          size={30}
          color={streak.current > 0 ? brand.coral : '#A9A2BC'}
        />
        <View style={{ flex: 1 }}>
          <AppText variant="label">
            {streak.current > 0 ? t('gm.streakDays', { n: streak.current }) : t('gm.streakNone')}
          </AppText>
          <AppText variant="caption" muted>
            {status}{' '}
            {t('gm.weekTarget', { n: streak.activeDaysThisWeek, total: streak.targetDays })}
          </AppText>
          {nextMilestone && streak.current > 0 ? (
            <AppText variant="caption" muted>
              {t('gm.streakNext', { n: nextMilestone - streak.current, m: nextMilestone })}
            </AppText>
          ) : null}
        </View>
      </View>
      {restNudge ? <Notice>{t('gm.restNudge')}</Notice> : null}
      <AppText variant="label" accessibilityRole="header">
        {t('gm.quests')}
      </AppText>
      {dailyQuests.map((q) => (
        <QuestCard key={q.id} q={q} motion={motion} />
      ))}
      <AppText variant="caption" muted>
        {t('gm.xpNote')}
      </AppText>
    </Card>
  );
}

/** Workouts: the week as seven day marks, the target, and the weekly quests. */
export function MovementProgressCard() {
  const p = useShown();
  if (!p) return null;
  const { streak, weeklyQuests, restNudge } = p.state;
  const motion = p.policy.motion;
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  return (
    <Card>
      <SectionTitle icon="flame" title={t('gm.weekQuests')} />
      <View
        accessible
        accessibilityLabel={`${t('gm.weekTarget', { n: streak.activeDaysThisWeek, total: streak.targetDays })}. ${p.weekDots
          .map(
            (d, i) =>
              `${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}: ${t(`gm.weekDay.${d}` as StringKey)}`,
          )
          .join(', ')}`}
        style={{ flexDirection: 'row', justifyContent: 'space-between' }}
      >
        {p.weekDots.map((d, i) => (
          <View key={i} style={{ alignItems: 'center', gap: 4 }}>
            <Pop on={d === 'active'} motion={motion}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    d === 'active' ? brand.lime : d === 'rest' ? brand.violet : 'transparent',
                  borderWidth: d === 'open' ? 2 : 1,
                  borderColor: d === 'open' ? brand.plum : '#CFC8DE',
                }}
              >
                {d === 'active' ? <Ionicons name="checkmark" size={20} color={brand.plum} /> : null}
                {d === 'rest' ? <Ionicons name="moon" size={16} color={brand.ivory} /> : null}
              </View>
            </Pop>
            <AppText variant="caption" muted>
              {labels[i]}
            </AppText>
          </View>
        ))}
      </View>
      <AnimatedBar
        fraction={
          streak.targetDays ? Math.min(1, streak.activeDaysThisWeek / streak.targetDays) : 0
        }
        label={t('gm.weekTarget', { n: streak.activeDaysThisWeek, total: streak.targetDays })}
        motion={motion}
        height={10}
        color={brand.violet}
      />
      <AppText variant="caption" muted>
        {t('gm.weekTarget', { n: streak.activeDaysThisWeek, total: streak.targetDays })}
        {streak.isPlannedRestToday ? ` ${t('gm.restToday')}` : ''}
      </AppText>
      {weeklyQuests.map((q) => (
        <QuestCard key={q.id} q={q} motion={motion} />
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
  return <QuestCard q={q} motion={p.policy.motion} />;
}

// ---------------------------------------------------------------------------------------------------------------------
// Progress: level, badge collection, season, wardrobe
// ---------------------------------------------------------------------------------------------------------------------
function LevelCard() {
  const p = useShown();
  if (!p) return null;
  const { level } = p.state;
  const nextItem = COSMETICS.filter((c) => c.needs.level && c.needs.level > level.level).sort(
    (a, b) => a.needs.level! - b.needs.level!,
  )[0];
  const next = Math.min(GM.MAX_LEVEL, level.level + 1);
  return (
    <Card>
      <SectionTitle icon="trending-up" title={t('gm.level', { n: level.level })} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <LevelBadge level={level.level} size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <AnimatedBar
            fraction={level.fraction}
            motion={p.policy.motion}
            height={12}
            color={brand.violet}
            label={t('gm.barLabel', {
              n: level.level,
              pct: Math.round(level.fraction * 100),
              next,
            })}
          />
          <AppText variant="caption" muted>
            {t('gm.xp', { n: p.state.totalXp })} ·{' '}
            {t('gm.xpToNext', { n: Math.max(0, xpToReach(next) - p.state.totalXp), next })}
          </AppText>
        </View>
      </View>
      <AppText variant="caption" muted>
        {nextItem
          ? t('gm.nextUnlock', {
              n: nextItem.needs.level!,
              name: t(`gm.c.${nextItem.id}` as StringKey),
            })
          : t('gm.allUnlocked')}
      </AppText>
    </Card>
  );
}

function BadgeCollection() {
  const p = useShown();
  if (!p) return null;
  const earned = new Set<BadgeId>(p.state.badges);
  return (
    <Card>
      <SectionTitle icon="ribbon" title={t('gm.badges')} />
      <AppText variant="caption" muted>
        {t('gm.badgesCount', { a: earned.size, b: BADGE_IDS.length })}. {t('gm.badgesNone')}
      </AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {BADGE_IDS.map((id) => {
          const on = earned.has(id);
          const name = t(`gm.b.${id}` as StringKey);
          return (
            <View
              key={id}
              accessible
              accessibilityLabel={t('gm.badgeAria', {
                name,
                state: on ? t('gm.badgeEarned') : t('gm.badgeLocked'),
                how: t(`gm.bd.${id}` as StringKey),
              })}
              style={{
                width: '47%',
                alignItems: 'center',
                gap: 4,
                paddingVertical: spacing.sm,
                opacity: on ? 1 : 0.85,
              }}
            >
              <Pop on={on} motion={p.policy.motion}>
                <BadgeArt id={id} earned={on} size={76} />
              </Pop>
              <AppText variant="label" style={{ textAlign: 'center' }}>
                {name}
              </AppText>
              <AppText variant="caption" muted style={{ textAlign: 'center' }}>
                {on ? t('gm.badgeEarned') : t(`gm.bd.${id}` as StringKey)}
              </AppText>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function SeasonCard() {
  const p = useShown();
  const { colors } = useTheme();
  if (!p) return null;
  const { seasonal } = p.state;
  const season = seasonFor(new Date().toISOString().slice(0, 10));
  const key = seasonal.id.split('-')[0] ?? 'bloom';
  const daysLeft = Math.max(
    0,
    Math.round((Date.parse(`${season.to}T00:00:00Z`) - Date.now()) / 86_400_000),
  );
  const name = t(`gm.seasonName.${key}` as StringKey);
  const reward = t(`gm.c.${season.cosmetic}` as StringKey);
  return (
    <Card>
      <SectionTitle icon={SEASON_ICON[key] ?? 'leaf'} title={`${t('gm.season')}: ${name}`} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 84, height: 80, alignItems: 'center', overflow: 'hidden' }}>
          <PulseFigure state="idle" size={84} cosmetics={[season.cosmetic]} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <AnimatedBar
            fraction={Math.min(1, seasonal.activeDays / Math.max(1, seasonal.goalDays))}
            motion={p.policy.motion}
            height={14}
            color={seasonal.done ? brand.lime : brand.coral}
            label={t('gm.seasonProgress', { a: seasonal.activeDays, b: seasonal.goalDays })}
          />
          <AppText variant="caption" muted>
            {seasonal.done
              ? t('gm.seasonDone')
              : t('gm.seasonProgress', { a: seasonal.activeDays, b: seasonal.goalDays })}
          </AppText>
          <AppText variant="caption" style={{ color: colors.text, fontWeight: '700' }}>
            {t('gm.seasonReward', { name: reward })} · {t('gm.seasonDaysLeft', { n: daysLeft })}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

function WardrobeCard() {
  const p = useShown();
  const { colors } = useTheme();
  const season = useMemo(() => seasonFor(new Date().toISOString().slice(0, 10)), []);
  if (!p) return null;
  const unlocked = new Set<CosmeticId>(p.state.cosmetics);
  const wearing = new Set<CosmeticId>(p.wearing);
  const names = p.wearing.map((c) => t(`gm.c.${c}` as StringKey));
  return (
    <Card>
      <SectionTitle icon="shirt" title={t('gm.cosmetics')} />
      <AppText variant="caption" muted>
        {t('gm.wardrobeHint')}
      </AppText>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          names.length ? t('gm.previewAria', { items: names.join(', ') }) : t('gm.previewNone')
        }
        style={{
          alignItems: 'center',
          backgroundColor: brand.plum,
          borderRadius: 20,
          paddingTop: spacing.sm,
        }}
      >
        <View style={{ height: 150, overflow: 'hidden' }}>
          <PulseFigure state="idle" size={160} cosmetics={p.wearing} />
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        {COSMETICS.map((c) => {
          const have = unlocked.has(c.id);
          const on = wearing.has(c.id);
          const name = t(`gm.c.${c.id}` as StringKey);
          const need = c.needs.level
            ? t(`gm.cr.${c.id}` as StringKey)
            : t('gm.cr.season', {
                season: t(`gm.seasonName.${season.id.split('-')[0]}` as StringKey),
              });
          // Only this season's item is on the list of "to unlock" for the current season; the others are the other seasons'.
          return (
            <Pressable
              key={c.id}
              disabled={!have}
              accessibilityRole="switch"
              accessibilityLabel={t('gm.equipAria', {
                name,
                state: have
                  ? on
                    ? t('gm.wearing')
                    : t('gm.equip')
                  : `${t('gm.badgeLocked')}. ${need}`,
              })}
              accessibilityState={{ checked: on, disabled: !have }}
              aria-checked={on}
              onPress={() => {
                haptics.tap();
                void p.setEquipped(c.id, !on);
              }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                minHeight: 64,
                padding: spacing.xs,
                borderRadius: 16,
                borderWidth: on ? 2 : 1,
                borderColor: on ? colors.primary : colors.border,
                opacity: have ? 1 : 0.55,
              }}
            >
              <View
                style={{
                  width: 56,
                  height: 52,
                  overflow: 'hidden',
                  backgroundColor: brand.plum,
                  borderRadius: 12,
                  alignItems: 'center',
                }}
              >
                <PulseFigure state="idle" size={56} cosmetics={[c.id]} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="label">{name}</AppText>
                <AppText variant="caption" muted>
                  {have ? (on ? t('gm.wearing') : t('gm.equip')) : need}
                </AppText>
              </View>
              {have ? (
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={26}
                  color={on ? colors.primary : colors.textMuted}
                />
              ) : (
                <Ionicons name="lock-closed" size={20} color={colors.textMuted} />
              )}
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

/** Progress: level, the badge collection, the season, and the wardrobe. */
export function ProgressRewards() {
  return (
    <>
      <LevelCard />
      <BadgeCollection />
      <SeasonCard />
      <WardrobeCard />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Friends: league, group goals
// ---------------------------------------------------------------------------------------------------------------------
const AVATAR = ['#9D80EB', '#FF785E', '#6FA41D', '#4F8EF7', '#C06CE0', '#E0A32E'];
const avatarColor = (name: string) =>
  AVATAR[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR.length]!;
const rankKey = (userId: string) => `dh.gm.rank.v1.${userId}`;

export function LeagueCard() {
  const p = useProgression();
  const { store, session } = useApp();
  const { colors } = useTheme();
  const [joined, setJoined] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [change, setChange] = useState<string | null>(null);
  const league = useLoad(async (s) => (s.gmLeague ? s.gmLeague() : ([] as GmLeagueRow[])));
  useEffect(() => {
    if (league.data) setJoined(league.data.length > 0);
  }, [league.data]);
  const rows = league.data ?? [];
  const myIndex = rows.findIndex((r) => r.isMe);
  const userId = session?.userId ?? null;
  const said = useRef('');
  useEffect(() => {
    if (!userId || myIndex < 0 || rows.length < 2) return;
    const sig = `${myIndex}/${rows.length}`;
    if (said.current === sig) return;
    said.current = sig;
    void deviceRaw.get(rankKey(userId)).then(async (raw) => {
      const last = raw === null ? null : Number(raw);
      if (last !== null && Number.isFinite(last)) {
        const d = last - myIndex;
        setChange(
          d > 0 ? t('gm.rankUp', { n: d }) : d < 0 ? t('gm.rankDown', { n: -d }) : t('gm.rankSame'),
        );
      }
      await deviceRaw.set(rankKey(userId), String(myIndex));
    });
  }, [userId, myIndex, rows.length]);
  if (!p.enabled || !store.gmSetLeague) return null;
  const on = joined ?? false;
  const top = Math.max(1, ...rows.map((r) => r.weekXp));
  const motion = p.policy.motion;
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
      {on && myIndex >= 0 && rows.length > 1 ? (
        <AppText variant="label" accessibilityLiveRegion="polite">
          {myIndex === 0
            ? t('gm.leagueFirst')
            : t('gm.leagueYouRank', { n: myIndex + 1, total: rows.length })}
          {change ? ` · ${change}` : ''}
        </AppText>
      ) : null}
      {on
        ? rows.map((r, i) => {
            const you = r.isMe;
            const nm = you ? t('gm.leagueYou', { name: r.username }) : r.username;
            return (
              <View
                key={r.username}
                accessible
                accessibilityLabel={t('gm.leagueRow', { rank: i + 1, name: nm, xp: r.weekXp })}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.sm,
                  minHeight: 56,
                  padding: spacing.xs,
                  borderRadius: 16,
                  borderWidth: you ? 2 : 1,
                  borderColor: you ? colors.primary : colors.border,
                  backgroundColor: you ? 'rgba(184,242,68,0.16)' : colors.surface,
                }}
              >
                <View style={{ width: 28, alignItems: 'center' }}>
                  {i < 3 ? (
                    <Ionicons
                      name={i === 0 ? 'trophy' : 'medal'}
                      size={22}
                      color={i === 0 ? '#E0A32E' : i === 1 ? '#9AA3B5' : '#B5703A'}
                    />
                  ) : (
                    <AppText variant="label">{i + 1}</AppText>
                  )}
                </View>
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: avatarColor(r.username),
                  }}
                >
                  <AppText variant="label" style={{ color: '#FFFFFF' }}>
                    {r.username.slice(0, 1).toUpperCase()}
                  </AppText>
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <AppText variant="label" numberOfLines={1}>
                    {nm}
                  </AppText>
                  <AnimatedBar
                    fraction={r.weekXp / top}
                    label={`${nm}: ${r.weekXp} XP`}
                    motion={motion}
                    height={8}
                    color={avatarColor(r.username)}
                  />
                </View>
                <AppText variant="label">{t('gm.xp', { n: r.weekXp })}</AppText>
              </View>
            );
          })
        : null}
      {on ? (
        <AppText variant="caption" muted>
          {t('gm.leagueResets')}. {t('gm.leagueCap')}
        </AppText>
      ) : null}
    </Card>
  );
}

/** Group Goals: the shared total as one bar toward the target, each person's share, and a completion state. */
export function GroupGoalProgress({ g }: { g: GroupView }) {
  const p = useProgression();
  const { colors } = useTheme();
  const total = g.total ?? 0;
  const done = !!g.target && total >= g.target;
  const max = Math.max(1, ...(g.byMember ?? []).map((m) => m.total));
  return (
    <View style={{ gap: spacing.xs }}>
      {g.target ? (
        <>
          <AnimatedBar
            fraction={total / g.target}
            motion={p.policy.motion}
            height={14}
            color={done ? brand.lime : brand.violet}
            label={t('gm.groupProgress', { a: total, b: g.target })}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {done ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
            <AppText variant="label" accessibilityLiveRegion="polite">
              {done ? t('gm.groupDone') : t('gm.groupProgress', { a: total, b: g.target })}
            </AppText>
          </View>
        </>
      ) : null}
      <AppText variant="caption" muted>
        {t('gm.groupEach')}
      </AppText>
      {(g.byMember ?? []).map((m) => (
        <View
          key={m.username}
          accessible
          accessibilityLabel={`${m.username}: ${m.total}`}
          style={{ gap: 2 }}
        >
          <AnimatedBar
            fraction={m.total / max}
            label={`${m.username}: ${m.total}`}
            motion={p.policy.motion}
            height={8}
            color={avatarColor(m.username)}
          />
        </View>
      ))}
    </View>
  );
}

/** Celebrates a group goal the first time the person sees it complete (shared achievement; nothing about anyone's food, weight or health). */
export function useGroupGoalCelebration(
  groups: readonly GroupView[] | undefined,
  today: string,
): void {
  const p = useProgression();
  const said = useRef(new Set<string>());
  useEffect(() => {
    if (!groups || !p.enabled) return;
    for (const g of groups) {
      if (g.iAm !== 'joined' || !g.target || (g.total ?? 0) < g.target) continue;
      if (g.endDay < today) continue; // an old, finished goal is not a surprise
      const key = `${g.id}:${g.startDay}`;
      if (said.current.has(key)) continue;
      said.current.add(key);
      void p.announceGroupGoal(g.title, key);
    }
  }, [groups, p, today]);
}

export function GroupCoopNote() {
  return (
    <AppText variant="caption" muted>
      {t('gm.groupCoop')}
    </AppText>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------------------------------------
export function GmSettingsCard() {
  const p = useProgression();
  const { colors } = useTheme();
  if (!p.ready && !p.enabled && p.prefs.enabled) return null;
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
          <AppText variant="caption" muted>
            {t('gm.celebrationsNote')}
          </AppText>
        </>
      ) : null}
    </Card>
  );
}

/** Workout completion: the reward for the session just saved, once it is confirmed. Until then only a quiet "checking" line (never a guessed number). */
export function WorkoutRewardSlot() {
  const p = useProgression();
  if (!p.enabled) return null;
  if (p.reward && p.policy.banner) return <RewardBanner />;
  return p.pending ? (
    <AppText variant="caption" muted accessibilityLiveRegion="polite">
      {t('gm.checking')}
    </AppText>
  ) : null;
}
