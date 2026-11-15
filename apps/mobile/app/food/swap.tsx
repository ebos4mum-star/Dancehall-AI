import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { CURATED_FOODS, itemFromFood, searchFoods, type FoodRef } from '@dancehall/shared';
import { FoodBadge, SwapPanel, kcalText } from '@/food/ui';
import { t } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { DepthCard } from '@/ui/Depth';
import { IconBadge } from '@/ui/kit';
import { Screen } from '@/ui/Screen';
import { Button } from '@/ui/Button';
import { BigField } from '@/onboarding/kit';
import { FoodHero } from '@/food/kit';
import { Ionicons } from '@expo/vector-icons';
import { useNumbersHidden } from '@/wellness/hooks';

export default function SwapScreen() {
  const hideNumbers = useNumbersHidden();
  const { colors, spacing, radius } = useTheme();
  const [q, setQ] = useState('');
  const [food, setFood] = useState<FoodRef | null>(null);
  const results = searchFoods(q, CURATED_FOODS, 6);
  const item = food ? itemFromFood(food, food.servingG) : null;
  return (
    <Screen>
      <FoodHero title={t('ban.foodSwap.title')} line={t('ban.foodSwap.line')} />
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <IconBadge
          name="swap-horizontal"
          size={36}
          fill={colors.primary}
          color={colors.onPrimary}
        />
        <AppText muted style={{ flex: 1 }}>
          {t('swap.intro')}
        </AppText>
      </View>
      {!food ? (
        <>
          <AppText variant="heading" accessibilityRole="header">
            {t('food2.swapPick')}
          </AppText>
          <BigField
            icon="search"
            label={t('add.search')}
            value={q}
            onChangeText={(v) => {
              setQ(v);
              setFood(null);
            }}
            autoCapitalize="none"
          />
          {results.length === 0 ? <AppText muted>{t('food2.swapNoMatch')}</AppText> : null}
          {results.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={r.staged ? `${r.name}, ${t('food.stagedTag')}` : r.name}
              onPress={() => setFood(r)}
              style={{
                minHeight: 60,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                padding: spacing.sm,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <FoodBadge foodId={r.id} size={40} />
              <View style={{ flex: 1 }}>
                <AppText variant="label">{r.name}</AppText>
                <AppText variant="caption" muted>
                  {r.staged ? `${r.servingLabel}. ${t('food.stagedTag')}` : r.servingLabel}
                </AppText>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </>
      ) : null}
      {food && item ? (
        <>
          <AppText variant="heading" accessibilityRole="header">
            {t('food2.swapCompare')}
          </AppText>
          <DepthCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <FoodBadge foodId={food.id} />
              <View style={{ flex: 1 }}>
                <AppText variant="heading">{food.name}</AppText>
                <AppText variant="caption" muted>
                  {hideNumbers ? food.servingLabel : `${food.servingLabel} · ${kcalText(item)}`}
                </AppText>
              </View>
            </View>
            <SwapPanel item={item} />
          </DepthCard>
          <Button variant="secondary" label={t('food2.swapChange')} onPress={() => setFood(null)} />
        </>
      ) : null}
    </Screen>
  );
}
