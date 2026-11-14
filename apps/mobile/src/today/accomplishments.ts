export interface AccomplishmentInput {
  sessionsDone: Array<{ title: string; minutes: number }>;
  mealsLogged: number;
  loggedKcal: number;
  hideNumbers?: boolean;
  habitsDone: string[];
  planItemsDone: number;
  planItemsTotal: number;
}
export interface Accomplishment {
  key: string;
  kind: 'dance' | 'food' | 'habit' | 'plan';
  text: string;
}

/** What the person has actually done today, from recorded data only. Empty means nothing recorded yet, never a failure. */
export function accomplishments(i: AccomplishmentInput): Accomplishment[] {
  const out: Accomplishment[] = [];
  i.sessionsDone.forEach((s, k) =>
    out.push({ key: `dance-${k}`, kind: 'dance', text: `${s.title} · ${s.minutes} min` }),
  );
  if (i.mealsLogged > 0)
    out.push({
      key: 'food',
      kind: 'food',
      text: `${i.mealsLogged} ${i.mealsLogged === 1 ? 'meal' : 'meals'} logged${i.hideNumbers ? '' : ` (about ${i.loggedKcal} kcal)`}`,
    });
  i.habitsDone.forEach((h, k) => out.push({ key: `habit-${k}`, kind: 'habit', text: h }));
  if (i.planItemsTotal > 0 && i.planItemsDone > 0)
    out.push({
      key: 'plan',
      kind: 'plan',
      text: `${i.planItemsDone} of ${i.planItemsTotal} plan ideas done`,
    });
  return out;
}

/** Total count of accomplishments, used to notice a genuine new one (never on first load). */
export const accomplishmentScore = (i: AccomplishmentInput): number =>
  i.sessionsDone.length + i.mealsLogged + i.habitsDone.length + i.planItemsDone;
