import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { estimateStatus, rescaleItem } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage } from '@/data/hooks';
import type { FoodLogItem } from '@/data/types';
import { t } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Banner';
import { useNumbersHidden } from '@/wellness/hooks';
import { EstimateTag, FoodBadge, PortionStepper, kcalText, macroText } from './ui';

/** A logged food. Tap to adjust the portion or remove it. */
export function DiaryItem({ item }: { item: FoodLogItem }) {
  const { store } = useApp();
  const { spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const hideNumbers = useNumbersHidden();
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hideNumbers ? item.name : `${item.name}, ${kcalText(item)}`}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center', minHeight: 48 }}
      >
        <FoodBadge foodId={item.foodId} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="label">{`${item.name} · ${Math.round(item.grams)} g`}</AppText>
          {hideNumbers ? null : (
            <AppText variant="caption" muted>
              {kcalText(item)}
            </AppText>
          )}
        </View>
        <EstimateTag status={estimateStatus(item)} />
      </Pressable>
      {open ? (
        <View style={{ gap: spacing.sm }}>
          {hideNumbers ? null : (
            <AppText variant="caption" muted>
              {macroText(item)}
            </AppText>
          )}
          <PortionStepper
            grams={item.grams}
            foodId={item.foodId}
            onChange={(g) =>
              run(() =>
                store.updateFoodItem(item.id, { ...rescaleItem(item, g), source: item.source }),
              )
            }
          />
          {estimateStatus(item) === 'estimate' ? (
            <Button
              variant="secondary"
              label={t('food.looksRight')}
              onPress={() =>
                run(() => store.updateFoodItem(item.id, { ...item, userEdited: true }))
              }
            />
          ) : null}
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
