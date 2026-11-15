import { View } from 'react-native';
import {
  ACTIVITY_PREFS,
  CELEBRATION_LEVELS,
  DIET_PREFS,
  EQUIPMENT_PREFS,
  SELECTABLE_GOAL_INTENTS,
  compatibleSecondaryGoals,
  TRACKING_STYLES,
  entriesOf,
  hydrationOn,
  type ActivityPref,
  type DietPref,
  type EquipmentPref,
  type GoalIntent,
} from '@dancehall/shared';
import { t, type StringKey } from '@/i18n';
import { brand, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Banner';
import { DepthCard } from '@/ui/Depth';
import { Disclosure, IconBadge, IconChoice, SectionTitle, type IconName } from '@/ui/kit';
import { ProgressBar } from '@/ui/ProgressBar';
import { SettingRow } from '@/ui/SettingRow';
import { BigField } from '@/onboarding/kit';
import { useWellness, type WellnessData } from './hooks';
import { useEffect, useState } from 'react';

const INTENT_ICON: Record<GoalIntent, IconName> = {
  strength: 'barbell',
  lose: 'trending-down',
  maintain: 'swap-horizontal',
  gain: 'trending-up',
  fitness: 'fitness',
};

/** The five goals as big choices, with a one-line explanation of the selected one. Reused by onboarding and Goals. */
export function IntentChoice({
  value,
  onChange,
}: {
  value: GoalIntent;
  onChange: (v: GoalIntent) => void;
}) {
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {SELECTABLE_GOAL_INTENTS.map((g) => (
          <View key={g} style={{ flexBasis: '47%', flexGrow: 1 }}>
            <IconChoice
              icon={INTENT_ICON[g]}
              label={t(`wl.intent.${g}` as StringKey)}
              selected={value === g}
              onPress={() => onChange(g)}
              tint={
                g === 'lose'
                  ? brand.coral
                  : g === 'maintain' || g === 'gain'
                    ? brand.violet
                    : g === 'strength'
                      ? brand.violet
                      : brand.lime
              }
            />
          </View>
        ))}
      </View>
      <AppText variant="caption" muted accessibilityLiveRegion="polite">
        {t(`wl.intentNote.${value}` as StringKey)}
      </AppText>
    </View>
  );
}

