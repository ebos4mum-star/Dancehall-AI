import { useMemo, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import type { PlanItemRecord } from '@/data/types';
import { t } from '@/i18n';
import { MIN_TOUCH_TARGET } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { haptics } from '@/ui/haptics';
import { buildGroceryList, groceryText } from './grocery';

/** Shopping list for one saved meal plan. Ticks are kept on this screen only; sharing is a deliberate tap. */
export function GroceryList({ planName, items }: { planName: string; items: PlanItemRecord[] }) {
  const { colors, spacing, radius } = useTheme();
  const lines = useMemo(() => buildGroceryList(items), [items]);
  const [got, setGot] = useState<Set<string>>(new Set());
  const toggle = (k: string) => {
    haptics.tap();
    setGot((s) => {
      const n = new Set(s);
      if (!n.delete(k)) n.add(k);
      return n;
    });
  };
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label" accessibilityRole="header">
        {t('grocery.title')}
      </AppText>
      {lines.map((l) => {
        const done = got.has(l.key);
        return (
          <Pressable
            key={l.key}
            onPress={() => toggle(l.key)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: done }}
            accessibilityLabel={`${l.name}, ${l.grams} g`}
            style={{
              minHeight: MIN_TOUCH_TARGET,
              flexDirection: 'row',
              alignItems: 'center',
              gap: spacing.sm,
            }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: radius.sm,
                borderWidth: 1.5,
                borderColor: done ? colors.primary : colors.border,
                backgroundColor: done ? colors.primary : 'transparent',
              }}
            />
            <AppText muted={done} style={done ? { textDecorationLine: 'line-through' } : undefined}>
              {`${l.name} · ${l.grams} g`}
            </AppText>
          </Pressable>
        );
      })}
      <AppText variant="caption" muted>
        {t('grocery.note')}
      </AppText>
      <Button
        variant="secondary"
        label={t('grocery.share')}
        onPress={() =>
          void Share.share({ message: groceryText(planName, lines) }).catch(() => undefined)
        }
      />
    </View>
  );
}
