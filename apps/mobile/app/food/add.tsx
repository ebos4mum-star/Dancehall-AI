import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { IconChoice, SectionTitle } from '@/ui/kit';
import { brand } from '@/theme/tokens';
import { router, useLocalSearchParams } from 'expo-router';
import {
  CURATED_FOODS,
  itemFromFood,
  manualItem,
  searchFoods,
  type FoodRef,
} from '@dancehall/shared';
import { useDraft } from '@/food/draft';
import { useFoodData } from '@/food/hooks';
import { recentFoods } from '@/food/recent';
import { useNumbersHidden } from '@/wellness/hooks';
import { FoodBadge, PortionStepper, kcalText, macroText } from '@/food/ui';
import { t } from '@/i18n';
import { parseDecimal } from '@/lib/format';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

export default function AddFood() {
  const hideNumbers = useNumbersHidden();
  const { replaceKey, from } = useLocalSearchParams<{ replaceKey?: string; from?: string }>();
  const { dispatch } = useDraft();
  const { colors, spacing, radius } = useTheme();
  const [tab, setTab] = useState<'search' | 'manual'>('search');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<FoodRef | null>(null);
  const [grams, setGrams] = useState(100);
  const { logs } = useFoodData();
  const recents = useMemo(() => recentFoods(logs), [logs]);
  const results = useMemo(() => searchFoods(q, CURATED_FOODS, 8), [q]);

  const [name, setName] = useState('');
  const [g, setG] = useState('');
  const [kcal, setKcal] = useState('');
  const [p, setP] = useState('');
  const [c, setC] = useState('');
  const [f, setF] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const done = (item: ReturnType<typeof itemFromFood>) => {
    if (replaceKey) dispatch({ type: 'update', key: replaceKey, item });
    else dispatch({ type: 'add', item });
    // From the review screen go back to it; from anywhere else, open the review screen for this meal.
    if (from === 'review' || replaceKey) router.back();
    else router.replace('/food/review');
  };
  const preview = picked
    ? itemFromFood(picked, grams, {
        source: 'curated',
        confidence: 'high',
        userEdited: !!replaceKey,
      })
    : null;

  return (
    <Screen
      top={false}
      banner={{
        world: 'food',
        title: t('ban.foodAdd.title'),
        line: t('ban.foodAdd.line'),
        pulse: 'idle',
      }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {(
          [
            { v: 'search', icon: 'search', label: t('add.searchTab') },
            { v: 'manual', icon: 'create', label: t('add.manualTab') },
          ] as const
        ).map((o) => (
          <View key={o.v} style={{ flex: 1 }}>
            <IconChoice
              icon={o.icon}
              label={o.label}
              selected={tab === o.v}
              onPress={() => setTab(o.v)}
              tint={brand.lime}
            />
          </View>
        ))}
      </View>
      {tab === 'search' ? (
        <>
          <TextField label={t('add.search')} value={q} onChangeText={setQ} autoCapitalize="none" />
          <AppText variant="caption" muted>
            {t('food.sourceNote')}
          </AppText>
          {q.trim() === '' && recents.length > 0 ? (
            <View style={{ gap: spacing.xs }}>
              <SectionTitle icon="repeat" title={t('add.recent')} />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: spacing.sm, paddingVertical: spacing.xs }}
              >
                {recents.map((r) => (
                  <Pressable
                    key={`${r.foodId ?? r.name}-${r.grams}`}
                    accessibilityRole="button"
                    accessibilityLabel={t('add.recentItem', {
                      name: r.name,
                      g: Math.round(r.grams),
                    })}
                    onPress={() => done({ ...r, userEdited: r.userEdited })}
                    style={{
                      width: 132,
                      minHeight: 104,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.surface,
                      padding: spacing.sm,
                      gap: spacing.xs,
                      alignItems: 'flex-start',
                    }}
                  >
                    <FoodBadge foodId={r.foodId} size={36} />
                    <AppText variant="label" numberOfLines={2}>
                      {r.name}
                    </AppText>
                    <AppText variant="caption" muted>
                      {hideNumbers
                        ? `${Math.round(r.grams)} g`
                        : `${Math.round(r.grams)} g · ~${Math.round(r.kcal)} kcal`}
                    </AppText>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          {results.length === 0 ? <Notice>{t('add.none')}</Notice> : null}
          {results.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={r.staged ? `${r.name}, ${t('food.stagedTag')}` : r.name}
              onPress={() => {
                setPicked(r);
                setGrams(r.servingG);
              }}
              style={{
                minHeight: 56,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                padding: spacing.sm,
                borderRadius: radius.md,
                borderWidth: picked?.id === r.id ? 2 : 1,
                borderColor: picked?.id === r.id ? colors.primary : colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <FoodBadge foodId={r.id} size={40} />
              <View style={{ flex: 1 }}>
                <AppText variant="label">{r.name}</AppText>
                <AppText variant="caption" muted>
                  {hideNumbers
                    ? r.servingLabel
                    : t('add.serving', {
                        label: r.servingLabel,
                        kcal: Math.round((r.per100g.kcal * r.servingG) / 100),
                      })}
                </AppText>
                {r.staged ? (
                  <AppText variant="caption" muted>
                    {t('food.stagedTag')}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          ))}
          {picked && preview ? (
            <DepthCard>
              <AppText variant="heading">{picked.name}</AppText>
              {picked.staged ? (
                <AppText variant="caption" muted>
                  {t('food.stagedSource', {
                    source: picked.staged.sourceFoodId,
                    version: picked.staged.sourceVersion,
                  })}
                </AppText>
              ) : null}
              <AppText variant="caption" muted>
                {t('add.portion')}
              </AppText>
              <PortionStepper grams={grams} onChange={setGrams} />
              {hideNumbers ? null : (
                <>
                  <AppText>{kcalText(preview)}</AppText>
                  <AppText variant="caption" muted>
                    {macroText(preview)}
                  </AppText>
                </>
              )}
              <Button label={t('add.add')} onPress={() => done(preview)} />
            </DepthCard>
          ) : null}
        </>
      ) : (
        <DepthCard>
          <AppText variant="caption" muted>
            {t('add.manualNote')}
          </AppText>
          <TextField label={t('add.name')} value={name} onChangeText={setName} maxLength={80} />
          <TextField
            label={t('add.portion')}
            value={g}
            onChangeText={setG}
            keyboardType="decimal-pad"
          />
          {hideNumbers ? (
            <AppText variant="caption" muted>
              {t('add.manualHidden')}
            </AppText>
          ) : (
            <>
              <TextField
                label={t('add.kcal')}
                value={kcal}
                onChangeText={setKcal}
                keyboardType="decimal-pad"
              />
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <TextField
                    label={`${t('food.protein')} g`}
                    value={p}
                    onChangeText={setP}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    label={`${t('food.carbs')} g`}
                    value={c}
                    onChangeText={setC}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    label={`${t('food.fat')} g`}
                    value={f}
                    onChangeText={setF}
                    keyboardType="decimal-pad"
                  />
                </View>
              </View>
            </>
          )}
          {err ? <Notice tone="warning">{err}</Notice> : null}
          <Button
            label={t('add.add')}
            onPress={() => {
              const grams = parseDecimal(g);
              // With numbers hidden the person is not asked for calories; the entry is saved without nutrition values.
              const k = hideNumbers ? 0 : parseDecimal(kcal);
              if (
                name.trim().length < 1 ||
                grams === null ||
                grams <= 0 ||
                grams > 5000 ||
                k === null ||
                k > 10000
              )
                return setErr(t('err.invalid_input'));
              done(
                manualItem({
                  name,
                  grams,
                  kcal: k,
                  proteinG: hideNumbers ? 0 : (parseDecimal(p) ?? 0),
                  carbsG: hideNumbers ? 0 : (parseDecimal(c) ?? 0),
                  fatG: hideNumbers ? 0 : (parseDecimal(f) ?? 0),
                }),
              );
            }}
          />
        </DepthCard>
      )}
    </Screen>
  );
}
