import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { totals } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { newKey, useDraft } from '@/food/draft';
import { FoodHero } from '@/food/kit';
import { FoodBadge, kcalText } from '@/food/ui';
import { t } from '@/i18n';
import { brand, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { SkeletonList } from '@/ui/Skeleton';
import { haptics } from '@/ui/haptics';

export default function Saved() {
  const { store } = useApp();
  const { dispatch } = useDraft();
  const { colors } = useTheme();
  const { data, error } = useLoad((s) => s.listSavedMeals());
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <Screen>
      <FoodHero
        title={t('ban.foodSaved.title')}
        line={t('food2.savedLine')}
        pulse={data && data.length > 0 ? 'welcome' : 'idle'}
        stats={data ? [{ label: t('food2.savedCount'), value: String(data.length) }] : []}
      />
      {error || err ? <Notice tone="warning">{String(error ?? err)}</Notice> : null}
      {!data && !error ? <SkeletonList label={t('common.loading')} /> : null}
      {data && data.length === 0 ? (
        <EmptyState
          icon="bookmark-outline"
          title={t('saved.title')}
          body={t('saved.empty')}
          actionLabel={t('food2.savedEmptyCta')}
          onAction={() => router.push('/food/add')}
        />
      ) : null}
      {(data ?? []).map((m) => {
        const names = m.items.map((i) => i.name);
        return (
          <View
            key={m.id}
            style={{
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
            }}
          >
            <View style={{ height: 6, backgroundColor: brand.lime }} />
            <View style={{ padding: spacing.md, gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flexDirection: 'row' }}>
                  {m.items.slice(0, 3).map((i, n) => (
                    <View key={`${i.name}-${n}`} style={{ marginLeft: n === 0 ? 0 : -14 }}>
                      <FoodBadge foodId={i.foodId} size={44} />
                    </View>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="heading">{m.name}</AppText>
                  <AppText variant="caption" muted>
                    {kcalText(totals(m.items))}
                  </AppText>
                </View>
              </View>
              <AppText variant="caption" muted>
                {names.join(' · ')}
              </AppText>
              {confirming === m.id ? (
                <View style={{ gap: spacing.sm }} accessibilityLiveRegion="polite">
                  <AppText variant="label">{t('food2.confirmDelete')}</AppText>
                  <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                    <Button
                      label={t('common.delete')}
                      onPress={async () => {
                        try {
                          await store.deleteSavedMeal(m.id);
                          haptics.success();
                          setConfirming(null);
                        } catch (e) {
                          setErr(errorMessage(e));
                        }
                      }}
                    />
                    <Button
                      variant="secondary"
                      label={t('food2.keep')}
                      onPress={() => setConfirming(null)}
                    />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
                  <Button
                    label={t('saved.logAgain')}
                    onPress={() => {
                      dispatch({
                        type: 'start',
                        draft: {
                          items: m.items.map((i) => ({ ...i, key: newKey() })),
                          source: 'saved_meal',
                          ...(m.mealType ? { mealType: m.mealType } : {}),
                        },
                      });
                      router.push('/food/review');
                    }}
                  />
                  <Button
                    variant="secondary"
                    label={t('common.delete')}
                    onPress={() => setConfirming(m.id)}
                  />
                </View>
              )}
            </View>
          </View>
        );
      })}
    </Screen>
  );
}