const toggle = <T extends string>(list: readonly T[], v: T): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/** Goal, tracking style, movement and food preferences, and the optional safety flags. Every change saves immediately. */
export function FocusCard({ part = 'all' }: { part?: 'all' | 'goals' | 'rest' }) {
  const w = useWellness();
  const { prefs } = w;
  const [minutes, setMinutes] = useState('');
  const [water, setWater] = useState('');
  const [daily, setDaily] = useState('');
  const [monthly, setMonthly] = useState('');
  const [yearly, setYearly] = useState('');
  useEffect(() => {
    setMinutes(prefs.exerciseMinutesPerWeek === null ? '' : String(prefs.exerciseMinutesPerWeek));
    setWater(prefs.waterGoalMl === null ? '' : String(prefs.waterGoalMl));
    setDaily(prefs.dailyMovementMinutes === null ? '' : String(prefs.dailyMovementMinutes));
    setMonthly(prefs.monthlyGoalWeeks === null ? '' : String(prefs.monthlyGoalWeeks));
    setYearly(prefs.yearlyGoalWeeks === null ? '' : String(prefs.yearlyGoalWeeks));
  }, [
    prefs.exerciseMinutesPerWeek,
    prefs.waterGoalMl,
    prefs.dailyMovementMinutes,
    prefs.monthlyGoalWeeks,
    prefs.yearlyGoalWeeks,
  ]);
  const num = (v: string): number | null => {
    const n = Number(v.replace(',', '.'));
    return v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : null;
  };
  const goals = (
    <>
      <SectionTitle icon="flag" title={t('wl.focusTitle')} />
      <AppText variant="caption" muted>
        {t('wl.focusIntro')}
      </AppText>
      <IntentChoice
        value={prefs.goalIntent}
        onChange={(v) => void w.setPrefs({ goalIntent: v, goalChosen: true })}
      />
      <Disclosure
        title={t('wl.secondary')}
        summary={
          prefs.secondaryGoals.length === 0
            ? undefined
            : prefs.secondaryGoals.map((g) => t(`wl.intent.${g}` as StringKey)).join(', ')
        }
      >
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {compatibleSecondaryGoals(prefs.goalIntent).map((g) => (
            <View key={g} style={{ flexBasis: '47%', flexGrow: 1 }}>
              <IconChoice
                icon={INTENT_ICON[g]}
                label={t(`wl.intent.${g}` as StringKey)}
                selected={prefs.secondaryGoals.includes(g)}
                onPress={() => void w.setPrefs({ secondaryGoals: toggle(prefs.secondaryGoals, g) })}
              />
            </View>
          ))}
        </View>
        <AppText variant="caption" muted>
          {t('wl.secondaryNote')}
        </AppText>
      </Disclosure>
      <SettingRow
        icon="scale"
        title={t('wl.weightTracking')}
        body={t('wl.weightTrackingBody')}
        value={w.weightOn}
        onChange={(v) => void w.setPrefs({ weightTracking: v })}
      />
      {w.weightOn && !w.weightShown ? (
        <AppText variant="caption" muted>
          {t('wl.weightTrackingHidden')}
        </AppText>
      ) : null}
    </>
  );
  const others = (
    <>
      <AppText variant="label">{t('wl.tracking')}</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {TRACKING_STYLES.map((k) => (
          <View key={k} style={{ flex: 1 }}>
            <IconChoice
              icon={k === 'detailed' ? 'list' : k === 'light' ? 'restaurant' : 'eye-off'}
              label={t(`wl.tracking.${k}` as StringKey)}
              selected={prefs.tracking === k}
              onPress={() => void w.setPrefs({ tracking: k })}
            />
          </View>
        ))}
      </View>
      <AppText variant="caption" muted>
        {t('wl.trackingNote')}
      </AppText>
      <AppText variant="label">{t('wl.activities')}</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {ACTIVITY_PREFS.map((a: ActivityPref) => (
          <IconChoice
            key={a}
            icon={a === 'dance' ? 'musical-notes' : a === 'walking' ? 'walk' : 'barbell'}
            label={t(`wl.act.${a}` as StringKey)}
            selected={prefs.activities.includes(a)}
            onPress={() => {
              const next = toggle(prefs.activities, a);
              if (next.length > 0) void w.setPrefs({ activities: next });
            }}
            tint={brand.lime}
          />
        ))}
      </View>
      <AppText variant="label">{t('wl.equipment')}</AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {EQUIPMENT_PREFS.map((q: EquipmentPref) => (
          <IconChoice
            key={q}
            icon="cube"
            label={t(`wl.eq.${q}` as StringKey)}
            selected={prefs.equipment.includes(q)}
            onPress={() => {
              const next =
                q === 'none'
                  ? ['none' as const]
                  : toggle(
                      prefs.equipment.filter((x) => x !== 'none'),
                      q,
                    );
              void w.setPrefs({ equipment: next.length > 0 ? next : ['none'] });
            }}
          />
        ))}
      </View>
      <Disclosure
        title={t('wl.diet')}
        summary={prefs.diet.length === 0 ? undefined : String(prefs.diet.length)}
      >
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {DIET_PREFS.map((d: DietPref) => (
            <IconChoice
              key={d}
              icon="leaf"
              label={t(`wl.diet.${d}` as StringKey)}
              selected={prefs.diet.includes(d)}
              onPress={() => void w.setPrefs({ diet: toggle(prefs.diet, d) })}
              tint={brand.coral}
            />
          ))}
        </View>
      </Disclosure>
      <BigField
        icon="time"
        label={t('wl.minutes')}
        value={minutes}
        onChangeText={setMinutes}
        keyboardType="number-pad"
        suffix="min"
      />
      <Button
        variant="secondary"
        label={t('common.save')}
        onPress={() => void w.setPrefs({ exerciseMinutesPerWeek: num(minutes) })}
      />
      <BigField
        icon="water"
        label={t('wl.waterGoal')}
        value={water}
        onChangeText={setWater}
        keyboardType="number-pad"
        suffix="ml"
      />
      <Button
        variant="secondary"
        label={t('common.save')}
        onPress={() => void w.setPrefs({ waterGoalMl: num(water) })}
      />
      <SectionTitle icon="sparkles" title={t('wl.celTitle')} />
      <AppText variant="caption" muted>
        {t('wl.celIntro')}
      </AppText>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {CELEBRATION_LEVELS.map((k) => (
          <View key={k} style={{ flex: 1 }}>
            <IconChoice
              icon={k === 'off' ? 'notifications-off' : k === 'gentle' ? 'leaf' : 'sparkles'}
              label={t(`wl.cel.${k}` as StringKey)}
              selected={prefs.celebrations === k}
              onPress={() => void w.setPrefs({ celebrations: k })}
            />
          </View>
        ))}
      </View>
      <AppText variant="caption" muted>
        {t(`wl.celNote.${prefs.celebrations}` as StringKey)}
      </AppText>
      <BigField
        icon="footsteps"
        label={t('wl.dailyMinutes')}
        value={daily}
        onChangeText={setDaily}
        keyboardType="number-pad"
        suffix="min"
      />
      <BigField
        icon="calendar"
        label={t('wl.monthlyWeeks')}
        value={monthly}
        onChangeText={setMonthly}
        keyboardType="number-pad"
        suffix={t('wl.weeksUnit')}
      />
      <BigField
        icon="trophy"
        label={t('wl.yearlyWeeks')}
        value={yearly}
        onChangeText={setYearly}
        keyboardType="number-pad"
        suffix={t('wl.weeksUnit')}
      />
      <Button
        variant="secondary"
        label={t('wl.saveCelGoals')}
        onPress={() =>
          void w.setPrefs({
            dailyMovementMinutes: num(daily),
            monthlyGoalWeeks: num(monthly),
            yearlyGoalWeeks: num(yearly),
          })
        }
      />
      <SectionTitle icon="heart" title={t('wl.careTitle')} />
      <AppText variant="caption" muted>
        {t('wl.careIntro')}
      </AppText>
      <SettingRow
        icon="happy"
        title={t('wl.pregnant')}
        body={t('wl.pregnantBody')}
        value={prefs.pregnantOrPostpartum}
        onChange={(v) => void w.setPrefs({ pregnantOrPostpartum: v })}
      />
      <SettingRow
        icon="shield-checkmark"
        title={t('wl.eatingConcern')}
        body={t('wl.eatingConcernBody')}
        value={prefs.eatingConcern}
        onChange={(v) => void w.setPrefs({ eatingConcern: v })}
      />
      {w.problem ? <Notice tone="warning">{w.problem}</Notice> : null}
    </>
  );
  if (part === 'goals') return <DepthCard>{goals}</DepthCard>;
  if (part === 'rest') return <DepthCard>{others}</DepthCard>;
  return (
    <DepthCard>
      {goals}
      {others}
    </DepthCard>
  );
}

