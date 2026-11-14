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
import { TextField } from '@/ui/TextField';

export default function SwapScreen() {
  const { colors, spacing, radius } = useTheme();
  const [q, setQ] = useState('');
  const [food, setFood] = useState<FoodRef | null>(null);
  const results = searchFoods(q, CURATED_FOODS, 6);
  const item = food ? itemFromFood(food, food.servingG) : null;
  return (
    <Screen
      top={false}
      banner={{
        world: 'food',
        title: t('ban.foodSwap.title'),
        line: t('ban.foodSwap.line'),
        pulse: 'idle',
      }}
    >
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
      <TextField
        label={t('add.search')}
        value={q}
        onChangeText={(v) => {
          setQ(v);
          setFood(null);
        }}
        autoCapitalize="none"
      />
      {!food
        ? results.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="button"
              accessibilityLabel={r.name}
              onPress={() => setFood(r)}
              style={{
                minHeight: 52,
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
              <FoodBadge foodId={r.id} size={36} />
              <AppText variant="label">{r.name}</AppText>
            </Pressable>
          ))
        : null}
      {food && item ? (
        <DepthCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <FoodBadge foodId={food.id} />
            <View style={{ flex: 1 }}>
              <AppText variant="heading">{food.name}</AppText>
              <AppText
                variant="caption"
                muted
              >{`${food.servingLabel} · ${kcalText(item)}`}</AppText>
            </View>
          </View>
          <SwapPanel item={item} />
        </DepthCard>
      ) : null}
    </Screen>
  );
}
