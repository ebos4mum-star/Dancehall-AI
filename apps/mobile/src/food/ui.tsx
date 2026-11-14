import { useState } from 'react';
import { Pressable, View } from 'react-native';
import {
  CURATED_FOODS,
  FOOD_BY_ID,
  SWAP_MODES,
  estimateStatus,
  itemFromFood,
  rescaleItem,
  suggestSwaps,
  type EstimateStatus,
  type FoodItemValues,
  type SwapMode,
  type Totals,
} from '@dancehall/shared';
import { t, type StringKey } from '@/i18n';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Choice } from '@/ui/Choice';
import { DepthCard } from '@/ui/Depth';
import { foodEmoji } from './emoji';

/** Says how far to trust a value. Words carry the meaning; color only reinforces it. */
export function EstimateTag({ status }: { status: EstimateStatus }) {
  const { colors, radius, spacing } = useTheme();
  const tone =
    status === 'estimate'
      ? { bg: colors.warningBg, fg: colors.warningText, mark: '≈' }
      : status === 'reference'
        ? { bg: colors.surface, fg: colors.textMuted, mark: '' }
        : { bg: colors.successBg, fg: colors.success, mark: '✓' };
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: tone.bg,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderWidth: status === 'reference' ? 1 : 0,
        borderColor: colors.border,
      }}
    >
      <AppText
        variant="caption"
        style={{ color: tone.fg }}
      >{`${tone.mark ? `${tone.mark} ` : ''}${t(`food.tag.${status}` as StringKey)}`}</AppText>
    </View>
  );
}

/** "about 420 kcal (350–490)": values are always shown as approximate with their range. */
export function kcalText(i: Pick<FoodItemValues, 'kcal' | 'kcalLow' | 'kcalHigh'>): string {
  return `${t('food.kcalAbout', { kcal: i.kcal })} ${t('food.range', { low: i.kcalLow, high: i.kcalHigh })}`;
}
export const macroText = (i: Pick<FoodItemValues, 'proteinG' | 'carbsG' | 'fatG'>): string =>
  `${t('food.protein')} ${Math.round(i.proteinG)} g · ${t('food.carbs')} ${Math.round(i.carbsG)} g · ${t('food.fat')} ${Math.round(i.fatG)} g`;

export function FoodBadge({ foodId, size = 44 }: { foodId: string | null; size?: number }) {
  const { colors } = useTheme();
  const cat = foodId ? FOOD_BY_ID.get(foodId)?.category : undefined;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.warningBg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <AppText style={{ fontSize: size * 0.5, lineHeight: size * 0.62 }}>
        {foodEmoji(foodId, cat)}
      </AppText>
    </View>
  );
}

const stepFor = (g: number) => (g < 50 ? 5 : g < 300 ? 10 : 25);

