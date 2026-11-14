export const MAX_HABITS = 5;
export const HABIT_NAME_MAX = 40;

/** 1 to 40 characters after trimming and collapsing spaces (matches the database check). Returns the cleaned name, or null. */
export function cleanHabitName(raw: string): string | null {
  const name = raw.replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= HABIT_NAME_MAX ? name : null;
}

const DAY_MS = 86_400_000;
export const addDays = (key: string, n: number) =>
  new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

export interface HabitDayState {
  date: string;
  done: boolean;
}
export interface HabitWeekState {
  days: HabitDayState[]; // seven days, oldest first, ending today
  doneDays: number;
  doneToday: boolean;
}

/** One habit's last seven days. Counts only: no streak and no "missed" state. */
export function habitWeek(
  checkins: ReadonlyArray<{ habitId: string; day: string }>,
  habitId: string,
  today: string,
): HabitWeekState {
  const set = new Set(checkins.filter((c) => c.habitId === habitId).map((c) => c.day));
  const days: HabitDayState[] = [];
  for (let i = 6; i >= 0; i--) {
    const date = addDays(today, -i);
    days.push({ date, done: set.has(date) });
  }
  return { days, doneDays: days.filter((d) => d.done).length, doneToday: set.has(today) };
}
