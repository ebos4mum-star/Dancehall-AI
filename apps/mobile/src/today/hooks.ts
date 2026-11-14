import { useMemo } from 'react';
import { localDateKey } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useLoad } from '@/data/hooks';
import { useDanceData } from '@/dance/hooks';
import { useFoodData } from '@/food/hooks';
import { sessionMinutes } from '@dancehall/shared';
import { accomplishments, accomplishmentScore, type AccomplishmentInput } from './accomplishments';
import { nextUp } from './nextUp';

/** Everything Today shows about "today", read from the same stores and hooks the other tabs use. No new data source. */
export function useTodaySummary() {
  const { profile } = useApp();
  const tz = profile?.timeZone ?? null;
  const dance = useDanceData();
  const food = useFoodData();
  const today = localDateKey(new Date(), tz);
  const plan = useLoad(async (s) => (s.getDailyPlan ? s.getDailyPlan() : null));
  const habits = useLoad(async (s) => ({
    habits: await s.listHabits(),
    checkins: await s.listHabitCheckins(today),
  }));
  const comeback = useLoad(async (s) => (s.comebackStatus ? s.comebackStatus() : null));

  return useMemo(() => {
    const items = plan.data?.items ?? [];
    const doneHabitIds = new Set(
      (habits.data?.checkins ?? []).filter((c) => c.day === today).map((c) => c.habitId),
    );
    const habitList = habits.data?.habits ?? [];
    const input: AccomplishmentInput = {
      sessionsDone: dance.doneToday.map((x) => ({ title: x.title, minutes: sessionMinutes(x) })),
      mealsLogged: food.todayLogs.length,
      loggedKcal: food.todayTotals.kcal,
      habitsDone: habitList.filter((h) => doneHabitIds.has(h.id)).map((h) => h.name),
      planItemsDone: items.filter((i) => i.doneAt !== null).length,
      planItemsTotal: items.length,
    };
    const ready = !dance.loading && !food.loading && !plan.loading && !habits.loading;
    return {
      ready,
      input,
      list: accomplishments(input),
      score: accomplishmentScore(input),
      next: nextUp(items),
      habitCount: habitList.length,
      habitsDoneCount: input.habitsDone.length,
      comeback: comeback.data ?? null,
    };
  }, [plan.data, habits.data, comeback.data, dance, food, today, plan.loading, habits.loading]);
}
