import { ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { IconBadge, SectionTitle, type IconName } from '@/ui/kit';
import { useDraft } from '@/food/draft';
import { brand, radius as r0 } from '@/theme/tokens';
import { totals as sumTotals } from '@dancehall/shared';
import { router } from 'expo-router';
import { MEAL_TYPES, type MealType } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { DiaryItem } from '@/food/DiaryItem';
import { useFoodData } from '@/food/hooks';
import { MacroBars } from '@/food/ui';
import { HydrationCard, TargetsCard } from '@/wellness/ui';
import { t, type StringKey } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { CharacterStage, DepthCard, HeroCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Reveal, Ring, useCountUp } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { Pressable } from 'react-native';
import { haptics } from '@/ui/haptics';

const MEAL_ICON: Record<MealType, IconName> = {
  breakfast: 'cafe',
  lunch: 'fast-food',
  dinner: 'restaurant',
  snack: 'nutrition',
};

export default function FoodDashboard() {
  const { colors, spacing, radius } = useTheme();
  const { config } = useApp();
  const { dispatch } = useDraft();
  const { todayLogs, todayTotals, guide, error } = useFoodData();
  const kcal = useCountUp(todayTotals.kcal);
  const byMeal = (m: MealType) => todayLogs.filter((l) => l.mealType === m);
  const hasLogs = todayLogs.length > 0;
  const logMeal = (m: MealType) => {
    haptics.tap();
    dispatch({ type: 'mealType', mealType: m });
    router.push('/food/add');
  };
  const shortcuts: Array<{ icon: IconName; label: string; to: string }> = [
    { icon: 'bookmark', label: t('food.saved'), to: '/food/saved' },
    { icon: 'calendar', label: t('food.plan'), to: '/food/plan' },
    { icon: 'swap-horizontal', label: t('food.swapIdeas'), to: '/food/swap' },
    { icon: 'home', label: t('food.household'), to: '/food/household' },
    { icon: 'time', label: t('food.history'), to: '/food/history' },
  ];

  return (
    <Screen title={t('food.title')}>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      <Reveal>
        <HeroCard world="food">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.xs }}>
              <AppText variant="title" style={{ color: colors.onHero }} accessibilityRole="header">
                {t('food.heroTitle')}
              </AppText>
              <AppText style={{ color: colors.onHero }}>{t('food.heroBody')}</AppText>
            </View>
            <CharacterStage size={104} />
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1.3 }}>
              <Button
                variant="hero"
                label={t('food.snap')}
                onPress={() => router.push('/food/camera')}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                variant="secondary"
                label={t('food.addManual')}
                onPress={() => router.push('/food/add')}
              />
            </View>
          </View>
          {config.authMode === 'mock' ? (
            <View
              accessible
              accessibilityLabel={t('cam.mockBanner')}
              style={{
                flexDirection: 'row',
                gap: spacing.xs,
                alignItems: 'center',
                backgroundColor: 'rgba(255,120,94,0.2)',
                borderRadius: radius.md,
                padding: spacing.sm,
              }}
            >
              <Ionicons name="flask" size={16} color={brand.coral} />
              <AppText variant="caption" style={{ color: colors.onHero, flex: 1 }}>
                {t('cam.mockBanner')}
              </AppText>
            </View>
          ) : null}
        </HeroCard>
      </Reveal>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing.sm }}
      >
        {shortcuts.map((a) => (
          <Pressable
            key={a.to}
            accessibilityRole="button"
            accessibilityLabel={a.label}
            onPress={() => {
              haptics.tap();
              router.push(a.to as never);
            }}
            style={{
              width: 92,
              minHeight: 88,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              gap: spacing.xs,
              padding: spacing.sm,
            }}
          >
            <IconBadge name={a.icon} size={36} fill={colors.primary} color={colors.onPrimary} />
            <AppText variant="caption" style={{ fontWeight: '600', textAlign: 'center' }}>
              {a.label}
            </AppText>
          </Pressable>
        ))}
      </ScrollView>

      <Reveal delay={80}>
        <DepthCard>
          <SectionTitle icon="pie-chart" title={t('food.todayTitle')} />
          {!hasLogs ? (
            <AppText muted>{t('food.todayEmpty')}</AppText>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <Ring
                size={124}
                stroke={13}
                fraction={guide ? todayTotals.kcal / guide.guideKcal : 0}
                color={colors.primary}
                track={colors.border}
              >
                <View
                  style={{ alignItems: 'center' }}
                  accessible
                  accessibilityLabel={`about ${todayTotals.kcal} kilocalories today`}
                >
                  <AppText variant="heading">{`~${kcal}`}</AppText>
                  <AppText variant="caption" muted>
                    kcal
                  </AppText>
                </View>
              </Ring>
              <View style={{ flex: 1 }}>
                <MacroBars totals={todayTotals} />
              </View>
            </View>
          )}
          {hasLogs ? (
            <AppText
              variant="caption"
              muted
            >{`${t('food.kcalAbout', { kcal: todayTotals.kcal })} ${t('food.range', { low: todayTotals.kcalLow, high: todayTotals.kcalHigh })}${guide ? ` ${t('food.ofGuide', { guide: guide.guideKcal })}` : ''}`}</AppText>
          ) : null}
          {todayTotals.unreviewedEstimates > 0 ? (
            <AppText variant="caption" muted>
              {t('food.includesEstimates', { n: todayTotals.unreviewedEstimates })}
            </AppText>
          ) : null}
          {guide ? (
            <AppText variant="caption" muted>
              {t('food.guideNote')}
            </AppText>
          ) : null}
        </DepthCard>
      </Reveal>

      <HydrationCard />

      <SectionTitle icon="restaurant" title={t('food.mealsTitle')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {MEAL_TYPES.map((m) => {
          const logs = byMeal(m);
          const sum = sumTotals(logs.flatMap((l) => l.items));
          return (
            <Pressable
              key={m}
              accessibilityRole="button"
              accessibilityLabel={`${t(`food.meal.${m}` as StringKey)}: ${
                logs.length > 0 ? `about ${sum.kcal} kilocalories` : t('food.slotEmpty')
              }. ${t('food.slotAdd')}`}
              onPress={() => logMeal(m)}
              style={{
                flexBasis: '48%',
                flexGrow: 1,
                minHeight: 92,
                borderRadius: r0.md,
                borderWidth: logs.length > 0 ? 2 : 1,
                borderStyle: logs.length > 0 ? 'solid' : 'dashed',
                borderColor: logs.length > 0 ? colors.primary : colors.border,
                backgroundColor: colors.surface,
                padding: spacing.md,
                gap: spacing.xs,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <IconBadge
                  name={MEAL_ICON[m]}
                  size={34}
                  fill={logs.length > 0 ? brand.lime : brand.violet}
                />
                <Ionicons name="add-circle" size={26} color={colors.primary} />
              </View>
              <AppText variant="label">{t(`food.meal.${m}` as StringKey)}</AppText>
              <AppText variant="caption" muted>
                {logs.length > 0 ? `~${sum.kcal} kcal` : t('food.slotEmpty')}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {MEAL_TYPES.map((m, idx) =>
        byMeal(m).length > 0 ? (
          <Reveal key={m} delay={120 + idx * 40}>
            <DepthCard>
              <SectionTitle icon={MEAL_ICON[m]} title={t(`food.meal.${m}` as StringKey)} />
              {byMeal(m)
                .flatMap((l) => l.items)
                .map((i) => (
                  <DiaryItem key={i.id} item={i} />
                ))}
            </DepthCard>
          </Reveal>
        ) : null,
      )}
      <TargetsCard />
    </Screen>
  );
}
