import { View } from 'react-native';
import { router } from 'expo-router';
import { MEAL_TYPES, type MealType } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { DiaryItem } from '@/food/DiaryItem';
import { useFoodData } from '@/food/hooks';
import { MacroBars } from '@/food/ui';
import { t, type StringKey } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { CharacterStage, DepthCard, HeroCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Reveal, Ring, useCountUp, usePressScale } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { Animated, Pressable } from 'react-native';
import { haptics } from '@/ui/haptics';

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, radius, spacing } = useTheme();
  const press = usePressScale();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      onPress={() => {
        haptics.tap();
        onPress();
      }}
    >
      <Animated.View
        style={[
          press.style,
          {
            minHeight: 44,
            paddingHorizontal: spacing.md,
            justifyContent: 'center',
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <AppText variant="label">{label}</AppText>
      </Animated.View>
    </Pressable>
  );
}

export default function FoodDashboard() {
  const { colors, spacing } = useTheme();
  const { config } = useApp();
  const { todayLogs, todayTotals, guide, error } = useFoodData();
  const kcal = useCountUp(todayTotals.kcal);
  const byMeal = (m: MealType) => todayLogs.filter((l) => l.mealType === m);
  const hasLogs = todayLogs.length > 0;

  return (
    <Screen title={t('food.title')}>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      <Reveal>
        <HeroCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View style={{ flex: 1, gap: spacing.sm }}>
              <AppText variant="title" style={{ color: colors.onHero }} accessibilityRole="header">
                {t('food.heroTitle')}
              </AppText>
              <AppText style={{ color: colors.onHero }}>{t('food.heroBody')}</AppText>
            </View>
            <CharacterStage size={92} />
          </View>
          <Button
            variant="hero"
            label={t('food.snap')}
            onPress={() => router.push('/food/camera')}
          />
          {config.authMode === 'mock' ? (
            <AppText variant="caption" style={{ color: colors.onHero }}>
              {t('cam.mockBanner')}
            </AppText>
          ) : null}
        </HeroCard>
      </Reveal>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <QuickAction label={t('food.addManual')} onPress={() => router.push('/food/add')} />
        <QuickAction label={t('food.saved')} onPress={() => router.push('/food/saved')} />
        <QuickAction label={t('food.swapIdeas')} onPress={() => router.push('/food/swap')} />
        <QuickAction label={t('food.plan')} onPress={() => router.push('/food/plan')} />
        <QuickAction label={t('food.household')} onPress={() => router.push('/food/household')} />
        <QuickAction label={t('food.history')} onPress={() => router.push('/food/history')} />
      </View>

      <Reveal delay={80}>
        <DepthCard>
          <AppText variant="heading" accessibilityRole="header">
            {t('food.todayTitle')}
          </AppText>
          {!hasLogs ? (
            <AppText muted>{t('food.todayEmpty')}</AppText>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
              <Ring
                size={116}
                stroke={12}
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

      {MEAL_TYPES.map((m, idx) =>
        byMeal(m).length > 0 ? (
          <Reveal key={m} delay={120 + idx * 40}>
            <DepthCard>
              <AppText variant="heading">{t(`food.meal.${m}` as StringKey)}</AppText>
              {byMeal(m)
                .flatMap((l) => l.items)
                .map((i) => (
                  <DiaryItem key={i.id} item={i} />
                ))}
            </DepthCard>
          </Reveal>
        ) : null,
      )}
    </Screen>
  );
}
