import { withAccount } from '@/account/gate';
import { Disclosure, IconBadge, IconChoice, type IconName } from '@/ui/kit';
import { FoodHero } from '@/food/kit';
import { BigField } from '@/onboarding/kit';
import { EmptyState } from '@/ui/EmptyState';
import { brand } from '@/theme/tokens';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import {
  BUDGET_LEVELS,
  FOOD_BY_ID,
  planMeals,
  totals,
  type BudgetLevel,
  type MealPlanDraft,
  parsePrefs,
  regionTagsFor,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { useFoodData } from '@/food/hooks';
import { GroceryList } from '@/food/GroceryList';
import { kcalText } from '@/food/ui';
import { t, type StringKey } from '@/i18n';
import { formatDate, parseDecimal, todayIso } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';
import { useNumbersHidden } from '@/wellness/hooks';

// The priority cuisines first (Jamaican, Caribbean, West, East and Southern African), then the others. One taxonomy: see cuisines.ts.
const REGIONS = [
  'any',
  'jamaican',
  'caribbean',
  'west_african',
  'east_african',
  'southern_african',
  'south_asian',
  'mediterranean',
  'latin_american',
  'american',
] as const;
type Region = (typeof REGIONS)[number];
const MEAL_ICON: Record<string, IconName> = {
  breakfast: 'sunny',
  lunch: 'restaurant',
  dinner: 'moon',
  snack: 'nutrition',
};

function Plan() {
  const hideNumbers = useNumbersHidden();
  const { store } = useApp();
  const { guide } = useFoodData();
  const { spacing } = useTheme();
  const { data: plans } = useLoad((s) => s.listMealPlans());
  const [days, setDays] = useState<'3' | '7'>('3');
  const [level, setLevel] = useState<BudgetLevel>('low');
  const [region, setRegion] = useState<Region>('any');
  const [regionTouched, setRegionTouched] = useState(false);
  // Start from the first cuisine the person chose in My approach, until they pick something here.
  const { data: savedPrefs } = useLoad(async (s) => (await s.getWellnessPrefs?.()) ?? null);
  useEffect(() => {
    if (regionTouched) return;
    const first = parsePrefs(savedPrefs).cuisines.find((c) =>
      (REGIONS as readonly string[]).includes(c),
    );
    if (first) setRegion(first as Region);
  }, [savedPrefs, regionTouched]);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [seed, setSeed] = useState(0);
  const [preview, setPreview] = useState<MealPlanDraft | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [openList, setOpenList] = useState<string | null>(null);

  const build = (sd: number) => {
    if (!guide) return;
    setPreview(
      planMeals({
        days: Number(days),
        targetKcal: guide.guideKcal,
        floorKcal: guide.floorKcal,
        budgetLevel: level,
        regions: region === 'any' ? [] : regionTagsFor([region]),
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

  return (
    <Screen>
      <FoodHero
        title={t('ban.foodPlan.title')}
        line={t('food2.planLine')}
        pulse={preview ? 'welcome' : 'idle'}
        stats={
          guide && !hideNumbers
            ? [{ label: t('food2.planGuide'), value: `${guide.guideKcal} kcal` }]
            : []
        }
      />
      <AppText muted>{t('plan.intro')}</AppText>
      {!guide ? (
        <Notice>{t('plan.needProfile')}</Notice>
      ) : hideNumbers ? null : (
        <AppText
          variant="caption"
          muted
        >{`${t('plan.guide', { kcal: guide.guideKcal })}. ${t('food.guideNote')}`}</AppText>
      )}
      <AppText variant="heading" accessibilityRole="header">
        {t('food2.planStep1')}
      </AppText>
      <DepthCard>
        <AppText variant="label">{t('plan.days')}</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['3', '7'] as const).map((d) => (
            <View key={d} style={{ flex: 1 }}>
              <IconChoice
                icon="calendar"
                label={t('food2.planDays', { n: d })}
                selected={days === d}
                onPress={() => setDays(d)}
              />
            </View>
          ))}
        </View>
        <AppText variant="label">{t('plan.budget')}</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {BUDGET_LEVELS.map((b) => (
            <View key={b} style={{ flex: 1 }}>
              <IconChoice
                icon={b === 'low' ? 'leaf' : b === 'medium' ? 'basket' : 'cart'}
                label={t(`plan.${b}` as StringKey)}
                selected={level === b}
                onPress={() => setLevel(b)}
                tint={brand.lime}
              />
            </View>
          ))}
        </View>
        <AppText variant="label">{t('plan.cuisine')}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {REGIONS.map((r) => (
            <IconChoice
              key={r}
              icon="earth"
              label={t(`region.${r}` as StringKey)}
              selected={region === r}
              onPress={() => {
                setRegionTouched(true);
                setRegion(r);
              }}
              tint={brand.coral}
            />
          ))}
        </View>
        <Disclosure title={t('food2.planMore')} summary={t('plan.costNote')}>
          <BigField
            icon="cash"
            label={t('plan.amount')}
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
          />
          <BigField
            icon="card"
            label={t('plan.currency')}
            value={currency}
            onChangeText={setCurrency}
            autoCapitalize="none"
            maxLength={3}
          />
        </Disclosure>
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
          <AppText variant="heading" accessibilityRole="header">
            {t('food2.planStep2')}
          </AppText>
          {preview.days.some((d) =>
            d.meals.some((m) => m.items.some((i) => i.foodId && FOOD_BY_ID.get(i.foodId)?.staged)),
          ) ? (
            <Notice tone="warning">{t('plan.stagedNote')}</Notice>
          ) : null}
          {preview.days.map((d) => (
            <DepthCard key={d.dayIndex}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <IconBadge name="calendar" size={32} />
                <AppText variant="heading" style={{ flex: 1 }}>
                  {t('plan.day', { n: d.dayIndex + 1 })}
                </AppText>
                {hideNumbers ? null : (
                  <AppText variant="caption" muted>
                    {kcalText(d.totals)}
                  </AppText>
                )}
              </View>
              {d.meals.map((m) => (
                <View key={m.mealType} style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <IconBadge
                    name={MEAL_ICON[m.mealType] ?? 'restaurant'}
                    size={28}
                    fill={brand.violet}
                  />
                  <View style={{ flex: 1 }}>
                    <AppText variant="label">{t(`food.meal.${m.mealType}` as StringKey)}</AppText>
                    <AppText variant="caption" muted>
                      {m.items.map((i) => `${i.name} ${Math.round(i.grams)} g`).join(', ')}
                    </AppText>
                  </View>
                </View>
              ))}
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
        {t('food2.planStep3')}
      </AppText>
      {plans && plans.length === 0 ? (
        <EmptyState icon="bookmark-outline" title={t('plan.mine')} body={t('food2.planEmpty')} />
      ) : null}
      {(plans ?? []).map((p) => (
        <DepthCard key={p.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <IconBadge name="bookmark" size={36} fill={brand.lime} />
            <View style={{ flex: 1 }}>
              <AppText variant="label">{`${p.name} · ${formatDate(p.startDate)}`}</AppText>
              <AppText
                variant="caption"
                muted
              >{`${t(`plan.${p.budgetLevel}` as StringKey)} · ${p.items.length} items${hideNumbers ? '' : ` · ~${Math.round(totals(p.items.map((i) => ({ name: i.name, foodId: i.foodId, grams: i.grams, kcal: i.kcal, proteinG: i.proteinG, carbsG: i.carbsG, fatG: i.fatG, kcalLow: i.kcal, kcalHigh: i.kcal, source: 'curated', confidence: 'medium', userEdited: false }))).kcal / p.days)} kcal/day`}`}</AppText>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Button
              variant="secondary"
              label={openList === p.id ? t('grocery.hide') : t('grocery.show')}
              onPress={() => setOpenList(openList === p.id ? null : p.id)}
            />
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
          </View>
          {openList === p.id ? <GroceryList planName={p.name} items={p.items} /> : null}
        </DepthCard>
      ))}
    </Screen>
  );
}

/** Needs an account: a guest is sent to create one and then brought back here. */
export default withAccount(Plan, 'meal_plan');
