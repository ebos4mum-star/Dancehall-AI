/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script (CommonJS so Playwright resolves from a global install) */
/*
 * Browser checks for the browse-first, PIN-first account experience (development build, mock mode: the data stays on the device and nothing reaches any cloud).
 * Usage:  pnpm export:web && node e2e/account.cjs
 * It covers: guest browsing, the account gates, PIN creation and confirmation, interrupted setup and onboarding, returning to the original action, the lock screen
 * and its throttling, changing the PIN, a session that ended, and a crafted return address. Face ID and Touch ID cannot run in a browser: their logic and
 * the PIN fallback are covered by unit tests with a fake module.
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { PIN, enterPin, createAccountViaPin, unlockIfLocked, onboard } = require('./auth.cjs');

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(['PASS', name]);
    console.log('PASS ', name);
  } catch (e) {
    results.push(['FAIL', name]);
    console.log(
      'FAIL ',
      name,
      '\n     ',
      String(e.message)
        .split('\n')
        .slice(0, process.env.E2E_VERBOSE ? 20 : 1)
        .join(' | '),
    );
  }
}

(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8097);
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.setDefaultTimeout(8000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const base = 'http://127.0.0.1:8097';
  const WORKOUT = '/dance/qf5-afrobeats-wake-up';
  const vis = (n) => p.getByText(n, { exact: false }).locator('visible=true');
  const seen = async (n, ms = 8000) => vis(n).last().waitFor({ state: 'visible', timeout: ms });
  const absent = async (n) => assert.equal(await vis(n).count(), 0, `${n} should not be visible`);
  const btn = (n) => p.getByRole('button', { name: n, exact: true }).locator('visible=true').last();
  const tab = async (name) => {
    await p.getByRole('tab', { name, exact: true }).click();
    await p.waitForTimeout(700);
  };
  const ls = (k) => p.evaluate((key) => localStorage.getItem(key), k);
  const signedIn = async () => {
    const raw = await ls('dh.mock.v1');
    return !!raw && JSON.parse(raw).signedIn === true;
  };
  const reload = async () => {
    await p.reload();
    await p.waitForTimeout(2000);
  };
  const pinGate = async () => {
    // Start screen -> PIN pad, from wherever the account screen was opened.
    await btn('Create account').click();
    await seen('Create a PIN');
  };

  await p.goto(base);
  await p.waitForTimeout(2500);

  await step(
    'guest: the app opens straight into browsing, with no sign-in wall and no account created',
    async () => {
      await seen('Welcome to DanceHall Fit');
      for (const t of ['Today', 'Dance', 'Food', 'Coach', 'Me'])
        assert.ok(await p.getByRole('tab', { name: t, exact: true }).isVisible(), t);
      await tab('Dance');
      await seen('Afrobeats Wake-Up', 20000);
      await p.goto(base + WORKOUT);
      await seen('Start guided session', 15000);
      await seen('Draft').catch(() => undefined);
      await p.goto(base);
      await p.waitForTimeout(1500);
      await tab('Food');
      await p.getByLabel('Search foods').fill('rice');
      await seen('White rice');
      await tab('Me');
      await seen('Your account');
      assert.equal(await signedIn(), false, 'browsing creates no account');
      assert.equal(await ls('dh.pin.v1'), null);
    },
  );

  await step(
    'gates: starting a workout, logging food and the coach ask for an account and say why',
    async () => {
      await p.goto(base + WORKOUT);
      await btn('Start guided session').click();
      await seen('To start a workout, you need an account.');
      await seen('no email and no password');
      await seen('adults aged 18 and over');
      await btn('Keep browsing').click();
      await seen('Start guided session');
      await p.goto(base);
      await p.waitForTimeout(1500);
      await tab('Food');
      await btn('Log a meal').click();
      await seen('To log food, you need an account.');
      await btn('Keep browsing').click();
      await tab('Coach');
      await seen('To use the coach, you need an account.');
      await btn('Keep browsing').click();
      assert.equal(await signedIn(), false);
    },
  );

  await step(
    'gates: every account-only screen sends a guest to the account screen without showing its content',
    async () => {
      const routes = [
        '/dance/session?id=qf5-afrobeats-wake-up',
        '/dance/history',
        '/dance/schedule',
        '/progress',
        '/goals',
        '/challenges',
        '/coach/settings',
        '/food/add',
        '/food/history',
        '/food/plan',
        '/privacy',
      ];
      for (const r of routes) {
        await p.goto(base + r);
        await seen('Create your account', 12000);
        await absent('Meal diary');
        await absent('Your Daily Fit Plan');
        await absent('Download my data');
      }
      assert.equal(await signedIn(), false);
    },
  );

  await step(
    'PIN setup: weak PINs are refused with a reason, a mismatch starts again, Cancel saves nothing',
    async () => {
      await p.goto(base);
      await seen('Welcome to DanceHall Fit', 15000);
      await btn('Create account').click();
      await seen('Create your account');
      await pinGate();
      await enterPin(p, '123456');
      await seen('run of numbers');
      await enterPin(p, '111111');
      await seen('repeats one digit');
      await enterPin(p, '123123');
      await seen('simple pattern');
      await enterPin(p, PIN);
      await seen('Confirm your PIN');
      await enterPin(p, '482917');
      await seen('did not match');
      await seen('Create a PIN');
      await btn('Cancel').click();
      await seen('Create your account');
      assert.equal(await ls('dh.pin.v1'), null);
      assert.equal(await signedIn(), false);
    },
  );

  await step(
    'interrupted setup: nothing is saved until the end, and what the person was doing is kept',
    async () => {
      await p.goto(base + WORKOUT);
      await btn('Start guided session').click();
      await seen('To start a workout, you need an account.');
      await pinGate();
      await enterPin(p, PIN);
      await enterPin(p, PIN);
      await seen('Before you finish');
      await seen('lose this phone you will not be able to restore this account');
      await reload(); // the app is closed before "Create my account"
      await seen('Create a PIN', 15000); // it opens on the PIN screen again: nothing was kept, so setup starts over
      assert.equal(await ls('dh.pin.v1'), null, 'no PIN was stored');
      assert.equal(await signedIn(), false, 'no account was created');
      const pending = JSON.parse((await ls('dh.pending.v1')) ?? 'null');
      assert.equal(pending?.intent, 'start_workout');
      assert.match(pending?.next ?? '', /^\/dance\/qf5-afrobeats-wake-up/);
    },
  );

  await step(
    'account created with a PIN; interrupted onboarding resumes after the PIN; the original workout resumes at the end',
    async () => {
      await p.goto(base + WORKOUT);
      await btn('Start guided session').click();
      await seen('To start a workout, you need an account.');
      await createAccountViaPin(p);
      assert.equal(await signedIn(), true);
      const raw = await ls('dh.pin.v1');
      assert.ok(raw && !raw.includes(PIN), 'the PIN is stored only as a salted hash');
      await reload(); // the app is closed during onboarding
      await seen('Enter your PIN', 15000);
      // The app underneath is hidden from screen readers while locked.
      const hidden = await p.evaluate(
        () =>
          document
            .querySelector('input[aria-label="What should we call you?"]')
            ?.closest('[aria-hidden="true"]') !== null,
      );
      assert.equal(hidden, true, 'the locked app is hidden from assistive technology');
      await enterPin(p, PIN);
      await p.getByLabel('What should we call you?').waitFor({ state: 'visible', timeout: 15000 });
      await onboard(p);
      await seen('Afrobeats Wake-Up', 20000); // the session they were trying to start
      await seen('Start', 5000);
      assert.equal(await ls('dh.pending.v1'), null, 'the saved action was used once');
    },
  );

  await step(
    'lock: the app locks on reload; wrong PINs are counted, five lock for 30 seconds, the right PIN is refused meanwhile',
    async () => {
      await reload();
      await seen('Enter your PIN', 15000);
      const wrong = '906318';
      await enterPin(p, wrong);
      await seen('Wrong PIN. 3 attempts left');
      await enterPin(p, wrong);
      await seen('Wrong PIN. 2 attempts left');
      await enterPin(p, wrong);
      await seen('One more wrong attempt');
      await enterPin(p, wrong);
      await seen('One more wrong attempt');
      await enterPin(p, wrong);
      await seen('Too many wrong PINs. Try again in');
      assert.equal(
        await p
          .getByRole('button', { name: '4', exact: true })
          .locator('visible=true')
          .last()
          .isDisabled(),
        true,
      );
      // The lockout is in storage, so reloading does not reset it.
      await reload();
      await seen('Enter your PIN', 15000);
      await enterPin(p, PIN).catch(() => undefined);
      await seen('Too many wrong PINs. Try again in');
      await p.waitForTimeout(32000);
      await absent('Too many wrong PINs. Try again in');
      await enterPin(p, PIN);
      await p.getByText('Enter your PIN').first().waitFor({ state: 'hidden', timeout: 15000 });
    },
  );

  await step(
    'lock: after ten wrong PINs the PIN stops working on this phone and signing out of it is offered',
    async () => {
      await reload();
      await seen('Enter your PIN', 15000);
      await p.evaluate(() =>
        localStorage.setItem(
          'dh.pin.throttle.v1',
          JSON.stringify({ failures: 9, lockedUntil: null }),
        ),
      );
      await reload();
      await seen('Enter your PIN', 15000);
      await enterPin(p, '906318');
      await seen('no longer works on this phone');
      await seen('Sign out of this phone');
      assert.equal(
        await p.getByRole('button', { name: '1', exact: true }).count(),
        0,
        'the pad is gone',
      );
      // Restore the counter and open the app again to carry on.
      await p.evaluate(() => localStorage.removeItem('dh.pin.throttle.v1'));
      await reload();
      await seen('Enter your PIN', 15000);
      await enterPin(p, PIN);
      await p.getByText('Enter your PIN').first().waitFor({ state: 'hidden', timeout: 15000 });
    },
  );

  await step(
    'security settings: change the PIN (old PIN first), lock now, and the old PIN no longer works',
    async () => {
      await p.goto(base);
      await unlockIfLocked(p);
      await seen('Hello, Sam', 15000);
      await tab('Me');
      await seen('Security');
      await seen('opens with a six-digit PIN');
      await btn('Change PIN').click();
      await seen('Enter your current PIN');
      await enterPin(p, PIN);
      await seen('Change your PIN');
      await enterPin(p, '730512');
      await seen('Confirm your PIN');
      await enterPin(p, '730512');
      await seen('Security', 15000);
      await btn('Lock now').click();
      await seen('Enter your PIN');
      await enterPin(p, PIN);
      await seen('Wrong PIN');
      await enterPin(p, '730512');
      await p.getByText('Enter your PIN').first().waitFor({ state: 'hidden', timeout: 15000 });
    },
  );

  await step(
    'session ended: with a PIN on the phone but no session, the account screen says so and can remove the PIN',
    async () => {
      await p.evaluate(() => localStorage.removeItem('dh.mock.v1')); // the session is gone, as after an expiry
      await reload();
      await seen('Your account', 15000); // it reopens on the Me tab, now as a guest
      await btn('Create account').click();
      await seen('Your sign-in ended');
      await seen('Signing in again is not available in this build yet');
      await btn('Remove the PIN from this phone').click();
      await seen('Create your account');
      assert.equal(await ls('dh.pin.v1'), null, 'the PIN was removed');
    },
  );

  await step(
    'a crafted return address is ignored: after sign-up the person lands in the app, not on another site',
    async () => {
      await p.goto(base + '/account/start?next=https%3A%2F%2Fevil.example%2Fsteal&intent=log_food');
      await seen('To log food, you need an account.');
      await createAccountViaPin(p);
      await onboard(p);
      await seen('Hello, Sam', 20000);
      assert.ok(p.url().startsWith(base), p.url());
    },
  );

  console.log(
    `\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} account checks passed`,
  );
  const real = errors.filter((e) => !/ResizeObserver|favicon/i.test(e));
  if (real.length) console.log('page errors:', real.slice(0, 3));
  await browser.close();
  srv.close();
  process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
})();
