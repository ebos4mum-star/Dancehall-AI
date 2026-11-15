import { useMemo, useState } from 'react';
import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import {
  EXERCISE_DEMOS,
  HOME_ITEMS,
  HOME_ITEM_IDS,
  HOME_LEVELS,
  HOME_MINUTES,
  UNSAFE_IMPROVISED,
  buildHomeWorkout,
  homeWorkoutsAvailable,
  requestFromPrefs,
  resolveExerciseDemo,
  type HomeItemId,
  type HomeLevel,
  type HomeMinutes,
} from '@dancehall/shared';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { useWellness } from '@/wellness/hooks';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { IconChoice, SectionTitle, type IconName } from '@/ui/kit';
import { previewTag } from './preview';

const ITEM_ICON: Record<HomeItemId, IconName> = {
  chair: 'accessibility',
  wall: 'square-outline',
  towel: 'layers',
  water_bottles: 'water',
  backpack: 'bag-handle',
  stairs: 'trending-up',
};

const toggle = <T extends string>(list: readonly T[], v: T): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/**
 * "Use what you have", on the Dance tab (no new tab or screen). The person says which household items they have, and the session is built from exercises that fit
 * them (see home-equipment.ts). The items are a saved preference: changing them changes only the NEXT session, never anything already logged. The card does not
 * exist unless there is content that may be offered (reviewed, or a development or review build), so a normal build shows nothing.
 */
export function HomeWorkoutCard() {
  const w = useWellness();
  const { colors } = useTheme();
  const [level, setLevel] = useState<HomeLevel | null>(null);
  const [minutes, setMinutes] = useState<HomeMinutes>(15);
  const [seated, setSeated] = useState<boolean | null>(null);
  const prefs = w.prefs;
  const base = useMemo(() => requestFromPrefs(prefs), [prefs]);
  const req = useMemo(
    () =>
      requestFromPrefs(prefs, {
        level: level ?? base.level,
        minutes,
        seated: seated ?? base.seated,
      }),
    [prefs, base.level, base.seated, level, minutes, seated],
  );
  const result = useMemo(() => buildHomeWorkout(req), [req]);
  if (!homeWorkoutsAvailable()) return null;

  const setItems = (items: HomeItemId[]) => void w.setPrefs({ homeItems: items });
  return (
    <>
      <SectionTitle icon="home" title={t('home.title')} />
      <DepthCard>
        <AppText variant="caption" muted>
          {t('home.intro')}
        </AppText>
        <AppText variant="label">{t('home.items')}</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          <IconChoice
            icon="body"
            label={t('home.none')}
            selected={prefs.homeItems.length === 0}
            onPress={() => setItems([])}
          />
          {HOME_ITEM_IDS.map((id) => (
            <IconChoice
              key={id}
              icon={ITEM_ICON[id]}
              label={HOME_ITEMS[id].label}
              selected={prefs.homeItems.includes(id)}
              onPress={() => setItems(toggle(prefs.homeItems, id))}
            />
          ))}
        </View>
        <AppText variant="label">{t('home.level')}</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {HOME_LEVELS.map((l) => (
            <IconChoice
              key={l}
              icon="trending-up"
              label={t(`level.${l}` as StringKey)}
              selected={req.level === l}
              onPress={() => setLevel(l)}
            />
          ))}
        </View>
        <AppText variant="label">{t('home.length')}</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {HOME_MINUTES.map((m) => (
            <IconChoice
              key={m}
              icon="time"
              label={t('dance.minutes', { n: m })}
              selected={minutes === m}
              onPress={() => setMinutes(m)}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <AppText variant="label">{t('home.seated')}</AppText>
            <AppText variant="caption" muted>
              {t('home.seatedBody')}
            </AppText>
          </View>
          <Switch
            accessibilityLabel={t('home.seated')}
            value={req.seated}
            onValueChange={(v) => setSeated(v)}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        {result.ok ? (
          <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
            <AppText variant="heading">
              {t('home.summary', {
                n: result.build.exercises.length,
                min: result.build.workout.minutes,
              })}
            </AppText>
            <AppText variant="caption" muted>
              {result.build.exercises.map((e) => e.name).join(', ')}
            </AppText>
            {previewTag(result.build.workout) ? (
              <AppText variant="caption" muted>
                {previewTag(result.build.workout)}
              </AppText>
            ) : null}
            <Button
              label={t('home.see')}
              onPress={() =>
                router.push({ pathname: '/dance/[id]', params: { id: result.build.workout.id } })
              }
            />
          </View>
        ) : (
          <Notice>{result.reason}</Notice>
        )}
      </DepthCard>
    </>
  );
}

/** The checks for the items a session uses, and what never to use. The person confirms them before starting. */
export function HomeSafetyCard({
  items,
  checks,
  checked,
  onChecked,
}: {
  items: HomeItemId[];
  checks: string[];
  checked: boolean;
  onChecked: (v: boolean) => void;
}) {
  const { colors } = useTheme();
  if (items.length === 0) return null;
  return (
    <DepthCard>
      <AppText variant="heading" accessibilityRole="header">
        {t('home.checkTitle')}
      </AppText>
      <AppText variant="caption" muted>
        {items.map((i) => HOME_ITEMS[i].label).join(', ')}
      </AppText>
      {checks.map((c) => (
        <AppText key={c} variant="caption">{`• ${c}`}</AppText>
      ))}
      <AppText variant="label">{t('home.never')}</AppText>
      {UNSAFE_IMPROVISED.map((c) => (
        <AppText key={c} variant="caption" muted>{`• ${c}`}</AppText>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <AppText style={{ flex: 1 }} variant="label">
          {t('home.checkConfirm')}
        </AppText>
        <Switch
          accessibilityLabel={t('home.checkConfirm')}
          value={checked}
          onValueChange={onChecked}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
    </DepthCard>
  );
}

/**
 * The state of an exercise's demonstration. No demonstration exists yet, so this says so plainly and points to the written steps. If one is ever licensed, approved
 * and captioned it is offered with its captions (and audio description, if any), never as the only way to learn the exercise.
 */
export function DemoStatus({ exerciseId }: { exerciseId: string }) {
  const r = resolveExerciseDemo({
    exerciseId,
    demos: EXERCISE_DEMOS,
    licences: [],
    country: null,
    today: new Date().toISOString().slice(0, 10),
  });
  if (!r.available || !r.demo)
    return (
      <AppText variant="caption" muted>
        {t('home.noDemo')}
      </AppText>
    );
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{t('home.demoCaptions')}</AppText>
      <AppText variant="caption">{r.demo.captions}</AppText>
      {r.demo.audioDescription ? (
        <AppText variant="caption" muted>
          {r.demo.audioDescription}
        </AppText>
      ) : null}
    </View>
  );
}
