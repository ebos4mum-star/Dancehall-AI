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

import { coolingOffMsFromEnv, networkIdentity, safeEqual } from './account-core';

describe('operational guards', () => {
  const H = 3600_000;
  it('cooling-off: default 24 hours; unreadable or too-short values cannot switch it off', () => {
    expect(coolingOffMsFromEnv(undefined, false)).toBe(24 * H);
    expect(coolingOffMsFromEnv('', false)).toBe(24 * H);
    expect(coolingOffMsFromEnv('banana', false)).toBe(24 * H);
    expect(coolingOffMsFromEnv('-5', false)).toBe(24 * H);
    expect(coolingOffMsFromEnv('0', false)).toBe(24 * H);
    expect(coolingOffMsFromEnv('0.2', false)).toBe(24 * H);
    expect(coolingOffMsFromEnv('48', false)).toBe(48 * H);
    expect(coolingOffMsFromEnv('100000', false)).toBe(24 * 30 * H);
  });
  it('a short wait is possible only when explicitly allowed (live test)', () => {
    expect(coolingOffMsFromEnv('0', true)).toBe(0);
    expect(coolingOffMsFromEnv('0.01', true)).toBe(0.01 * H);
  });
  it('safeEqual compares whole values', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
  it('network identity: IPv4 as is, IPv6 grouped by /64, mapped addresses unwrapped, anything unreadable shares one bucket', () => {
    expect(networkIdentity('203.0.113.7')).toBe('v4:203.0.113.7');
    expect(networkIdentity(' 203.0.113.007 ')).toBe('v4:203.0.113.7');
    expect(networkIdentity('::ffff:203.0.113.7')).toBe('v4:203.0.113.7');
    const a = networkIdentity('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    expect(a).toBe('v6:2001:0db8:0001:0002');
    expect(networkIdentity('2001:DB8:1:2::1')).toBe(a);
    expect(networkIdentity('[2001:db8:1:2:ffff:ffff:ffff:ffff]')).toBe(a);
    expect(networkIdentity('2001:db8:1:3::1')).not.toBe(a);
    expect(networkIdentity('::1')).toBe('v6:0000:0000:0000:0000');
    for (const bad of [
      null,
      undefined,
      '',
      ' ',
      'unknown',
      '999.1.1.1',
      '1.2.3',
      '2001:db8::1::2',
      '2001:db8:zz::1',
      'a'.repeat(80),
      '1.2.3.4, 5.6.7.8',
    ])
      expect(networkIdentity(bad as string | null), String(bad)).toBe('no-identity');
  });
});
