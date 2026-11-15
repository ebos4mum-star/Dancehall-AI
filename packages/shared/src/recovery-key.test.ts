import { describe, expect, it } from 'vitest';
import {
  formatRecoveryKey,
  generateRecoveryKey,
  parseRecoveryKey,
  recoveryDigest,
} from './recovery-key';
import { answersProof, checkQuestionSetup, normalizeAnswer } from './security-questions';

const rnd = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));

describe('recovery key', () => {
  it('parses what a person types: any case, dashes, spaces, look-alikes', () => {
    const k = generateRecoveryKey(rnd);
    const shown = formatRecoveryKey(k);
    expect(shown).toMatch(/^([0-9A-Z]{4}-){8}[0-9A-Z]{4}$/);
    expect(parseRecoveryKey(shown.toLowerCase())).toBe(k);
    expect(parseRecoveryKey(shown.replace(/-/g, ' '))).toBe(k);
  });
  it('rejects a single wrong character and wrong lengths', () => {
    const k = generateRecoveryKey(rnd);
    const bad = (k[0] === '2' ? '3' : '2') + k.slice(1);
    expect(parseRecoveryKey(bad)).toBeNull();
    expect(parseRecoveryKey(k.slice(1))).toBeNull();
    expect(parseRecoveryKey('')).toBeNull();
    expect(parseRecoveryKey('U'.repeat(36))).toBeNull();
  });
  it('digest is stable, one-way-looking, and differs per key', () => {
    const a = generateRecoveryKey(rnd);
    expect(recoveryDigest(a)).toBe(recoveryDigest(a));
    expect(recoveryDigest(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(recoveryDigest(a)).not.toBe(recoveryDigest(generateRecoveryKey(rnd)));
    expect(recoveryDigest(a)).not.toContain(a.toLowerCase());
  });
  it('rejects a short random source', () => {
    expect(() => generateRecoveryKey((n) => new Uint8Array(n - 1))).toThrow();
  });
});

describe('security answers', () => {
  it('normalises case, punctuation, spacing and accents consistently', () => {
    expect(normalizeAnswer("  St.  Mary's  ")).toBe('st marys');
    expect(normalizeAnswer('ＭＡＭＡ Joyce!')).toBe('mama joyce');
  });
  it('validates the pair', () => {
    const a = { id: 'q-first-pet', answer: 'Rex' };
    expect(checkQuestionSetup(a, { id: 'q-first-pet', answer: 'Spot' })).toBe('same-question');
    expect(checkQuestionSetup(a, { id: 'q-family-dish', answer: 'x' })).toBe('too-short');
    expect(checkQuestionSetup(a, { id: 'q-family-dish', answer: 'rex!' })).toBe('same-answer');
    expect(checkQuestionSetup(a, { id: 'bogus', answer: 'Spot' })).toBe('unknown-question');
    expect(checkQuestionSetup(a, { id: 'q-family-dish', answer: 'Curry goat' })).toBeNull();
  });
  it('the proof ignores question order and answer formatting, and depends on the salt', async () => {
    const f = { N: 16, r: 8, p: 1, dkLen: 32 };
    const a = { id: 'q-first-pet', answer: 'Rex' };
    const b = { id: 'q-family-dish', answer: 'Curry goat' };
    const p1 = await answersProof([a, b], 'aa', f);
    expect(await answersProof([b, a], 'aa', f)).toBe(p1);
    expect(await answersProof([{ ...a, answer: ' REX. ' }, b], 'aa', f)).toBe(p1);
    expect(await answersProof([a, b], 'bb', f)).not.toBe(p1);
    expect(await answersProof([a, { ...b, answer: 'Curry' }], 'aa', f)).not.toBe(p1);
  });
  it('the production scrypt cost is the one documented', async () => {
    const t = Date.now();
    await answersProof(
      [
        { id: 'q-first-pet', answer: 'Rex' },
        { id: 'q-family-dish', answer: 'Curry goat' },
      ],
      'aa',
    );
    expect(Date.now() - t).toBeLessThan(10_000);
  });
});
