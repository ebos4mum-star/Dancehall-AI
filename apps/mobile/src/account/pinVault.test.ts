import { describe, expect, it } from 'vitest';
import { createBiometrics, type BiometricModule } from './biometrics';
import { createPinVault, type VaultStorage } from './pinVault';

const memory = () => {
  const data = new Map<string, string>();
  const log: Array<[string, string]> = [];
  const storage: VaultStorage = {
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => void (data.set(k, v), log.push([k, v])),
    remove: async (k) => void data.delete(k),
  };
  return { data, log, storage };
};
let seed = 1;
const random = (n: number) =>
  Uint8Array.from({ length: n }, () => (seed = (seed * 48271) % 2147483647) & 255);
const setup = (clock = { t: 1_000_000 }) => {
  const m = memory();
  const mk = () => createPinVault({ storage: m.storage, random, now: () => clock.t });
  return { ...m, clock, vault: mk(), restart: mk };
};
const PIN = '482916';

describe('PIN vault: what is stored', () => {
  it('never stores the PIN or anything that contains it, in any form it was written', async () => {
    const { vault, data, log } = setup();
    await vault.create(PIN);
    await vault.verify(PIN);
    await vault.verify('111111');
    const everything = [...data.values(), ...log.map(([, v]) => v)].join('|');
    expect(everything).not.toContain(PIN);
    expect(everything).not.toContain('"pin"');
    expect(Object.keys(JSON.parse(data.get('dh.pin.v1')!)).sort()).toEqual([
      'N',
      'hash',
      'kdf',
      'p',
      'r',
      'salt',
      'v',
    ]);
  });

  it('uses a fresh salt each time, so the same PIN gives a different record', async () => {
    const a = setup();
    const b = setup();
    await a.vault.create(PIN);
    await b.vault.create(PIN);
    const ra = JSON.parse(a.data.get('dh.pin.v1')!);
    const rb = JSON.parse(b.data.get('dh.pin.v1')!);
    expect(ra.salt).not.toBe(rb.salt);
    expect(ra.hash).not.toBe(rb.hash);
    expect(ra.salt).toHaveLength(32);
    expect(ra.hash).toHaveLength(64);
    expect(ra.N).toBeGreaterThanOrEqual(2 ** 14);
  });

  it('refuses anything that is not exactly six digits, without counting it as a wrong guess', async () => {
    const { vault, restart } = setup();
    await expect(vault.create('12345')).rejects.toThrow(/six digits/);
    await vault.create(PIN);
    for (const bad of ['', '12345', '1234567', 'abcdef'])
      expect(await vault.verify(bad)).toEqual({ ok: false, reason: 'format' });
    expect((await restart().status()).failures).toBe(0);
  });
});

