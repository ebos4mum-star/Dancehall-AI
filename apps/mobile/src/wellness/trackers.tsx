import { useState } from 'react';
import { View } from 'react-native';
import {
  HUNGER_LEVELS,
  MEASURE_SITES,
  RECOVERY_LEVELS,
  SLEEP_QUALITY,
  STRENGTH_KINDS,
  addDaysIso,
  entriesOf,
  measurementChange,
  movementTotals,
  sleepSummary,
} from '@dancehall/shared';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Banner';
import { DepthCard } from '@/ui/Depth';
import { SectionTitle } from '@/ui/kit';
import { BigField } from '@/onboarding/kit';
import { useWellness } from './hooks';

const num = (v: string): number | null => {
  const n = Number(v.trim().replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
};

/** A row of single-select options shown as buttons; the selected one is marked in text as well as style. */
function Options<T extends string>({
  options,
  value,
  onChange,
  prefix,
}: {
  options: readonly T[];
  value: T | null;
  onChange: (v: T | null) => void;
  prefix: string;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {options.map((o) => {
        const label = t(`${prefix}.${o}` as StringKey);
        const on = value === o;
        return (
          <Button
            key={o}
            variant={on ? 'primary' : 'secondary'}
            label={on ? `${label} ✓` : label}
            onPress={() => onChange(on ? null : o)}
          />
        );
      })}
    </View>
  );
}

/** Walks and strength sessions: optional minutes, this week's totals, undo. No targets, no streak pressure. */
export function MovementCard() {
  const w = useWellness();
  const [walk, setWalk] = useState('');
  const [km, setKm] = useState('');
  const [strength, setStrength] = useState('');
  const [style, setStyle] = useState<(typeof STRENGTH_KINDS)[number] | null>(null);
  const tot = movementTotals(w.entries, addDaysIso(w.todayKey, -6), w.todayKey);
  const last = [...entriesOf(w.entries, 'walk'), ...entriesOf(w.entries, 'strength')]
    .filter((e) => e.day === w.todayKey)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const walkMin = num(walk);
  const strMin = num(strength);
  return (
    <DepthCard>
      <SectionTitle icon="walk" title={t('wl.moveTitle')} />
      <AppText accessibilityLiveRegion="polite">
        {t('wl.moveWeek', { walk: tot.walkMinutes, strength: tot.strengthMinutes })}
      </AppText>
      {tot.walkKm > 0 ? (
        <AppText variant="caption" muted>
          {t('wl.moveKm', { km: tot.walkKm })}
        </AppText>
      ) : null}
      <BigField
        label={t('wl.walkMinutes')}
        value={walk}
        onChangeText={setWalk}
        icon="walk"
        suffix="min"
        keyboardType="decimal-pad"
        maxLength={3}
      />
      <BigField
        label={t('wl.walkKm')}
        value={km}
        onChangeText={setKm}
        icon="map"
        suffix="km"
        keyboardType="decimal-pad"
        maxLength={5}
      />
      <Button
        label={t('wl.logWalkEntry')}
        disabled={w.busy || walkMin === null}
        onPress={async () => {
          if (await w.add({ kind: 'walk', amount: walkMin!, amount2: num(km) })) {
            setWalk('');
            setKm('');
          }
        }}
      />
      <BigField
        label={t('wl.strengthMinutes')}
        value={strength}
        onChangeText={setStrength}
        icon="barbell"
        suffix="min"
        keyboardType="decimal-pad"
        maxLength={3}
      />
      <Options options={STRENGTH_KINDS} value={style} onChange={setStyle} prefix="wl.strength" />
      <Button
        label={t('wl.logStrength')}
        disabled={w.busy || strMin === null}
        onPress={async () => {
          if (await w.add({ kind: 'strength', amount: strMin!, label: style })) {
            setStrength('');
            setStyle(null);
          }
        }}
      />
      {last ? (
        <Button
          variant="secondary"
          label={t('wl.undoLast')}
          onPress={() => void w.remove(last.id)}
        />
      ) : null}
      {w.problem ? <Notice tone="warning">{w.problem}</Notice> : null}
      <AppText variant="caption" muted>
        {t('wl.moveNote')}
      </AppText>
    </DepthCard>
  );
}

/** Last night's sleep, optional. A 7-day average appears only after three nights and is never scored. */
export function SleepCard() {
  const w = useWellness();
  const [hours, setHours] = useState('');
  const [quality, setQuality] = useState<(typeof SLEEP_QUALITY)[number] | null>(null);
  const s = sleepSummary(w.entries, w.todayKey);
  const h = num(hours);
  const lastEntry = entriesOf(w.entries, 'sleep').find((e) => e.day === w.todayKey);
  return (
    <DepthCard>
      <SectionTitle icon="moon" title={t('wl.sleepTitle')} />
      {s.lastNight ? (
        <AppText accessibilityLiveRegion="polite">
          {t('wl.sleepLast', { h: s.lastNight.hours })}
        </AppText>
      ) : null}
      {s.averageHours !== null ? (
        <AppText variant="caption" muted>
          {t('wl.sleepAvg', { h: s.averageHours, n: s.nights })}
        </AppText>
      ) : null}
      <BigField
        label={t('wl.sleepHours')}
        value={hours}
        onChangeText={setHours}
        icon="moon"
        suffix="h"
        keyboardType="decimal-pad"
        maxLength={4}
      />
      <Options options={SLEEP_QUALITY} value={quality} onChange={setQuality} prefix="wl.sleepQ" />
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Button
          label={t('wl.logSleep')}
          disabled={w.busy || h === null || !!lastEntry}
          onPress={async () => {
            if (await w.add({ kind: 'sleep', amount: h!, label: quality })) {
              setHours('');
              setQuality(null);
            }
          }}
        />
        {lastEntry ? (
          <Button
            variant="secondary"
            label={t('wl.sleepRedo')}
            onPress={() => void w.remove(lastEntry.id)}
          />
        ) : null}
      </View>
      {w.problem ? <Notice tone="warning">{w.problem}</Notice> : null}
      <AppText variant="caption" muted>
        {t('wl.sleepNote')}
      </AppText>
    </DepthCard>
  );
}

/** How sore or fresh the body feels, one tap. Shows the latest check-in and gentle guidance; never blocks a workout. */
export function RecoveryCard() {
  const w = useWellness();
  const latest = entriesOf(w.entries, 'recovery')[0];
  const level = latest && latest.day === w.todayKey ? latest.label : null;
  return (
    <DepthCard>
      <SectionTitle icon="bed" title={t('wl.recoveryTitle')} />
      <Options
        options={RECOVERY_LEVELS}
        value={(level as (typeof RECOVERY_LEVELS)[number] | null) ?? null}
        onChange={(v) => {
          if (v && !w.busy) void w.add({ kind: 'recovery', amount: 0, label: v });
        }}
        prefix="wl.recovery"
      />
      {level ? (
        <AppText variant="caption" accessibilityLiveRegion="polite">
          {t(`wl.recoveryTip.${level}` as StringKey)}
        </AppText>
      ) : null}
      {w.problem ? <Notice tone="warning">{w.problem}</Notice> : null}
    </DepthCard>
  );
}

/** Before-meal hunger check-in for mindful eating. Hidden when the person has said food numbers are hard. */
export function HungerCard() {
  const w = useWellness();
  if (w.prefs.eatingConcern) return null;
  const todays = entriesOf(w.entries, 'hunger').filter((e) => e.day === w.todayKey);
  const latest = todays[0];
  return (
    <DepthCard>
      <SectionTitle icon="heart" title={t('wl.hungerTitle')} />
      <AppText variant="caption" muted>
        {t('wl.hungerBody')}
      </AppText>
      <Options
        options={HUNGER_LEVELS}
        value={null}
        onChange={(v) => {
          if (v && !w.busy) void w.add({ kind: 'hunger', amount: 0, label: v });
        }}
        prefix="wl.hunger"
      />
      {latest ? (
        <AppText variant="caption" accessibilityLiveRegion="polite">
          {t('wl.hungerLogged', {
            n: todays.length,
            level: t(`wl.hunger.${latest.label}` as StringKey),
          })}
        </AppText>
      ) : null}
      {w.problem ? <Notice tone="warning">{w.problem}</Notice> : null}
    </DepthCard>
  );
}

/** Body measurements in cm, optional. Shows change per site once there are two entries. Hidden when numbers are switched off. */
export function MeasurementsCard() {
  const w = useWellness();
  const [site, setSite] = useState<(typeof MEASURE_SITES)[number]>('waist');
  const [cm, setCm] = useState('');
  if (w.prefs.eatingConcern || w.prefs.tracking === 'none') return null;
  const v = num(cm);
  const sites = MEASURE_SITES.map((s) => ({ s, c: measurementChange(w.entries, s) })).filter(
    (x) => x.c,
  );
  const lastEntry = entriesOf(w.entries, 'measurement')[0];
  return (
    <DepthCard>
      <SectionTitle icon="resize" title={t('wl.measureTitle')} />
      {sites.map(({ s, c }) => (
        <AppText key={s}>
          {t(`wl.site.${s}` as StringKey)}: {c!.latestCm} cm
          {c!.changeCm !== null
            ? ` (${c!.changeCm > 0 ? '+' : ''}${c!.changeCm} cm ${t('wl.measureSince')})`
            : ''}
        </AppText>
      ))}
      <Options
        options={MEASURE_SITES}
        value={site}
        onChange={(x) => setSite(x ?? 'waist')}
        prefix="wl.site"
      />
      <BigField
        label={t('wl.measureValue')}
        value={cm}
        onChangeText={setCm}
        icon="resize"
        suffix="cm"
        keyboardType="decimal-pad"
        maxLength={5}
      />
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Button
          label={t('wl.logMeasure')}
          disabled={w.busy || v === null}
          onPress={async () => {
            if (await w.add({ kind: 'measurement', amount: v!, label: site })) setCm('');
          }}
        />
        {lastEntry ? (
          <Button
            variant="secondary"
            label={t('wl.undoLast')}
            onPress={() => void w.remove(lastEntry.id)}
          />
        ) : null}
      </View>
      {w.problem ? <Notice tone="warning">{w.problem}</Notice> : null}
      <AppText variant="caption" muted>
        {t('wl.measureNote')}
      </AppText>
    </DepthCard>
  );
}