export function PortionStepper({
  grams,
  onChange,
}: {
  grams: number;
  onChange: (g: number) => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const btn = (label: string, delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} ${t('food.adjust')}`}
      onPress={() => onChange(Math.min(5000, Math.max(5, grams + delta)))}
      style={{
        minWidth: MIN_TOUCH_TARGET,
        minHeight: MIN_TOUCH_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: spacing.md,
      }}
    >
      <AppText variant="label">{delta < 0 ? `− ${Math.abs(delta)}` : `+ ${delta}`}</AppText>
    </Pressable>
  );
  const step = stepFor(grams);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      {btn(t('food.lessG'), -step)}
      <AppText
        variant="label"
        accessibilityLiveRegion="polite"
        style={{ minWidth: 64, textAlign: 'center' }}
      >
        {t('food.grams', { g: Math.round(grams) })}
      </AppText>
      {btn(t('food.moreG'), step)}
    </View>
  );
}

/** One food in a draft meal: values, how trustworthy they are, and quick ways to fix them. */
export function ItemCard({
  item,
  needsMatch,
  onChange,
  onRemove,
  onChangeFood,
}: {
  item: FoodItemValues;
  needsMatch?: boolean;
  onChange: (next: FoodItemValues) => void;
  onRemove: () => void;
  onChangeFood: () => void;
}) {
  const { spacing } = useTheme();
  const [swapOpen, setSwapOpen] = useState(false);
  return (
    <DepthCard>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <FoodBadge foodId={item.foodId} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="heading">{item.name}</AppText>
          {needsMatch ? (
            <AppText variant="caption" muted>
              {t('food.unmatched', { name: item.name })}
            </AppText>
          ) : (
            <EstimateTag status={estimateStatus(item)} />
          )}
        </View>
      </View>
      {needsMatch ? (
        <Button label={t('food.chooseFood')} onPress={onChangeFood} />
      ) : (
        <>
          <AppText accessibilityLabel={`${kcalText(item)}. ${macroText(item)}`}>
            {kcalText(item)}
          </AppText>
          <AppText variant="caption" muted>
            {macroText(item)}
          </AppText>
          <PortionStepper grams={item.grams} onChange={(g) => onChange(rescaleItem(item, g))} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {estimateStatus(item) === 'estimate' ? (
              <Button
                variant="secondary"
                label={t('food.looksRight')}
                onPress={() => onChange({ ...item, userEdited: true })}
              />
            ) : null}
            <Button variant="secondary" label={t('food.changeFood')} onPress={onChangeFood} />
            {item.foodId ? (
              <Button
                variant="secondary"
                label={t('food.swap')}
                onPress={() => setSwapOpen(!swapOpen)}
              />
            ) : null}
          </View>
          {swapOpen ? (
            <SwapPanel
              item={item}
              onPick={(next) => {
                setSwapOpen(false);
                onChange(next);
              }}
            />
          ) : null}
        </>
      )}
      <Button variant="secondary" label={t('food.itemDelete')} onPress={onRemove} />
    </DepthCard>
  );
}

/** Food Swap: rule-based comparable options from reference data. Neutral wording, no food is "good" or "bad". */
export function SwapPanel({
  item,
  onPick,
}: {
  item: Pick<FoodItemValues, 'foodId' | 'grams' | 'kcal'>;
  onPick?: (next: FoodItemValues) => void;
}) {
  const { colors, spacing } = useTheme();
  const [mode, setMode] = useState<SwapMode>('lighter');
  const swaps = suggestSwaps(item, mode, CURATED_FOODS, 3);
  return (
    <View style={{ gap: spacing.sm }}>
      <Choice
        value={mode}
        onChange={setMode}
        options={SWAP_MODES.map((m) => ({ value: m, label: t(`swap.${m}` as StringKey) }))}
      />
      {swaps.length === 0 ? (
        <AppText variant="caption" muted>
          {t('swap.none')}
        </AppText>
      ) : null}
      {swaps.map((s) => (
        <View
          key={s.food.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.md,
            padding: spacing.sm,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <FoodBadge foodId={s.food.id} size={36} />
          <View style={{ flex: 1 }}>
            <AppText variant="label">{s.food.name}</AppText>
            <AppText
              variant="caption"
              muted
            >{`${s.reason} · ${s.kcalDelta >= 0 ? '+' : '−'}${Math.abs(s.kcalDelta)} kcal`}</AppText>
          </View>
          {onPick ? (
            <Button
              variant="secondary"
              label={t('swap.use')}
              onPress={() =>
                onPick(
                  itemFromFood(s.food, s.grams, {
                    source: 'curated',
                    confidence: 'high',
                    userEdited: true,
                  }),
                )
              }
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function MacroBars({ totals }: { totals: Pick<Totals, 'proteinG' | 'carbsG' | 'fatG'> }) {
  const { colors, radius, spacing } = useTheme();
  const rows = [
    { label: t('food.protein'), g: totals.proteinG, color: colors.primary },
    { label: t('food.carbs'), g: totals.carbsG, color: colors.accent },
    { label: t('food.fat'), g: totals.fatG, color: colors.success },
  ];
  const max = Math.max(1, ...rows.map((r) => r.g));
  return (
    <View style={{ gap: spacing.xs }}>
      {rows.map((r) => (
        <View
          key={r.label}
          style={{ gap: 2 }}
          accessible
          accessibilityLabel={`${r.label} ${Math.round(r.g)} grams`}
        >
          <AppText variant="caption" muted>{`${r.label} · ${Math.round(r.g)} g`}</AppText>
          <View
            style={{
              height: 8,
              borderRadius: radius.pill,
              backgroundColor: colors.border,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.round((r.g / max) * 100)}%`,
                height: '100%',
                backgroundColor: r.color,
              }}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
