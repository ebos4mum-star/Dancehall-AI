/**
 * Safeguards for the Fit Concierge. These are code, not prompt wording, so they apply to every provider (mock or live) and are testable.
 * PROVISIONAL: the patterns and responses have not been reviewed by a registered dietitian or clinician (gate S1). They are a floor, not the design:
 * production adds model-based classification, country-specific support resources and human escalation.
 */
import { screenMessageForRiskSignals, type RiskSignalCategory } from './safety';

export type CoachInputScreen =
  | { kind: 'risk'; category: RiskSignalCategory }
  | { kind: 'unsafe_request' }
  | { kind: 'medical_symptom' }
  | { kind: 'minor' }
  | { kind: 'ok' };

const EXTREME_LOSS =
  /\b(?:lose|drop|shed)\s+(?:\d+(?:\.\d+)?)\s*(?:kg|kgs|kilos?|lbs?|pounds?)\s+(?:in|within|by)\s+(?:a|one|1|2|two|3|three|\d+)\s*(?:day|days|week|weeks)\b/i;
const EXTREME_EATING =
  /\b(?:fast(?:ing)?\s+for\s+\d+|water\s+fast|juice\s+cleanse|crash\s+diet|detox|starv(?:e|ing)\b|skip\s+(?:all\s+)?(?:my\s+)?meals|stop\s+eating|eat\s+nothing)\b/i;
const LOW_KCAL_REQUEST =
  /\b(?:eat|have|consume|live on|diet of|plan(?: for)?)\s+(?:only\s+|just\s+)?(?:under\s+|below\s+|less than\s+)?(\d{3,4})\s*(?:kcal|calories|cals)\b/i;
const MEDICAL =
  /\b(?:chest pain|chest pressure|can'?t breathe|trouble breathing|fainted|passed out|severe pain|coughing blood|blood in (?:my )?(?:stool|urine)|heart attack|stroke)\b/i;
const MINOR = /\b(?:i am|i'm|im)\s+(?:only\s+)?(1[0-7]|[0-9])\b(?:\s*(?:years?|yrs?|y\/?o)\b)?/i;

/** Classifies what a person typed BEFORE any billable call. Anything other than `ok` gets a safe, fixed response and costs nothing. */
export function screenCoachInput(text: string): CoachInputScreen {
  const risk = screenMessageForRiskSignals(text);
  if (risk) return { kind: 'risk', category: risk };
  if (MEDICAL.test(text)) return { kind: 'medical_symptom' };
  if (MINOR.test(text)) return { kind: 'minor' };
  const low = LOW_KCAL_REQUEST.exec(text);
  if (EXTREME_LOSS.test(text) || EXTREME_EATING.test(text) || (low && Number(low[1]) <= 1000))
    return { kind: 'unsafe_request' };
  return { kind: 'ok' };
}

export const SAFE_REDIRECT_MESSAGES: Record<
  Exclude<CoachInputScreen['kind'], 'ok'>,
  { message: string; supportReferral: boolean; because: string[] }
> = {
  risk: {
    message:
      'It sounds like things may be hard right now, and you deserve support from a person. Please reach out to a local support line or a health professional you trust. I am here for gentle movement and everyday habits whenever you want them.',
    supportReferral: true,
    because: ['I noticed language that suggests you may be struggling.'],
  },
  medical_symptom: {
    message:
      'What you describe could be serious. Please stop exercising and get medical help now (call your local emergency number if it is severe or getting worse). I cannot assess symptoms, and a professional can.',
    supportReferral: true,
    because: ['Symptoms like these need a health professional, not a fitness app.'],
  },
  unsafe_request: {
    message:
      'I cannot help with very fast weight loss, extreme restriction or fasting plans: they can harm your health and rarely last. I can help with a steady pace, regular meals, and movement you enjoy. If you are worried about your weight or eating, a registered dietitian or doctor can give you personal guidance.',
    supportReferral: true,
    because: ['Safe, sustainable changes work better than extreme ones.'],
  },
  minor: {
    message:
      'DanceHall Fit is for adults aged 18 and over, so I cannot coach you here. A parent, carer, teacher or doctor can help you find activity and food guidance that suits your age.',
    supportReferral: false,
    because: ['This app is for adults.'],
  },
};

const GUILT_AND_HYPE =
  /\b(?:guarantee[sd]?|will definitely lose|burn fat fast|fast fat loss|detox|cleanse|crash diet|starv(?:e|ing|ation)|cheat day|no excuses|you failed|lazy|ashamed|disappointing|punish(?:ment)?)\b|(?<!\b(?:no need to|nothing to|not have to|don'?t need to|never need to|needn'?t)\s)\b(?:earn (?:your )?(?:food|meal|dinner)|make up for|compensate for|work it off|burn off (?:that|your))\b/i;
const STREAK_PRESSURE =
  /\b(?:don'?t break (?:your|the) streak|keep your streak|streak (?:will be|is|gets) (?:lost|broken|reset)|you'?ll lose your streak|only \d+ (?:days?|hours?) left)\b/i;
const DIAGNOSIS =
  /\byou (?:have|are suffering from|probably have|likely have)\s+(?:diabetes|anorexia|bulimia|an eating disorder|depression|hypertension|high blood pressure|a thyroid)/i;
const LOW_KCAL_OUTPUT =
  /\b(?:under|below|less than|only|just|around|about)?\s*(\d{3,4})\s*(?:kcal|calories)\s+(?:a|per)\s+day\b/i;
const COMPETITION =
  /\b(?:beat|outdo|compete against|rank(?:ed)? (?:above|higher than)|leaderboard)\b.*\b(?:weight|lose|loss|kg|pounds)\b/i;

/** Problems in text a model wants to show. Any problem means the text is not shown. */
export function unsafeOutputProblems(text: string): string[] {
  const p: string[] = [];
  if (GUILT_AND_HYPE.test(text)) p.push('guilt, hype or extreme-diet language');
  if (STREAK_PRESSURE.test(text)) p.push('streak pressure');
  if (DIAGNOSIS.test(text)) p.push('medical diagnosis');
  if (COMPETITION.test(text)) p.push('weight competition');
  const low = LOW_KCAL_OUTPUT.exec(text);
  if (low && Number(low[1]) < 1200) p.push('very low calorie prescription');
  return p;
}
