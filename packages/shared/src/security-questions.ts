/**
 * The two security questions. They are an ADDITIONAL factor: recovery needs the Recovery Key AND both answers, and the answers alone prove nothing (the server
 * cannot even find the account without the key). Questions come from a fixed catalogue so ids are stable and nothing free-text is stored. Answers are normalised
 * identically everywhere, then stretched with a slow salted hash ON THE DEVICE, so the server only ever sees a proof, never an answer, and a leaked table of
 * proofs is expensive to attack.
 */
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const SECURITY_QUESTIONS = [
  {
    id: 'q-first-school-teacher',
    text: 'What was the surname of your favourite teacher at your first school?',
  },
  {
    id: 'q-childhood-street',
    text: 'What was the name of the street you lived on when you were seven?',
  },
  { id: 'q-first-job-place', text: 'What was the name of the place where you had your first job?' },
  {
    id: 'q-grandparent-home',
    text: 'In which town or village did one of your grandparents grow up?',
  },
  { id: 'q-first-song-danced', text: 'What was the first song you remember dancing to?' },
  { id: 'q-best-friend-nickname', text: 'What was your childhood best friend’s nickname?' },
  { id: 'q-first-pet', text: 'What was the name of your first pet or a pet you loved as a child?' },
  { id: 'q-family-dish', text: 'What dish does your family cook for celebrations?' },
  { id: 'q-first-concert', text: 'What was the first live show or party you went to?' },
  { id: 'q-childhood-hero', text: 'Who was your hero when you were ten?' },
  { id: 'q-first-phone-model', text: 'What was the make of your first mobile phone?' },
  { id: 'q-favourite-school-subject', text: 'What was your favourite subject at school?' },
] as const;

export type QuestionId = (typeof SECURITY_QUESTIONS)[number]['id'];
export const QUESTION_IDS: readonly string[] = SECURITY_QUESTIONS.map((q) => q.id);
export const isQuestionId = (s: unknown): s is QuestionId =>
  typeof s === 'string' && QUESTION_IDS.includes(s);
export const MIN_ANSWER_LENGTH = 3;

/** Unicode-normalise, lower-case, drop punctuation, collapse spaces. "  St. Mary's  " and "st marys" are the same answer. */
export function normalizeAnswer(raw: string): string {
  return raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\p{P}\p{S}]/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

export type AnswerProblem = 'same-question' | 'unknown-question' | 'too-short' | 'same-answer';

/** Validates the pair chosen at setup. Returns the first problem, or null. */
export function checkQuestionSetup(
  a: { id: string; answer: string },
  b: { id: string; answer: string },
): AnswerProblem | null {
  if (!isQuestionId(a.id) || !isQuestionId(b.id)) return 'unknown-question';
  if (a.id === b.id) return 'same-question';
  const na = normalizeAnswer(a.answer);
  const nb = normalizeAnswer(b.answer);
  if (na.length < MIN_ANSWER_LENGTH || nb.length < MIN_ANSWER_LENGTH) return 'too-short';
  if (na === nb) return 'same-answer';
  return null;
}

export const ANSWER_GUIDANCE =
  'Pick answers only you would know and that are not on your social media. Answers do not need to be true: a made-up answer you will remember is stronger. Capital letters and punctuation do not matter.';

export const SCRYPT = { N: 2 ** 15, r: 8, p: 1, dkLen: 32 } as const;

/**
 * The proof the client sends instead of the answers: scrypt over the two normalised answers, keyed by the account's random salt. Pairs are ordered by question id so
 * the order in which the questions are shown does not matter. The server stores only a keyed hash of this proof.
 */
export async function answersProof(
  pair: [{ id: string; answer: string }, { id: string; answer: string }],
  saltHex: string,
  params: { N: number; r: number; p: number; dkLen: number } = SCRYPT,
): Promise<string> {
  const sorted = [...pair].sort((x, y) => (x.id < y.id ? -1 : 1));
  const material = `dh-answers-v1|${sorted[0]!.id}|${normalizeAnswer(sorted[0]!.answer)}|${sorted[1]!.id}|${normalizeAnswer(sorted[1]!.answer)}`;
  const out = await scryptAsync(utf8ToBytes(material), utf8ToBytes(`dh-salt-v1:${saltHex}`), {
    ...params,
    maxmem: 256 * 1024 * 1024,
  });
  return bytesToHex(out);
}
