import { useMemo, useRef, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import {
  COUNTRY_OPTIONS,
  READINESS_QUESTIONS,
  ageYearsOn,
  evaluateReadiness,
  feetInchesToCm,
  goalEndDate,
  lbToKg,
  proposeGoal,
  type ActivityLevel,
  type ConsentPurpose,
  type GoalPeriod,
  type GoalType,
  type ReadinessQuestion,
  type Sex,
  type UnitSystem,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { t, type StringKey } from '@/i18n';
import { formatWeight, parseDecimal, todayIso } from '@/lib/format';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { Choice } from '@/ui/Choice';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

const TOTAL = 5;
const OPTIONAL_CONSENTS: ConsentPurpose[] = [
  'ai_processing_of_food_photos',
  'ai_coach_personalization',
  'health_platform_sync',
  'social_sharing',
];
const CONSENT_LABEL: Record<ConsentPurpose, [StringKey, StringKey]> = {
  health_data_processing: ['privacy.healthData', 'onb.consentRequired'],
  ai_processing_of_food_photos: ['privacy.aiPhotos', 'privacy.aiPhotosBody'],
  ai_coach_personalization: ['privacy.aiCoach', 'privacy.aiCoachBody'],
  health_platform_sync: ['privacy.healthSync', 'privacy.healthSyncBody'],
  social_sharing: ['privacy.sharing', 'privacy.sharingBody'],
};

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export default function Onboarding() {
  const { store, refresh, ready, session, profile: current } = useApp();
  const { colors, spacing, radius } = useTheme();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [birth, setBirth] = useState('');
  const [country, setCountry] = useState<string | null>(null);
  const [countryQuery, setCountryQuery] = useState('');
  const [units, setUnits] = useState<UnitSystem>('metric');

  const [consents, setConsents] = useState<Record<ConsentPurpose, boolean>>({
    health_data_processing: false,
    ai_processing_of_food_photos: false,
    ai_coach_personalization: false,
    health_platform_sync: false,
    social_sharing: false,
  });

  const [heightCm, setHeightCm] = useState('');
  const [feet, setFeet] = useState('');
  const [inches, setInches] = useState('');
  const [weight, setWeight] = useState('');
  const [sex, setSex] = useState<Sex>('unspecified');
  const [activity, setActivity] = useState<ActivityLevel>('light');

  const [answers, setAnswers] = useState<Partial<Record<ReadinessQuestion, boolean>>>({});

  const [goalType, setGoalType] = useState<GoalType | 'none'>('none');
  const [goalPeriod, setGoalPeriod] = useState<GoalPeriod>('monthly');
  const [goalTarget, setGoalTarget] = useState('');

  const done = useRef(new Set<string>());

  const age =
    /^\d{4}-\d{2}-\d{2}$/.test(birth) && !Number.isNaN(Date.parse(`${birth}T00:00:00Z`))
      ? ageYearsOn(birth, new Date())
      : null;
  const heightValue =
    units === 'metric'
      ? parseDecimal(heightCm)
      : (() => {
          const f = parseDecimal(feet);
          const i = parseDecimal(inches || '0');
          return f === null || i === null ? null : feetInchesToCm(f, i);
        })();
  const weightKg = (() => {
    const w = parseDecimal(weight);
    return w === null ? null : units === 'metric' ? w : lbToKg(w);
  })();
  const unitWord = units === 'metric' ? 'kg' : 'lb';

  const proposal = useMemo(() => {
    if (goalType === 'none' || weightKg === null || heightValue === null || age === null)
      return null;
    const tgt =
      goalTarget.trim() === '' || goalType === 'maintain' ? undefined : parseDecimal(goalTarget);
    if (tgt === null) return null;
    return proposeGoal({
      type: goalType,
      period: goalPeriod,
      startDate: todayIso(),
      startKg: Math.round(weightKg * 100) / 100,
      targetKg: tgt === undefined ? undefined : units === 'metric' ? tgt : lbToKg(tgt),
      heightCm: heightValue,
      ageYears: age,
    });
  }, [goalType, goalPeriod, goalTarget, weightKg, heightValue, age, units]);

  const next = () => {
    setFieldError(null);
    if (step === 1) {
      if (name.trim().length < 1 || name.trim().length > 40)
        return setFieldError(t('onb.nameError'));
      if (age === null) return setFieldError(t('onb.birthError'));
      if (age < 18) return setFieldError(t('err.adults_only'));
      if (age > 120) return setFieldError(t('err.invalid_birth_date'));
      if (!country) return setFieldError(t('onb.countryError'));
    }
    if (step === 2 && !consents.health_data_processing) return setFieldError(t('onb.consentError'));
    if (step === 3) {
      if (heightValue === null || heightValue < 100 || heightValue > 250)
        return setFieldError(t('onb.heightError'));
      if (weightKg === null || weightKg < 25 || weightKg > 400)
        return setFieldError(t('onb.weightError'));
    }
    if (step === 4 && READINESS_QUESTIONS.some((q) => answers[q] === undefined))
      return setFieldError(t('common.error'));
    setStep(step + 1);
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    const once = async (key: string, fn: () => Promise<unknown>) => {
      if (done.current.has(key)) return;
      await fn();
      done.current.add(key);
    };
    try {
      await once('consent', async () => {
        await store.setConsent('health_data_processing', true);
        for (const p of OPTIONAL_CONSENTS) if (consents[p]) await store.setConsent(p, true);
      });
      await once('profile', () =>
        store.updateProfile({
          displayName: name.trim(),
          country: country!,
          timeZone: deviceTimeZone(),
          unitSystem: units,
        }),
      );
      await once('private', () =>
        store.savePrivate({
          birthDate: birth,
          heightCm: Math.round(heightValue! * 10) / 10,
          sex,
          activityLevel: activity,
        }),
      );
      await once('readiness', () => store.saveReadiness(answers));
      await once('weight', () => store.addWeight({ weightKg: Math.round(weightKg! * 100) / 100 }));
      if (proposal?.goal && proposal.status !== 'block')
        await once('goal', () => store.createGoal(proposal.goal!));
      await once('complete', () => store.completeOnboarding());
      await refresh();
      router.replace('/');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (ready && !session) return <Redirect href="/" />;
  if (ready && current?.onboardedAt && !busy) return <Redirect href="/" />;

  const readiness = evaluateReadiness(answers);
  const filtered = COUNTRY_OPTIONS.filter((c) =>
    c.name.toLowerCase().includes(countryQuery.trim().toLowerCase()),
  ).slice(0, 6);
  const selectedCountry = COUNTRY_OPTIONS.find((c) => c.code === country);

  return (
    <Screen>
      <AppText variant="caption" muted accessibilityLiveRegion="polite">
        {t('onb.step', { n: step, total: TOTAL })}
      </AppText>

      {step === 1 && (
        <>
          <AppText variant="title" accessibilityRole="header">
            {t('onb.aboutTitle')}
          </AppText>
          <AppText muted>{t('onb.aboutBody')}</AppText>
          <TextField
            label={t('onb.name')}
            value={name}
            onChangeText={setName}
            autoComplete="name"
            maxLength={40}
          />
          <TextField
            label={t('onb.birthDate')}
            hint={t('onb.birthHint')}
            value={birth}
            onChangeText={setBirth}
            keyboardType="numbers-and-punctuation"
            placeholder="1990-05-21"
            maxLength={10}
          />
          <View style={{ gap: spacing.xs }}>
            <TextField
              label={t('onb.country')}
              hint={t('onb.countryNote')}
              value={selectedCountry && countryQuery === '' ? selectedCountry.name : countryQuery}
              onChangeText={(v) => {
                setCountryQuery(v);
                setCountry(null);
              }}
              placeholder={t('onb.countrySearch')}
            />
            {country === null &&
              countryQuery.length > 0 &&
              filtered.map((c) => (
                <Pressable
                  key={c.code}
                  accessibilityRole="button"
                  accessibilityLabel={c.name}
                  onPress={() => {
                    setCountry(c.code);
                    setCountryQuery('');
                  }}
                  style={{
                    minHeight: MIN_TOUCH_TARGET,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.md,
                    backgroundColor: colors.surface,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <AppText>{c.name}</AppText>
                </Pressable>
              ))}
            {selectedCountry ? (
              <AppText variant="caption" muted>
                ✓ {selectedCountry.name}
              </AppText>
            ) : null}
          </View>
          <Choice
            label={t('onb.units')}
            value={units}
            onChange={setUnits}
            options={[
              { value: 'metric', label: t('common.metric') },
              { value: 'imperial', label: t('common.imperial') },
            ]}
          />
        </>
      )}

      {step === 2 && (
        <>
          <AppText variant="title" accessibilityRole="header">
            {t('onb.consentTitle')}
          </AppText>
          <AppText muted>{t('onb.consentBody')}</AppText>
          {(Object.keys(CONSENT_LABEL) as ConsentPurpose[]).map((p) => {
            const [labelKey, bodyKey] = CONSENT_LABEL[p];
            return (
              <Card key={p}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: spacing.md,
                  }}
                >
                  <AppText variant="label" style={{ flex: 1 }}>
                    {t(labelKey)}
                  </AppText>
                  <Switch
                    accessibilityLabel={t(labelKey)}
                    value={consents[p]}
                    onValueChange={(v) => setConsents({ ...consents, [p]: v })}
                    trackColor={{ true: colors.primary, false: colors.border }}
                  />
                </View>
                <AppText variant="caption" muted>
                  {t(bodyKey)}
                </AppText>
              </Card>
            );
          })}
        </>
      )}

      {step === 3 && (
        <>
          <AppText variant="title" accessibilityRole="header">
            {t('onb.bodyTitle')}
          </AppText>
          <AppText muted>{t('onb.bodyBody')}</AppText>
          {units === 'metric' ? (
            <TextField
              label={t('onb.heightCm')}
              value={heightCm}
              onChangeText={setHeightCm}
              keyboardType="decimal-pad"
            />
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing.md }}>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('onb.heightFt')}
                  value={feet}
                  onChangeText={setFeet}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label={t('onb.heightIn')}
                  value={inches}
                  onChangeText={setInches}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          )}
          <TextField
            label={`${t('onb.weight')} (${unitWord})`}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />
          <Choice
            label={t('onb.sex')}
            value={sex}
            onChange={setSex}
            options={(['female', 'male', 'unspecified'] as const).map((v) => ({
              value: v,
              label: t(`sex.${v}` as StringKey),
            }))}
          />
          <Choice
            label={t('onb.activity')}
            value={activity}
            onChange={setActivity}
            options={(['low', 'light', 'moderate', 'high'] as const).map((v) => ({
              value: v,
              label: t(`activity.${v}` as StringKey),
            }))}
          />
        </>
      )}

      {step === 4 && (
        <>
          <AppText variant="title" accessibilityRole="header">
            {t('onb.readyTitle')}
          </AppText>
          <AppText muted>{t('onb.readyBody')}</AppText>
          {READINESS_QUESTIONS.map((q) => (
            <Card key={q}>
              <AppText>{t(`ready.q.${q}` as StringKey)}</AppText>
              <Choice
                value={answers[q] === undefined ? null : answers[q] ? 'yes' : 'no'}
                onChange={(v) => setAnswers({ ...answers, [q]: v === 'yes' })}
                options={[
                  { value: 'no', label: t('ready.no') },
                  { value: 'yes', label: t('ready.yes') },
                ]}
              />
            </Card>
          ))}
          {readiness.flagged.length > 0 ? <Notice>{t('onb.readyNote')}</Notice> : null}
        </>
      )}

      {step === 5 && (
        <>
          <AppText variant="title" accessibilityRole="header">
            {t('onb.goalTitle')}
          </AppText>
          <AppText muted>{t('onb.goalBody')}</AppText>
          <Choice
            value={goalType}
            onChange={setGoalType}
            options={[
              { value: 'none', label: t('onb.goalSkip') },
              { value: 'lose', label: t('goals.lose') },
              { value: 'maintain', label: t('goals.maintain') },
              { value: 'gain', label: t('goals.gain') },
            ]}
          />
          {goalType !== 'none' && (
            <>
              <Choice
                label={t('goals.period')}
                value={goalPeriod}
                onChange={setGoalPeriod}
                options={(['weekly', 'monthly', 'yearly'] as const).map((v) => ({
                  value: v,
                  label: t(`goals.${v}` as StringKey),
                }))}
              />
              {goalType !== 'maintain' && (
                <TextField
                  label={t('goals.target', { unit: unitWord })}
                  hint={t('goals.targetHint')}
                  value={goalTarget}
                  onChangeText={setGoalTarget}
                  keyboardType="decimal-pad"
                />
              )}
              {proposal ? (
                <Card>
                  <AppText variant="label">
                    {t(proposal.status === 'block' ? 'goals.blocked' : 'onb.goalProposed')}
                  </AppText>
                  {proposal.goal ? (
                    <AppText>{`${formatWeight(proposal.goal.startKg, units)} → ${formatWeight(proposal.goal.targetKg, units)} · ${t(`goals.${proposal.goal.period}` as StringKey)} (${t('goals.until', { date: goalEndDate(todayIso(), goalPeriod) })})`}</AppText>
                  ) : null}
                  {proposal.reasons.map((r) => (
                    <AppText key={r} variant="caption" muted>
                      {r}
                    </AppText>
                  ))}
                </Card>
              ) : null}
            </>
          )}
        </>
      )}

      {fieldError ? <Notice tone="warning">{fieldError}</Notice> : null}
      {error ? <Notice tone="warning">{error}</Notice> : null}

      <View style={{ gap: spacing.sm }}>
        {step < TOTAL ? (
          <Button label={t('common.continue')} onPress={next} />
        ) : (
          <Button
            label={busy ? t('onb.saving') : t('onb.finish')}
            disabled={busy || proposal?.status === 'block'}
            onPress={finish}
          />
        )}
        {step > 1 ? (
          <Button
            variant="secondary"
            label={t('common.back')}
            disabled={busy}
            onPress={() => {
              setFieldError(null);
              setStep(step - 1);
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}