describe('PIN vault: verification and lockout', () => {
  it('accepts the right PIN and rejects a wrong one, saying how many attempts remain', async () => {
    const { vault } = setup();
    expect(await vault.verify(PIN)).toEqual({ ok: false, reason: 'not_set' });
    await vault.create(PIN);
    expect(await vault.verify(PIN)).toEqual({ ok: true });
    expect(await vault.verify('906318')).toMatchObject({
      ok: false,
      reason: 'wrong',
      attemptsLeft: 3,
      lockedForS: 0,
    });
    expect(await vault.verify('906318')).toMatchObject({ attemptsLeft: 2 });
    expect(await vault.verify(PIN)).toEqual({ ok: true }); // a correct PIN clears the count
    expect(await vault.verify('906318')).toMatchObject({ attemptsLeft: 3 });
  });

  it('locks after four wrong attempts, refuses even the right PIN while locked, and lifts when the time passes', async () => {
    const { vault, clock } = setup();
    await vault.create(PIN);
    for (let i = 0; i < 4; i++) await vault.verify('906318');
    const fifth = await vault.verify('906318');
    expect(fifth).toMatchObject({ ok: false, reason: 'wrong', lockedForS: 30 });
    expect(await vault.verify(PIN)).toEqual({ ok: false, reason: 'locked', lockedForS: 30 });
    clock.t += 31_000;
    expect(await vault.verify(PIN)).toEqual({ ok: true });
  });

  it('lockouts get longer and survive a restart of the app', async () => {
    const { vault, restart, clock } = setup();
    await vault.create(PIN);
    for (let i = 0; i < 5; i++) await vault.verify('906318');
    clock.t += 31_000;
    expect(await vault.verify('906318')).toMatchObject({ lockedForS: 60 });
    const reopened = restart(); // a new process reading the same secure storage
    expect(await reopened.verify(PIN)).toEqual({ ok: false, reason: 'locked', lockedForS: 60 });
    expect((await reopened.status()).failures).toBe(6);
  });

  it('stops accepting the PIN at all after ten failures, even the right one', async () => {
    const { vault, clock } = setup();
    await vault.create(PIN);
    for (let i = 0; i < 9; i++) {
      await vault.verify('906318');
      clock.t += 4000_000;
    }
    expect(await vault.verify('906318')).toEqual({ ok: false, reason: 'reset_required' });
    clock.t += 99_000_000;
    expect(await vault.verify(PIN)).toEqual({ ok: false, reason: 'reset_required' });
    expect((await vault.status()).resetRequired).toBe(true);
  });

  it('counts an attempt BEFORE checking it, so interrupting the check cannot reset the counter', async () => {
    const { vault, data, restart } = setup();
    await vault.create(PIN);
    const rec = JSON.parse(data.get('dh.pin.v1')!);
    data.set('dh.pin.v1', JSON.stringify({ ...rec, N: 3 })); // makes the hash step throw part-way, like a kill mid-check
    await expect(vault.verify(PIN)).rejects.toThrow();
    expect((await restart().status()).failures).toBe(1);
  });

  it('treats a damaged counter as strict, never as a free reset', async () => {
    const { vault, data, restart } = setup();
    await vault.create(PIN);
    data.set('dh.pin.throttle.v1', '{not json');
    const s = await restart().status();
    expect(s.failures).toBe(9);
    expect(s.lockedForS).toBeGreaterThan(0);
    expect(await vault.verify(PIN)).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('rejects a damaged PIN record instead of letting anything in', async () => {
    const { vault, data } = setup();
    await vault.create(PIN);
    data.set('dh.pin.v1', '{"v":2}');
    expect(await vault.isSet()).toBe(false);
    expect(await vault.verify(PIN)).toEqual({ ok: false, reason: 'not_set' });
  });
});

describe('PIN vault: change, biometric choice, sign out', () => {
  it('changes the PIN only after the old one verifies, and a wrong old PIN changes nothing', async () => {
    const { vault } = setup();
    await vault.create(PIN);
    expect(await vault.change('906318', '730512')).toMatchObject({ ok: false, reason: 'wrong' });
    expect(await vault.verify(PIN)).toEqual({ ok: true });
    expect(await vault.change(PIN, '730512')).toEqual({ ok: true });
    expect(await vault.verify(PIN)).toMatchObject({ ok: false });
    expect(await vault.verify('730512')).toEqual({ ok: true });
  });

  it('remembers the biometric choice, and clear removes the PIN, the counter and the choice', async () => {
    const { vault, data, restart } = setup();
    await vault.create(PIN);
    expect(await vault.biometricEnabled()).toBe(false);
    await vault.setBiometric(true);
    expect(await restart().biometricEnabled()).toBe(true);
    await vault.verify('906318');
    await vault.clear();
    expect(data.size).toBe(0);
    expect(await vault.isSet()).toBe(false);
    expect(await vault.biometricEnabled()).toBe(false);
  });
});

describe('biometrics', () => {
  const mod = (over: Partial<BiometricModule> = {}): BiometricModule => ({
    hasHardwareAsync: async () => true,
    isEnrolledAsync: async () => true,
    supportedAuthenticationTypesAsync: async () => [2],
    authenticateAsync: async () => ({ success: true }),
    ...over,
  });
  it('is offered only with hardware and an enrolled face or finger, and names the kind', async () => {
    expect(await createBiometrics(mod()).info()).toEqual({ available: true, kind: 'face' });
    expect(
      await createBiometrics(mod({ supportedAuthenticationTypesAsync: async () => [1] })).info(),
    ).toEqual({ available: true, kind: 'touch' });
    expect(await createBiometrics(mod({ hasHardwareAsync: async () => false })).info()).toEqual({
      available: false,
      kind: null,
    });
    expect(await createBiometrics(mod({ isEnrolledAsync: async () => false })).info()).toEqual({
      available: false,
      kind: null,
    });
    expect(
      await createBiometrics(
        mod({
          hasHardwareAsync: async () => {
            throw new Error('x');
          },
        }),
      ).info(),
    ).toEqual({ available: false, kind: null });
  });
  it('falls back to the PIN on a failed, cancelled or broken prompt, and never allows the device passcode as a second fallback', async () => {
    let seen: Record<string, unknown> = {};
    const ok = createBiometrics(
      mod({ authenticateAsync: async (o) => ((seen = o), { success: true }) }),
    );
    expect(await ok.prompt('Unlock', 'Use PIN')).toBe(true);
    expect(seen).toMatchObject({
      disableDeviceFallback: true,
      fallbackLabel: '',
      cancelLabel: 'Use PIN',
    });
    expect(
      await createBiometrics(mod({ authenticateAsync: async () => ({ success: false }) })).prompt(
        'x',
        'y',
      ),
    ).toBe(false);
    expect(
      await createBiometrics(
        mod({
          authenticateAsync: async () => {
            throw new Error('locked out');
          },
        }),
      ).prompt('x', 'y'),
    ).toBe(false);
  });
});
