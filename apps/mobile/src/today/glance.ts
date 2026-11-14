export interface GlanceInput {
  doneToday: Array<{ minutes: number }>;
  plannedToday: number;
  mealsLogged: number;
  loggedKcal: number;
}
export interface GlanceLine {
  key: 'move' | 'food';
  done: boolean;
  text: string;
}

/** A calm "today so far" summary. Nothing here is a target or a warning; an empty line is just an empty line. */
export function todayGlance(i: GlanceInput): GlanceLine[] {
  const mins = i.doneToday.reduce((a, s) => a + s.minutes, 0);
  const move: GlanceLine =
    i.doneToday.length > 0
      ? { key: 'move', done: true, text: `Moved for ${mins} min today` }
      : i.plannedToday > 0
        ? { key: 'move', done: false, text: `${i.plannedToday} planned for today` }
        : { key: 'move', done: false, text: 'No dance yet today' };
  const food: GlanceLine =
    i.mealsLogged > 0
      ? {
          key: 'food',
          done: true,
          text: `${i.mealsLogged} ${i.mealsLogged === 1 ? 'meal' : 'meals'} logged (about ${i.loggedKcal} kcal)`,
        }
      : { key: 'food', done: false, text: 'No food logged yet' };
  return [move, food];
}
