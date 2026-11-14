import { showMoment } from '@/pulse/moment';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { MEAL_TYPES, totals, type MealType } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { toValues, unresolved, useDraft } from '@/food/draft';
import { useFoodData } from '@/food/hooks';
import { ItemCard, MacroBars, kcalText } from '@/food/ui';
import { t, type StringKey } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { IconChoice, SectionTitle, type IconName } from '@/ui/kit';
import { brand } from '@/theme/tokens';
import { Reveal, Ring, useCountUp } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';
import { haptics } from '@/ui/haptics';

const MEAL_ICON: Record<MealType, IconName> = {
  breakfast: 'cafe',
  lunch: 'fast-food',
  dinner: 'restaurant',
  snack: 'nutrition',
};

export default function Review() {
  const { store } = useApp();
  const { draft, dispatch } = useDraft();
  const { spacing, colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');
  const [naming, setNaming] = useState(false);
  const saving = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const sum = totals(draft.items.filter((i) => !i.needsMatch));
  const { todayTotals, guide } = useFoodData();
  // Real data only: today's logged estimate plus this meal, against the rough daily guide. Without a guide the ring stays empty.
  const guideFraction = guide ? (todayTotals.kcal + sum.kcal) / guide.guideKcal : 0;
  const shown = useCountUp(sum.kcal);
  const blocked = unresolved(draft).length > 0;

  const save = async () => {
    if (saving.current) return; // a fast double tap must not log the meal twice
    saving.current = true;
    setBusy(true);
    setErr(null);
    try {
      await store.createFoodLog({
        mealType: draft.mealType,
        source: draft.source,
        photoAnalysisId: draft.photoAnalysisId,
        items: draft.items.map(toValues),
      });
      haptics.success();
      showMoment(t('moment.foodLogged'), 'celebrate');
      dispatch({ type: 'clear' });
      router.replace('/(tabs)/food');
    } catch (e) {
      haptics.warning();
      setErr(errorMessage(e));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  const saveMeal = async () => {
    try {
      await store.saveMeal({
        name: mealName,
        mealType: draft.mealType,
        items: draft.items.filter((i) => !i.needsMatch).map(toValues),
      });
      setNaming(false);
      setMsg(t('rev.saved'));
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  return (
    <Screen
      top={false}
      banner={{
        world: 'food',
        title: t('ban.foodReview.title'),
        line: t('ban.foodReview.line'),
        pulse: 'idle',
      }}
    >
      {draft.provider === 'mock' ? <Notice tone="warning">{t('cam.mockBanner')}</Notice> : null}
      {draft.notes ? (
        <AppText variant="caption" muted>
          {draft.notes}
        </AppText>
      ) : null}
      <Notice>{t('rev.estimateNote')}</Notice>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {MEAL_TYPES.map((m) => (
          <View key={m} style={{ flex: 1 }}>
            <IconChoice
              icon={MEAL_ICON[m]}
              label={t(`food.meal.${m}` as StringKey)}
              selected={draft.mealType === m}
              onPress={() => dispatch({ type: 'mealType', mealType: m })}
              tint={brand.lime}
            />
          </View>
        ))}
      </View>
      {draft.items.length === 0 ? <AppText muted>{t('rev.empty')}</AppText> : null}
      {draft.items.map((i, idx) => (
        <Reveal key={i.key} delay={idx * 50}>
          <ItemCard
            item={i}
            needsMatch={i.needsMatch}
            onChange={(next) => dispatch({ type: 'update', key: i.key, item: next })}
            onRemove={() => dispatch({ type: 'remove', key: i.key })}
            onChangeFood={() =>
              router.push({ pathname: '/food/add', params: { replaceKey: i.key, from: 'review' } })
            }
          />
        </Reveal>
      ))}
      <Button
        variant="secondary"
        label={t('rev.addAnother')}
        onPress={() => router.push({ pathname: '/food/add', params: { from: 'review' } })}
      />

      <DepthCard>
        <SectionTitle icon="pie-chart" title={t('rev.total')} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
          <Ring
            size={104}
            stroke={11}
            fraction={guideFraction}
            color={colors.primary}
            track={colors.border}
          >
            <View accessible accessibilityLabel={kcalText(sum)} style={{ alignItems: 'center' }}>
              <AppText variant="heading">{`~${shown}`}</AppText>
              <AppText variant="caption" muted>
                kcal
              </AppText>
            </View>
          </Ring>
          <View style={{ flex: 1 }}>
            <MacroBars totals={sum} />
          </View>
        </View>
        <AppText variant="caption" muted>
          {kcalText(sum)}
        </AppText>
        {sum.unreviewedEstimates > 0 ? (
          <AppText variant="caption" muted>
            {t('food.includesEstimates', { n: sum.unreviewedEstimates })}
          </AppText>
        ) : null}
      </DepthCard>

      {blocked ? <Notice tone="warning">{t('rev.resolve')}</Notice> : null}
      {err ? <Notice tone="warning">{err}</Notice> : null}
      {msg ? <Notice>{msg}</Notice> : null}
      <View style={{ gap: spacing.sm }}>
        <Button
          label={t('rev.save')}
          disabled={busy || blocked || draft.items.length === 0}
          onPress={save}
        />
        {naming ? (
          <DepthCard>
            <TextField
              label={t('rev.mealName')}
              value={mealName}
              onChangeText={setMealName}
              maxLength={60}
            />
            <Button label={t('common.save')} disabled={mealName.trim() === ''} onPress={saveMeal} />
          </DepthCard>
        ) : (
          <Button
            variant="secondary"
            label={t('rev.saveMeal')}
            disabled={draft.items.filter((i) => !i.needsMatch).length === 0}
            onPress={() => setNaming(true)}
          />
        )}
        <Button
          variant="secondary"
          label={confirmDiscard ? t('rev.discardConfirm') : t('common.cancel')}
          onPress={() => {
            // Entries are never thrown away by a single stray tap.
            if (draft.items.length > 0 && !confirmDiscard) return setConfirmDiscard(true);
            dispatch({ type: 'clear' });
            router.replace('/(tabs)/food');
          }}
        />
      </View>
    </Screen>
  );
}
