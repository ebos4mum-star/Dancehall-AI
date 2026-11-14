import { showMoment } from '@/pulse/moment';
import { useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
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
import { Notice } from '@/ui/Banner';
import { IconBadge, IconChoice, type IconName } from '@/ui/kit';
import { BigField, JourneyHeader, StepCard, TrustCard, YesNoCard } from '@/onboarding/kit';
import { Ionicons } from '@expo/vector-icons';
import { brand } from '@/theme/tokens';
import { Screen } from '@/ui/Screen';

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
      showMoment(t('moment.welcomeAboard'), 'celebrate');
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

  const ageStatus =
    /^\d{4}-\d{2}-\d{2}$/.test(birth) && age !== null
      ? age >= 18
        ? { ok: true, text: t('onb.ageOk') }
        : { ok: false, text: t('err.adults_only') }
      : null;
  const CONSENT_ICON: Record<ConsentPurpose, IconName> = {
    health_data_processing: 'heart',
    ai_processing_of_food_photos: 'camera',
    ai_coach_personalization: 'sparkles',
    health_platform_sync: 'watch',
    social_sharing: 'people',
  };

  return (
    <Screen>
      <JourneyHeader
        step={step}
        total={TOTAL}
        line={t(`onb.say${step}` as StringKey)}
        pulse={step === 4 ? 'encourage' : step === 1 || step === 5 ? 'welcome' : 'idle'}
        stepLabel={t('onb.step', { n: step, total: TOTAL })}
      />

      {step === 1 && (
        <>
          <StepCard icon="person" title={t('onb.aboutTitle')} note={t('onb.aboutBody')}>
            <BigField
              label={t('onb.name')}
              icon="person-circle"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              maxLength={40}
            />
            <BigField
              label={t('onb.birthDate')}
              icon="calendar"
              hint={t('onb.birthHint')}
              value={birth}
              onChangeText={setBirth}
              keyboardType="numbers-and-punctuation"
              placeholder="1990-05-21"
              maxLength={10}
              status={ageStatus}
            />
          </StepCard>
          <StepCard icon="globe" title={t('onb.country')} note={t('onb.countryNote')}>
            {selectedCountry ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <IconBadge
                  name="checkmark"
                  size={36}
                  fill={colors.successBg}
                  color={colors.success}
                />
                <AppText
                  variant="heading"
                  style={{ flex: 1 }}
                >{`✓ ${selectedCountry.name}`}</AppText>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('onb.changeCountry')}
                  onPress={() => {
                    setCountry(null);
                    setCountryQuery('');
                  }}
                  style={{
                    minHeight: MIN_TOUCH_TARGET,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.sm,
                  }}
                >
                  <AppText variant="label" style={{ color: colors.primary }}>
                    {t('onb.changeCountry')}
                  </AppText>
                </Pressable>
              </View>
            ) : (
              <>
                <BigField
                  label={t('onb.country')}
                  icon="search"
                  value={countryQuery}
                  onChangeText={(v) => {
                    setCountryQuery(v);
                    setCountry(null);
                  }}
                  placeholder={t('onb.countrySearch')}
                />
                {countryQuery.length > 0
                  ? filtered.map((c) => (
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
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: spacing.sm,
                          paddingHorizontal: spacing.md,
                          borderRadius: radius.md,
                          backgroundColor: colors.background,
                          borderWidth: 1,
                          borderColor: colors.border,
                        }}
                      >
                        <Ionicons name="location" size={18} color={colors.textMuted} />
                        <AppText style={{ flex: 1 }}>{c.name}</AppText>
                        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                      </Pressable>
                    ))
                  : null}
              </>
            )}
          </StepCard>
          <StepCard icon="resize" title={t('onb.units')}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(
                [
                  ['metric', 'speedometer', t('common.metric')],
                  ['imperial', 'flag', t('common.imperial')],
                ] as const
              ).map(([v, icon, label]) => (
                <View key={v} style={{ flex: 1 }}>
                  <IconChoice
                    icon={icon}
                    label={label}
                    selected={units === v}
                    onPress={() => setUnits(v)}
                    tint={brand.lime}
                  />
                </View>
              ))}
            </View>
          </StepCard>
        </>
      )}

      {step === 2 && (
        <>
          <StepCard
            icon="shield-checkmark"
            title={t('onb.consentTitle')}
            note={t('onb.consentBody')}
          >
            <AppText variant="caption" muted>
              {t('onb.consentSummary')}
            </AppText>
          </StepCard>
          {(Object.keys(CONSENT_LABEL) as ConsentPurpose[]).map((p) => {
            const [labelKey, bodyKey] = CONSENT_LABEL[p];
            return (
              <TrustCard
                key={p}
                icon={CONSENT_ICON[p]}
                title={t(labelKey)}
                body={t(bodyKey)}
                required={!OPTIONAL_CONSENTS.includes(p)}
                value={consents[p]}
                onChange={(v) => setConsents({ ...consents, [p]: v })}
                requiredLabel={t('onb.tagRequired')}
                optionalLabel={t('onb.tagOptional')}
              />
            );
          })}
        </>
      )}

      {step === 3 && (
        <>
          <StepCard icon="body" title={t('onb.bodyTitle')} note={t('onb.bodyBody')}>
            {units === 'metric' ? (
              <BigField
                label={t('onb.heightCm')}
                icon="resize"
                suffix="cm"
                value={heightCm}
                onChangeText={setHeightCm}
                keyboardType="decimal-pad"
              />
            ) : (
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <BigField
                    label={t('onb.heightFt')}
                    icon="resize"
                    suffix="ft"
                    value={feet}
                    onChangeText={setFeet}
                    keyboardType="number-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <BigField
                    label={t('onb.heightIn')}
                    icon="resize"
                    suffix="in"
                    value={inches}
                    onChangeText={setInches}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            )}
            <BigField
              label={`${t('onb.weight')} (${unitWord})`}
              icon="scale"
              suffix={unitWord}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
            />
          </StepCard>
          <StepCard icon="people" title={t('onb.sex')}>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {(
                [
                  ['female', 'female'],
                  ['male', 'male'],
                  ['unspecified', 'help-circle'],
                ] as const
              ).map(([v, icon]) => (
                <View key={v} style={{ flex: 1 }}>
                  <IconChoice
                    icon={icon}
                    label={t(`sex.${v}` as StringKey)}
                    selected={sex === v}
                    onPress={() => setSex(v)}
                    tint={brand.lime}
                  />
                </View>
              ))}
            </View>
          </StepCard>
          <StepCard icon="walk" title={t('onb.activity')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(
                [
                  ['low', 'bed'],
                  ['light', 'walk'],
                  ['moderate', 'bicycle'],
                  ['high', 'flame'],
                ] as const
              ).map(([v, icon]) => (
                <View key={v} style={{ flexBasis: '47%', flexGrow: 1 }}>
                  <IconChoice
                    icon={icon}
                    label={t(`activity.${v}` as StringKey)}
                    selected={activity === v}
                    onPress={() => setActivity(v)}
                    tint={brand.lime}
                  />
                </View>
              ))}
            </View>
          </StepCard>
        </>
      )}

      {step === 4 && (
        <>
          <StepCard icon="heart" title={t('onb.readyTitle')} note={t('onb.readyBody')}>
            <AppText variant="caption" muted>
              {t('onb.readyProgress', {
                n: READINESS_QUESTIONS.filter((q) => answers[q] !== undefined).length,
                total: READINESS_QUESTIONS.length,
              })}
            </AppText>
          </StepCard>
          {READINESS_QUESTIONS.map((q) => (
            <YesNoCard
              key={q}
              question={t(`ready.q.${q}` as StringKey)}
              value={answers[q]}
              onChange={(v) => setAnswers({ ...answers, [q]: v })}
              yes={t('ready.yes')}
              no={t('ready.no')}
            />
          ))}
          {readiness.flagged.length > 0 ? <Notice>{t('onb.readyNote')}</Notice> : null}
        </>
      )}

      {step === 5 && (
        <>
          <StepCard icon="flag" title={t('onb.goalTitle')} note={t('onb.goalBody')}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(
                [
                  ['none', 'remove-circle', t('onb.goalSkip')],
                  ['lose', 'trending-down', t('goals.lose')],
                  ['maintain', 'swap-horizontal', t('goals.maintain')],
                  ['gain', 'trending-up', t('goals.gain')],
                ] as const
              ).map(([v, icon, label]) => (
                <View key={v} style={{ flexBasis: '47%', flexGrow: 1 }}>
                  <IconChoice
                    icon={icon}
                    label={label}
                    selected={goalType === v}
                    onPress={() => setGoalType(v)}
                    tint={brand.lime}
                  />
                </View>
              ))}
            </View>
          </StepCard>
          {goalType !== 'none' && (
            <StepCard icon="calendar" title={t('goals.period')}>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {(['weekly', 'monthly', 'yearly'] as const).map((v) => (
                  <View key={v} style={{ flex: 1 }}>
                    <IconChoice
                      icon="calendar"
                      label={t(`goals.${v}` as StringKey)}
                      selected={goalPeriod === v}
                      onPress={() => setGoalPeriod(v)}
                      tint={brand.lime}
                    />
                  </View>
                ))}
              </View>
              {goalType !== 'maintain' && (
                <BigField
                  label={t('goals.target', { unit: unitWord })}
                  icon="trophy"
                  suffix={unitWord}
                  hint={t('goals.targetHint')}
                  value={goalTarget}
                  onChangeText={setGoalTarget}
                  keyboardType="decimal-pad"
                />
              )}
            </StepCard>
          )}
          {goalType !== 'none' && proposal ? (
            <View
              style={{
                borderRadius: radius.lg,
                borderWidth: 2,
                borderColor: proposal.status === 'block' ? colors.warningText : colors.primary,
                backgroundColor: proposal.status === 'block' ? colors.warningBg : colors.surface,
                padding: spacing.lg,
                gap: spacing.xs,
              }}
            >
              <AppText variant="label">
                {t(proposal.status === 'block' ? 'goals.blocked' : 'onb.goalProposed')}
              </AppText>
              {proposal.goal ? (
                <AppText variant="title">{`${formatWeight(proposal.goal.startKg, units)} → ${formatWeight(proposal.goal.targetKg, units)}`}</AppText>
              ) : null}
              {proposal.goal ? (
                <AppText
                  variant="caption"
                  muted
                >{`${t(`goals.${proposal.goal.period}` as StringKey)} (${t('goals.until', { date: goalEndDate(todayIso(), goalPeriod) })})`}</AppText>
              ) : null}
              {proposal.reasons.map((r) => (
                <AppText key={r} variant="caption" muted>
                  {r}
                </AppText>
              ))}
            </View>
          ) : null}
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
