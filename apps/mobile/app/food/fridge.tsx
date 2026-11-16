import { withAccount } from '@/account/gate';
import { useMemo, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { router } from 'expo-router';
import {
  FOOD_BY_ID,
  RECIPES_NOTICE,
  dietTags,
  fridgeMatches,
  parsePrefs,
  recipeItems,
  recipeNutrition,
  resolveIngredients,
  substituteIn,
  substitutesFor,
  type FridgeMatch,
  type Recipe,
} from '@dancehall/shared';
import { useLoad } from '@/data/hooks';
import { newKey, useDraft } from '@/food/draft';
import { FoodHero } from '@/food/kit';
import { buildGroceryList, groceryText } from '@/food/grocery';
import { kcalText } from '@/food/ui';
import { BigField } from '@/onboarding/kit';
import { t } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { useNumbersHidden } from '@/wellness/hooks';

/** Fridge to meal: type what you have, see what you can cook, adjust with swaps, log it or share what is missing. Rule-based; nothing leaves the device. */
function Fridge() {
  const { spacing, colors, radius } = useTheme();
  const hideNumbers = useNumbersHidden();
  const { dispatch } = useDraft();
  const { data: savedPrefs } = useLoad(async (s) => (await s.getWellnessPrefs?.()) ?? null);
  const prefs = parsePrefs(savedPrefs);
  const diet = prefs.diet.includes('vegan')
    ? 'vegan'
    : prefs.diet.includes('vegetarian')
      ? 'vegetarian'
      : null;
  const unchecked = prefs.diet.filter((d) => !['vegan', 'vegetarian'].includes(d));
  const [text, setText] = useState('');
  const [have, setHave] = useState<string[]>([]);
  const [unknown, setUnknown] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [swaps, setSwaps] = useState<Record<string, Record<string, string>>>({});
  const matches = useMemo(() => fridgeMatches(have, { diet, regions: [] }), [have, diet]);

  const add = () => {
    const words = text
      .split(/[,\n]/)
      .map((w) => w.trim())
      .filter(Boolean);
    const r = resolveIngredients(words);
    setHave((h) => [...new Set([...h, ...r.ids])]);
    setUnknown(r.unknown);
    setText('');
  };
  const applied = (m: FridgeMatch): Recipe => substituteIn(m.recipe, swaps[m.recipe.id] ?? {});
  const logIt = (r: Recipe) => {
    dispatch({
      type: 'start',
      draft: {
        items: recipeItems(r, 1).map((i) => ({ ...i, key: newKey() })),
        source: 'manual',
        mealType: r.mealTypes[0],
      },
    });
    router.push('/food/review');
  };
  const shareMissing = (m: FridgeMatch) => {
    const lines = buildGroceryList(
      m.missing.map((id) => {
        const ing = m.recipe.ingredients.find((i) => i.foodId === id)!;
        return { foodId: id, name: FOOD_BY_ID.get(id)?.name ?? id, grams: ing.grams };
      }),
    );
    void Share.share({ message: groceryText(m.recipe.name, lines) });
  };

  return (
    <Screen>
      <FoodHero title={t('fridge.title')} line={t('fridge.line')} />
      <BigField
        icon="nutrition"
        label={t('fridge.input')}
        hint={t('fridge.hint')}
        value={text}
        onChangeText={setText}
        autoCapitalize="none"
      />
      <Button label={t('fridge.add')} disabled={text.trim() === ''} onPress={add} />
      {have.length === 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {STARTERS.map((w) => (
            <Pressable
              key={w}
              accessibilityRole="button"
              accessibilityLabel={w}
              onPress={() => {
                const r = resolveIngredients([w]);
                setHave((h) => [...new Set([...h, ...r.ids])]);
              }}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <AppText variant="caption">{`+ ${w}`}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {unknown.length > 0 ? (
        <Notice tone="warning">{t('fridge.unknown', { list: unknown.join(', ') })}</Notice>
      ) : null}
      {have.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {have.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={t('fridge.remove', { name: FOOD_BY_ID.get(id)?.name ?? id })}
              onPress={() => setHave((h) => h.filter((x) => x !== id))}
              style={{
                minHeight: 44,
                justifyContent: 'center',
                paddingHorizontal: spacing.md,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <AppText variant="caption">{`${FOOD_BY_ID.get(id)?.name ?? id}  ✕`}</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
      {unchecked.length > 0 ? <Notice tone="warning">{t('fridge.unchecked')}</Notice> : null}
      <Notice>{RECIPES_NOTICE}</Notice>
      {have.length > 0 && matches.length === 0 ? <AppText muted>{t('fridge.none')}</AppText> : null}
      {matches.map((m) => {
        const r = applied(m);
        const isOpen = open === m.recipe.id;
        const nutri = recipeNutrition(r, 1);
        const tags = dietTags(m.recipe);
        return (
          <DepthCard key={m.recipe.id}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={m.recipe.name}
              onPress={() => setOpen(isOpen ? null : m.recipe.id)}
              style={{ minHeight: 48, gap: 2 }}
            >
              <AppText variant="heading">{m.recipe.name}</AppText>
              <AppText variant="caption" muted>
                {m.missing.length === 0
                  ? t('fridge.haveAll')
                  : t('fridge.missing', {
                      list: m.missing.map((id) => FOOD_BY_ID.get(id)?.name ?? id).join(', '),
                    })}
                {hideNumbers ? '' : ` · ${kcalText(nutri)}`}
              </AppText>
            </Pressable>
            {isOpen ? (
              <View style={{ gap: spacing.sm }}>
                {tags.vegan || tags.vegetarian ? (
                  <AppText variant="caption" muted>
                    {tags.vegan ? t('fridge.vegan') : t('fridge.vegetarian')}
                  </AppText>
                ) : null}
                {m.recipe.ingredients.map((i) => {
                  const cur = r.ingredients.find(
                    (x) => x.foodId === (swaps[m.recipe.id]?.[i.foodId] ?? i.foodId),
                  )!;
                  const options = substitutesFor(i.foodId, i.grams, { diet, limit: 3 });
                  return (
                    <View key={i.foodId} style={{ gap: 2 }}>
                      <AppText variant="label">
                        {`${FOOD_BY_ID.get(cur.foodId)?.name} · ${Math.round(cur.grams)} g${i.optional ? ` (${t('fridge.optional')})` : ''}`}
                      </AppText>
                      {options.length > 0 ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                          {swaps[m.recipe.id]?.[i.foodId] ? (
                            <Button
                              variant="secondary"
                              label={t('fridge.undoSwap')}
                              onPress={() =>
                                setSwaps((s) => {
                                  const next = { ...(s[m.recipe.id] ?? {}) };
                                  delete next[i.foodId];
                                  return { ...s, [m.recipe.id]: next };
                                })
                              }
                            />
                          ) : (
                            options.map((o) => (
                              <Button
                                key={o.food.id}
                                variant="secondary"
                                label={t('fridge.swapTo', { name: o.food.name })}
                                onPress={() =>
                                  setSwaps((s) => ({
                                    ...s,
                                    [m.recipe.id]: {
                                      ...(s[m.recipe.id] ?? {}),
                                      [i.foodId]: o.food.id,
                                    },
                                  }))
                                }
                              />
                            ))
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                })}
                {m.recipe.steps.map((s, n) => (
                  <AppText key={n} variant="caption">{`${n + 1}. ${s}`}</AppText>
                ))}
                <AppText variant="caption" muted>
                  {t('fridge.estimate')}
                </AppText>
                <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <Button label={t('fridge.log')} onPress={() => logIt(r)} />
                  {m.missing.length > 0 ? (
                    <Button
                      variant="secondary"
                      label={t('fridge.shareMissing')}
                      onPress={() => shareMissing(m)}
                    />
                  ) : null}
                </View>
              </View>
            ) : null}
          </DepthCard>
        );
      })}
    </Screen>
  );
}

const STARTERS = ['eggs', 'rice', 'chicken', 'banana', 'oats', 'tomato', 'beans', 'spinach'];

export default withAccount(Fridge, 'log_food');
