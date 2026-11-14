import { useRef, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { MEAL_TYPES, totals, type MealType } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import { toValues, unresolved, useDraft } from '@/food/draft';
import { ItemCard, MacroBars, kcalText } from '@/food/ui';
import { t, type StringKey } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Choice } from '@/ui/Choice';
import { Reveal, useCountUp } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';
import { haptics } from '@/ui/haptics';

export default function Review() {
  const { store } = useApp();
  const { draft, dispatch } = useDraft();
  const { spacing } = useTheme();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [mealName, setMealName] = useState('');
  const [naming, setNaming] = useState(false);
  const saving = useRef(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const sum = totals(draft.items.filter((i) => !i.needsMatch));
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
    <Screen top={false}>
      {draft.provider === 'mock' ? <Notice tone="warning">{t('cam.mockBanner')}</Notice> : null}
      {draft.notes ? (
        <AppText variant="caption" muted>
          {draft.notes}
        </AppText>
      ) : null}
      <Notice>{t('rev.estimateNote')}</Notice>
      <Choice
        value={draft.mealType}
        onChange={(m: MealType) => dispatch({ type: 'mealType', mealType: m })}
        options={MEAL_TYPES.map((m) => ({ value: m, label: t(`food.meal.${m}` as StringKey) }))}
      />
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
        <AppText variant="heading">{t('rev.total')}</AppText>
        <AppText variant="title" accessibilityLabel={kcalText(sum)}>{`~${shown} kcal`}</AppText>
        <AppText variant="caption" muted>
          {kcalText(sum)}
        </AppText>
        <MacroBars totals={sum} />
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
