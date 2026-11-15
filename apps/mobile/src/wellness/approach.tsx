import { useState } from 'react';
import { View } from 'react-native';
import {
  CUISINE_PREFS,
  EXPERIENCE_LEVELS,
  MOBILITY_PREFS,
  PATHWAY_IDS,
  PATHWAY_TITLES,
  SCHEDULE_PREFS,
  STYLE_PREFS,
  type PathwayId,
  type PathwayResult,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Disclosure, IconChoice, SectionTitle, type IconName } from '@/ui/kit';
import { useWellness } from './hooks';

const PATHWAY_ICON: Record<PathwayId, IconName> = {
  dance_aerobic: 'musical-notes',
  balanced_nutrition: 'restaurant',
  strength_training: 'barbell',
  everyday_movement: 'walk',
  cultural_eating: 'earth',
  mindful_eating: 'leaf',
  healthy_habits: 'checkmark-done',
  weight_maintenance: 'swap-horizontal',
};
const toggle = <T extends string>(list: readonly T[], v: T): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

/** A pathway's reasons, what to do and why, and any honest limits. Everything the engine says is shown, never hidden behind a score. */
function PathwayDetail({ p, onAdd }: { p: PathwayResult; onAdd: () => void }) {
  return (
    <View style={{ gap: spacing.xs }}>
      {p.reasons.map((r) => (
        <AppText key={r} variant="caption" muted>
          {r}
        </AppText>
      ))}
      {p.actions.map((a) => (
        <View key={a.id} style={{ gap: 2 }}>
          <AppText>{a.text}</AppText>
          <AppText variant="caption" muted>
            {t('ap.why', { why: a.why })}
          </AppText>
        </View>
      ))}
      {p.notes.map((n) => (
        <AppText key={n} variant="caption" muted>
          {n}
        </AppText>
      ))}
      {p.needsConfirmation ? (
        <Button variant="secondary" label={t('ap.add')} onPress={onAdd} />
      ) : null}
    </View>
  );
}

/**
 * My approach: the Stage A engine's plan, explained and editable. It lives inside the existing Goals screen. Every control saves immediately, and the explanations
 * below are recalculated from the new choices straight away. Suggestions change nothing until the person adds them.
 */
