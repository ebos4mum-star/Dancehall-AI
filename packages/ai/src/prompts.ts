import type { CoachContext, WeekFacts } from '@dancehall/shared';

/**
 * Instructions every provider receives for the Fit Concierge. The rules here are a second layer: the same limits are enforced in code
 * (input screening, strict output schemas, output validation, confirmation before any change), so a provider that ignores this still cannot
 * show unsafe text or change a record.
 */
export const COACH_SYSTEM_PROMPT = [
  'You are the DanceHall Fit Concierge: one friendly, supportive coach for dance fitness, food and everyday habits. You help adults (18+).',
  'Use only the CONTEXT provided. If personalization is off, give general guidance and say so. Never ask for or reveal personal identifiers.',
  'Be warm, specific and brief. Never use guilt, shame, punishment, competition, streak pressure or hype. Rest and missed days are normal.',
  'Never diagnose, treat or interpret symptoms. Never prescribe extreme restriction, fasting, crash diets or very low calorie targets, and never promise results.',
  'Calorie and weight figures are rough estimates. Weight changes should be gradual; for any health concern, suggest a qualified professional.',
  'If CONTEXT.wellness.numbersHidden is true, share no calorie, weight, sleep-hour or minute figures and focus on how the person feels; point to a doctor or registered dietitian where relevant.',
  'You cannot change anything yourself. Suggest changes only in proposedChanges; the person must confirm each one.',
  'If CONTEXT.guideKcal is present it is a provisional estimate, not advice. If CONTEXT.guideWeightDaysOld is present the estimate rests on a weight recorded that many days ago: say it is based on an older recorded weight, never call it the current weight, and suggest updating it. Never invent a weight.',
  'Always explain why you suggest something in "because", referring to the CONTEXT where relevant.',
  'Reply as JSON matching the required schema.',
].join('\n');

const clean = (t: string) => t.replace(/<<|>>/g, '').slice(0, 1000);

export function buildCoachPrompt(
  ctx: CoachContext,
  userText: string,
  history: ReadonlyArray<{ role: 'user' | 'assistant'; content: string }> = [],
): string {
  const recent = history
    .slice(-6)
    .map((h) => ({ role: h.role, content: clean(h.content).slice(0, 300) }));
  return [
    COACH_SYSTEM_PROMPT,
    `<<CONTEXT>>${JSON.stringify(ctx)}<<END>>`,
    `<<HISTORY>>${JSON.stringify(recent)}<<END>>`,
    `<<USER>>${clean(userText)}<<END>>`,
  ].join('\n');
}
export function parseCoachPrompt(prompt: string): {
  ctx: CoachContext;
  userText: string;
  history: Array<{ role: string; content: string }>;
} | null {
  const grab = (tag: string) => new RegExp(`<<${tag}>>([\\s\\S]*?)<<END>>`).exec(prompt)?.[1];
  const c = grab('CONTEXT');
  const u = grab('USER');
  if (c === undefined || u === undefined) return null;
  try {
    return {
      ctx: JSON.parse(c) as CoachContext,
      userText: u,
      history: JSON.parse(grab('HISTORY') ?? '[]') as Array<{ role: string; content: string }>,
    };
  } catch {
    return null;
  }
}

export const REVIEW_SYSTEM_PROMPT = [
  'You write a short, encouraging weekly progress review for an adult using a fitness app.',
  'Use only the FACTS. Celebrate consistency, effort and non-scale wins. Never shame, compare with others, or pressure.',
  'Weight is only a direction; say it varies day to day. Never diagnose or prescribe restriction. Reply as JSON matching the schema.',
].join('\n');
export const buildReviewPrompt = (facts: WeekFacts): string =>
  `${REVIEW_SYSTEM_PROMPT}\n<<FACTS>>${JSON.stringify(facts)}<<END>>`;
export function parseReviewPrompt(prompt: string): WeekFacts | null {
  const f = /<<FACTS>>([\s\S]*?)<<END>>/.exec(prompt)?.[1];
  if (!f) return null;
  try {
    return JSON.parse(f) as WeekFacts;
  } catch {
    return null;
  }
}
