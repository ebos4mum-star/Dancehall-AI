import { useState } from 'react';
import { View } from 'react-native';
import { estimateStatus, rescaleItem } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import type { FoodLogItem } from '@/data/types';
import { t } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Banner';
import { EstimateTag, FoodBadge, PortionStepper, kcalText, macroText } from './ui';

/** A logged food. Tap to adjust the portion or remove it. */
export function DiaryItem({ item }: { item: FoodLogItem }) {
  const { store } = useApp();
  const { spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>) => {
    try {
      setErr(null);
      await fn();
    } catch (e) {
      setErr(errorMessage(e));
    }
  };
  return (
    <View style={{ gap: spacing.sm }}>
      <View
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${kcalText(item)}`}
        onTouchEnd={() => setOpen(!open)}
        style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}
      >
        <FoodBadge foodId={item.foodId} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label">{`${item.name} · ${Math.round(item.grams)} g`}</AppText>
          <AppText variant="caption" muted>
            {kcalText(item)}
          </AppText>
        </View>
        <EstimateTag status={estimateStatus(item)} />
      </View>
      {open ? (
        <View style={{ gap: spacing.sm }}>
          <AppText variant="caption" muted>
            {macroText(item)}
          </AppText>
          <PortionStepper
            grams={item.grams}
            onChange={(g) =>
              run(() =>
                store.updateFoodItem(item.id, { ...rescaleItem(item, g), source: item.source }),
              )
            }
          />
          {confirm ? (
            <Button
              label={`${t('food.itemDelete')}?`}
              onPress={() => run(() => store.deleteFoodItem(item.id))}
            />
          ) : (
            <Button
              variant="secondary"
              label={t('food.itemDelete')}
              onPress={() => setConfirm(true)}
            />
          )}
          {err ? <Notice tone="warning">{err}</Notice> : null}
        </View>
      ) : null}
    </View>
  );
}