export function ApproachCard() {
  const w = useWellness();
  const { store } = useApp();
  const { engine, prefs } = w;
  const [habitMsg, setHabitMsg] = useState<string | null>(null);
  const [habitErr, setHabitErr] = useState<string | null>(null);

  const applied = engine.pathways.filter((p) => p.source !== 'suggested').map((p) => p.id);
  const togglePathway = (id: PathwayId) => {
    // Editing starts from what is in the plan now, so choosing one pathway never silently drops the others.
    const base = prefs.pathways.length > 0 ? prefs.pathways : applied;
    const next = toggle(base, id);
    if (next.length > 0) void w.setPrefs({ pathways: next });
  };
  const addHabit = async (name: string) => {
    setHabitErr(null);
    setHabitMsg(null);
    try {
      await store.addHabit(name);
      setHabitMsg(t('ap.habitAdded', { name }));
    } catch (e) {
      setHabitErr(errorMessage(e));
    }
  };
  const lensList = engine.lens.show.map((id) => t(`ap.lens.${id}` as StringKey)).join(', ');

  return (
    <DepthCard>
      <SectionTitle icon="compass" title={t('ap.title')} />
      <AppText variant="caption" muted>
        {t('ap.intro')}
      </AppText>

      <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
        {engine.summary.map((line) => (
          <AppText key={line}>{line}</AppText>
        ))}
      </View>
      {engine.seeProfessional ? <Notice tone="warning">{t('wl.seeProfessional')}</Notice> : null}

      <SectionTitle icon="options" title={t('ap.planTitle')} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        {PATHWAY_IDS.map((id) => (
          <IconChoice
            key={id}
            icon={PATHWAY_ICON[id]}
            label={PATHWAY_TITLES[id]}
            selected={applied.includes(id)}
            onPress={() => togglePathway(id)}
          />
        ))}
      </View>
      {prefs.pathways.length > 0 ? (
        <Button
          variant="secondary"
          label={t('ap.resetGoals')}
          onPress={() => void w.setPrefs({ pathways: [] })}
        />
      ) : null}

      {engine.pathways.map((p, i) => (
        <Disclosure
          key={p.id}
          title={p.title}
          summary={t(`ap.tag.${p.source}` as StringKey)}
          initiallyOpen={i === 0}
        >
          <PathwayDetail p={p} onAdd={() => togglePathway(p.id)} />
        </Disclosure>
      ))}

      {engine.habitSuggestions.length > 0 ? (
        <>
          <SectionTitle icon="checkmark-circle" title={t('ap.habitsTitle')} />
          <AppText variant="caption" muted>
            {t('ap.habitsIntro')}
          </AppText>
          {engine.habitSuggestions.map((h) => (
            <View key={h.name} style={{ gap: spacing.xs }}>
              <AppText variant="label">{h.name}</AppText>
              <AppText variant="caption" muted>
                {t('ap.why', { why: h.why })}
              </AppText>
              <Button
                variant="secondary"
                label={`${t('ap.addHabit')}: ${h.name}`}
                onPress={() => void addHabit(h.name)}
              />
            </View>
          ))}
        </>
      ) : null}
      {habitMsg ? <Notice>{habitMsg}</Notice> : null}
      {habitErr ? <Notice tone="warning">{habitErr}</Notice> : null}

      <SectionTitle icon="analytics" title={t('ap.progressTitle')} />
      <AppText variant="caption" muted>
        {t('ap.progressShows', { list: lensList })}
      </AppText>
      {!w.weightShown ? (
        <AppText variant="caption" muted>
          {w.weightOn ? t('ap.weightHidden') : t('ap.weightOff')}
        </AppText>
      ) : null}

      <SectionTitle icon="create" title={t('ap.tuneTitle')} />
      {engine.missing
        .filter((m) => m.key !== 'pathways')
        .map((m) => (
          <AppText key={m.key} variant="caption" muted>
            {m.why}
          </AppText>
        ))}
      <Disclosure title={t('ap.styles')} summary={countOf(prefs.danceStyles.length)}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {STYLE_PREFS.map((s) => (
            <IconChoice
              key={s}
              icon="musical-note"
              label={t(`ap.style.${s}` as StringKey)}
              selected={prefs.danceStyles.includes(s)}
              onPress={() => void w.setPrefs({ danceStyles: toggle(prefs.danceStyles, s) })}
            />
          ))}
        </View>
      </Disclosure>
      <Disclosure title={t('ap.cuisines')} summary={countOf(prefs.cuisines.length)}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {CUISINE_PREFS.map((c) => (
            <IconChoice
              key={c}
              icon="restaurant"
              label={t(`ap.cuisine.${c}` as StringKey)}
              selected={prefs.cuisines.includes(c)}
              onPress={() => void w.setPrefs({ cuisines: toggle(prefs.cuisines, c) })}
            />
          ))}
        </View>
      </Disclosure>
      <Disclosure title={t('ap.mobility')} summary={countOf(prefs.mobility.length)}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {MOBILITY_PREFS.map((m) => (
            <IconChoice
              key={m}
              icon="body"
              label={t(`ap.mobility.${m}` as StringKey)}
              selected={prefs.mobility.includes(m)}
              onPress={() => void w.setPrefs({ mobility: toggle(prefs.mobility, m) })}
            />
          ))}
        </View>
      </Disclosure>
      <Disclosure
        title={t('ap.experience')}
        summary={prefs.experience ? t(`ap.exp.${prefs.experience}` as StringKey) : undefined}
      >
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {EXPERIENCE_LEVELS.map((e) => (
            <IconChoice
              key={e}
              icon="trending-up"
              label={t(`ap.exp.${e}` as StringKey)}
              selected={prefs.experience === e}
              onPress={() => void w.setPrefs({ experience: prefs.experience === e ? null : e })}
            />
          ))}
        </View>
      </Disclosure>
      <Disclosure
        title={t('ap.schedule')}
        summary={prefs.schedule ? t(`ap.sched.${prefs.schedule}` as StringKey) : undefined}
      >
        <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
          {SCHEDULE_PREFS.map((s) => (
            <IconChoice
              key={s}
              icon="time"
              label={t(`ap.sched.${s}` as StringKey)}
              selected={prefs.schedule === s}
              onPress={() => void w.setPrefs({ schedule: prefs.schedule === s ? null : s })}
            />
          ))}
        </View>
      </Disclosure>
      {w.problem ? <Notice tone="warning">{w.problem}</Notice> : null}
      <AppText variant="caption" muted>
        {t('ap.provisional')}
      </AppText>
    </DepthCard>
  );
}

const countOf = (n: number): string | undefined => (n === 0 ? undefined : String(n));
