import { useState } from 'react';
import { router } from 'expo-router';
import { totals } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { newKey, useDraft } from '@/food/draft';
import { kcalText } from '@/food/ui';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';

export default function Saved() {
  const { store } = useApp();
  const { dispatch } = useDraft();
  const { data, error } = useLoad((s) => s.listSavedMeals());
  const [err, setErr] = useState<string | null>(null);
  return (
    <Screen top={false}>
      {error || err ? <Notice tone="warning">{String(error ?? err)}</Notice> : null}
      {data && data.length === 0 ? <Notice>{t('saved.empty')}</Notice> : null}
      {(data ?? []).map((m) => (
        <DepthCard key={m.id}>
          <AppText variant="heading">{m.name}</AppText>
          <AppText variant="caption" muted>
            {m.items.map((i) => i.name).join(', ')}
          </AppText>
          <AppText variant="caption" muted>
            {kcalText(totals(m.items))}
          </AppText>
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
            onPress={async () => {
              try {
                await store.deleteSavedMeal(m.id);
              } catch (e) {
                setErr(errorMessage(e));
              }
            }}
          />
        </DepthCard>
      ))}
    </Screen>
  );
}