/** Estimates with their reasons. When there is no number, it says why and, where it matters, points to a professional. */
export function TargetsCard() {
  const w = useWellness();
  const { colors } = useTheme();
  const g = w.targets;
  return (
    <DepthCard>
      <SectionTitle icon="analytics" title={t('wl.targetsTitle')} />
      <View
        style={{
          alignSelf: 'flex-start',
          backgroundColor: brand.coral,
          borderRadius: radius.pill,
          paddingHorizontal: spacing.sm,
          paddingVertical: 2,
        }}
      >
        <AppText variant="caption" style={{ color: brand.plum, fontWeight: '700' }}>
          {t('wl.targetsBadge')}
        </AppText>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Row icon="flag" label={t('wl.yourGoal')} value={t(`wl.intent.${g.intent}` as StringKey)} />
        {g.kcal ? (
          <>
            <Row
              icon="flame"
              label={t('wl.maintenanceKcal')}
              value={t('wl.kcalValue', { kcal: g.kcal.maintenance })}
            />
            <Row
              icon="trending-up"
              label={t('wl.goalKcal')}
              value={
                g.kcal.guide === null
                  ? t('wl.kcalWithheld')
                  : t('wl.kcalValue', { kcal: g.kcal.guide })
              }
            />
            {g.proteinG ? (
              <Row
                icon="barbell"
                label={t('wl.protein')}
                value={t('wl.proteinValue', { low: g.proteinG.low, high: g.proteinG.high })}
              />
            ) : null}
          </>
        ) : (
          <AppText variant="label">{t('wl.noTargets')}</AppText>
        )}
        <Row icon="water" label={t('wl.water')} value={t('wl.waterValue', { ml: w.waterGoalMl })} />
      </View>
      {g.missing.length > 0 ? (
        <Notice>
          {t('wl.missingInputs', {
            list: g.missing.map((m) => t(`wl.missing.${m}` as StringKey)).join(', '),
          })}
        </Notice>
      ) : null}
      {g.seeProfessional ? <Notice tone="warning">{t('wl.seeProfessional')}</Notice> : null}
      <AppText variant="caption" muted>
        {t('wl.targetsProvisional')}
      </AppText>
      <Disclosure title={t('wl.how')}>
        {g.reasons.map((r) => (
          <AppText key={r} variant="caption" style={{ color: colors.text }}>
            {r}
          </AppText>
        ))}
        <AppText variant="caption" muted>
          {t('food.guideNote')}
        </AppText>
      </Disclosure>
    </DepthCard>
  );
}

