import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { localDateKey } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { t } from '@/i18n';
import { MIN_TOUCH_TARGET, radius } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { SectionTitle } from '@/ui/kit';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { TextField } from '@/ui/TextField';
import { haptics } from '@/ui/haptics';
import { MAX_HABITS, addDays, cleanHabitName, habitWeek } from './logic';

/** The person's own habits. A day is simply done or not done: no streak, no penalty, nothing is "missed". */
export function HabitsCard() {
  const { store, profile } = useApp();
  const { colors, spacing } = useTheme();
  const today = localDateKey(new Date(), profile?.timeZone ?? null);
  const { data, error } = useLoad(async (s) => ({
    habits: await s.listHabits(),
    checkins: await s.listHabitCheckins(addDays(today, -6)),
  }));
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const habits = data?.habits ?? [];
  const full = habits.length >= MAX_HABITS;

  const run = async (fn: () => Promise<unknown>) => {
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };

  return (
    <Card>
      <SectionTitle icon="leaf" title={t('habits.title')} />
      <AppText variant="caption" muted>
        {t('habits.intro')}
      </AppText>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {data && habits.length === 0 ? <AppText muted>{t('habits.empty')}</AppText> : null}
      {habits.map((h) => {
        const w = habitWeek(data?.checkins ?? [], h.id, today);
        return (
          <View key={h.id} style={{ gap: spacing.xs }}>
            <Pressable
              onPress={() => {
                haptics.tap();
                void run(() => store.setHabitDone(h.id, today, !w.doneToday));
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: w.doneToday }}
              accessibilityLabel={t(w.doneToday ? 'habits.done' : 'habits.notDone', {
                name: h.name,
              })}
              style={{
                minHeight: MIN_TOUCH_TARGET,
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: radius.sm,
                  borderWidth: 1.5,
                  borderColor: w.doneToday ? colors.primary : colors.border,
                  backgroundColor: w.doneToday ? colors.primary : 'transparent',
                }}
              />
              <View style={{ flex: 1 }}>
                <AppText>{h.name}</AppText>
                <AppText variant="caption" muted>
                  {t('habits.week', { n: w.doneDays })}
                </AppText>
              </View>
            </Pressable>
            <Button
              variant="secondary"
              label={`${t('habits.remove')}: ${h.name}`}
              onPress={() => run(() => store.archiveHabit(h.id))}
            />
          </View>
        );
      })}
      {full ? (
        <AppText variant="caption" muted>
          {t('habits.limit')}
        </AppText>
      ) : (
        <>
          <TextField
            label={t('habits.name')}
            value={name}
            onChangeText={setName}
            maxLength={40}
            returnKeyType="done"
          />
          <Button
            label={t('habits.add')}
            disabled={cleanHabitName(name) === null}
            onPress={() =>
              run(async () => {
                await store.addHabit(cleanHabitName(name)!);
                setName('');
                haptics.success();
              })
            }
          />
        </>
      )}
      {msg ? <Notice tone="warning">{msg}</Notice> : null}
    </Card>
  );
}
