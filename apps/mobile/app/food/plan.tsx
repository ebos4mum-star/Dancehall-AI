import { useMemo, useState } from 'react';
import { View } from 'react-native';
import {
  BUDGET_LEVELS,
  planMeals,
  totals,
  type BudgetLevel,
  type MealPlanDraft,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { useFoodData } from '@/food/hooks';
import { kcalText } from '@/food/ui';
import { t, type StringKey } from '@/i18n';
import { formatDate, parseDecimal, todayIso } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Choice } from '@/ui/Choice';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';
import { haptics } from '@/ui/haptics';

const REGIONS = [
  'any',
  'west_african',
  'caribbean',
  'south_asian',
  'mediterranean',
  'latin_american',
  'american',
] as const;
type Region = (typeof REGIONS)[number];

export default function Plan() {
  const { store } = useApp();
  const { guide } = useFoodData();
  const { spacing } = useTheme();
  const { data: plans } = useLoad((s) => s.listMealPlans());
  const [days, setDays] = useState<'3' | '7'>('3');
  const [level, setLevel] = useState<BudgetLevel>('low');
  const [region, setRegion] = useState<Region>('any');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [seed, setSeed] = useState(0);
  const [preview, setPreview] = useState<MealPlanDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const build = (sd: number) => {
    if (!guide) return;
    setPreview(
      planMeals({
        days: Number(days),
        targetKcal: guide.guideKcal,
        floorKcal: guide.floorKcal,
        budgetLevel: level,
        regions: region === 'any' ? [] : [region],
        seed: sd,
      }),
    );
  };
  const save = async () => {
    if (!preview) return;
    setErr(null);
    const a = amount.trim() === '' ? null : parseDecimal(amount);
    const c = currency.trim().toUpperCase();
    if (
      (a === null) !== (c === '') ||
      (a === null && amount.trim() !== '') ||
      (c !== '' && !/^[A-Z]{3}$/.test(c))
    )
      return setErr(t('err.invalid_input'));
    try {
      await store.createMealPlan({
        name: t('plan.name', { n: preview.days.length }),
        startDate: todayIso(),
        budgetLevel: preview.budgetLevel,
        budgetCents: a === null ? null : Math.round(a * 100),
        currency: a === null ? null : c,
        plan: preview,
      });
      haptics.success();
      setPreview(null);
      setMsg(t('rev.saved'));
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  const mealsText = useMemo(
    () => (d: MealPlanDraft['days'][number]) =>
      d.meals.map(
        (m) =>
          `${t(`food.meal.${m.mealType}` as StringKey)}: ${m.items.map((i) => `${i.name} ${Math.round(i.grams)} g`).join(', ')}`,
      ),
    [],
  );

  return (
    <Screen top={false}>
      <AppText muted>{t('plan.intro')}</AppText>
      {!guide ? (
        <Notice>{t('plan.needProfile')}</Notice>
      ) : (
        <AppText
          variant="caption"
          muted
        >{`${t('plan.guide', { kcal: guide.guideKcal })}. ${t('food.guideNote')}`}</AppText>
      )}
      <DepthCard>
        <Choice
          label={t('plan.days')}
          value={days}
          onChange={setDays}
          options={[
            { value: '3', label: '3' },
            { value: '7', label: '7' },
          ]}
        />
        <Choice
          label={t('plan.budget')}
          value={level}
          onChange={setLevel}
          options={BUDGET_LEVELS.map((b) => ({ value: b, label: t(`plan.${b}` as StringKey) }))}
        />
        <Choice
          label={t('plan.cuisine')}
          value={region}
          onChange={setRegion}
          options={REGIONS.map((r) => ({ value: r, label: t(`region.${r}` as StringKey) }))}
        />
        <TextField
          label={t('plan.amount')}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
        />
        <TextField
          label={t('plan.currency')}
          value={currency}
          onChangeText={setCurrency}
          autoCapitalize="characters"
          maxLength={3}
        />
        <AppText variant="caption" muted>
          {t('plan.costNote')}
        </AppText>
        <Button
          label={t('plan.preview')}
          disabled={!guide}
          onPress={() => {
            setMsg(null);
            build(seed);
          }}
        />
      </DepthCard>
      {err ? <Notice tone="warning">{err}</Notice> : null}
      {msg ? <Notice>{msg}</Notice> : null}
      {preview ? (
        <View style={{ gap: spacing.md }}>
          {preview.days.map((d) => (
            <DepthCard key={d.dayIndex}>
              <AppText variant="heading">{t('plan.day', { n: d.dayIndex + 1 })}</AppText>
              {mealsText(d).map((line) => (
                <AppText key={line} variant="caption" muted>
                  {line}
                </AppText>
              ))}
              <AppText variant="label">{kcalText(d.totals)}</AppText>
            </DepthCard>
          ))}
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Button label={t('plan.save')} onPress={save} />
            <Button
              variant="secondary"
              label={t('plan.shuffle')}
              onPress={() => {
                setSeed(seed + 1);
                build(seed + 1);
              }}
            />
          </View>
        </View>
      ) : null}
      <AppText variant="heading" accessibilityRole="header">
        {t('plan.mine')}
      </AppText>
      {plans && plans.length === 0 ? <AppText muted>{t('plan.none')}</AppText> : null}
      {(plans ?? []).map((p) => (
        <DepthCard key={p.id}>
          <AppText variant="label">{`${p.name} · ${formatDate(p.startDate)} · ${t(`plan.${p.budgetLevel}` as StringKey)}`}</AppText>
          <AppText
            variant="caption"
            muted
          >{`${p.items.length} items · ~${Math.round(totals(p.items.map((i) => ({ name: i.name, foodId: i.foodId, grams: i.grams, kcal: i.kcal, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG, kcalLow: i.kcal, kcalHigh: i.kcal, source: 'curated', confidence: 'medium', userEdited: false }))).kcal / p.days)} kcal/day`}</AppText>
          <Button
            variant="secondary"
            label={t('common.delete')}
            onPress={async () => {
              try {
                await store.deleteMealPlan(p.id);
              } catch (e) {
                setErr(errorMessage(e));
              }
            }}
          />
        </DepthCard>
      ))}
    </Screen>
  );
}