function Row({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}
    >
      <IconBadge name={icon} size={32} fill={brand.violet} />
      <AppText variant="caption" muted style={{ width: 110 }}>
        {label}
      </AppText>
      <AppText variant="label" style={{ flex: 1 }}>
        {value}
      </AppText>
    </View>
  );
}

/** Water today: a bar against a general guide, two one-tap adds, and undo. Optional and never scolds. */
export function HydrationCard() {
  const w = useWellness();
  const h = hydrationOn(w.entries, w.todayKey, w.waterGoalMl);
  const last = entriesOf(w.entries, 'hydration').find((e) => e.day === w.todayKey);
  return (
    <DepthCard>
      <SectionTitle icon="water" title={t('wl.hydrationTitle')} />
      <WellnessLoadState w={w} />
      <ProgressBar
        fraction={h.fraction}
        label={t('wl.hydrationOf', { ml: h.ml, goal: h.goalMl })}
      />
      <AppText accessibilityLiveRegion="polite">
        {`${t('wl.hydrationOf', { ml: h.ml, goal: h.goalMl })} · ${t('wl.glasses', { n: h.glasses })}`}
      </AppText>
      {h.fraction >= 1 ? <AppText variant="caption">{t('wl.hydrationMet')}</AppText> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Button
          label={t('wl.addGlass')}
          disabled={w.busy}
          onPress={() => void w.add({ kind: 'hydration', amount: 250 })}
        />
        <Button
          variant="secondary"
          label={t('wl.addBottle')}
          disabled={w.busy}
          onPress={() => void w.add({ kind: 'hydration', amount: 500 })}
        />
        {last ? (
          <Button
            variant="secondary"
            label={t('wl.undoWater')}
            onPress={() => void w.remove(last.id)}
          />
        ) : null}
      </View>
      {w.problem ? <Notice tone="warning">{w.problem}</Notice> : null}
      <AppText variant="caption" muted>
        {t('wl.hydrationNote')}
      </AppText>
    </DepthCard>
  );
}

/** Shown at the top of every wellness card: a calm loading line, or a plain error with a retry, so a failed read is never mistaken for "nothing logged". */
export function WellnessLoadState({ w }: { w: WellnessData }) {
  if (w.error)
    return (
      <View style={{ gap: spacing.sm }}>
        <Notice tone="warning">{t('wl.loadError')}</Notice>
        <Button variant="secondary" label={t('common.retry')} onPress={w.reload} />
      </View>
    );
  if (w.loading)
    return (
      <AppText variant="caption" muted accessibilityLiveRegion="polite">
        {t('common.loading')}
      </AppText>
    );
  return null;
}
