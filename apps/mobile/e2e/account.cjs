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
const {
  PIN,
  ANSWERS,
  enterPin,
  createAccountViaPin,
  setUpRecoveryAndPin,
  readKey,
  unlockIfLocked,
  onboard,
} = require('./auth.cjs');

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
  const recoveryGate = async () => {
    // Start screen -> the recovery questions, from wherever the account screen was opened.
    await btn('Create account').click();
    await seen('Set up recovery');
  };
  // Presses "Create account" until the recovery screen is there (a screen can still be sliding in or out).
  const toRecovery = async () => {
    for (let i = 0; i < 4; i++) {
      if (
        await p
          .getByText('Set up recovery')
          .first()
          .isVisible()
          .catch(() => false)
      )
        return;
      await btn('Create account')
        .click({ timeout: 8000 })
        .catch(() => undefined);
      await p.waitForTimeout(700);
    }
    await seen('Set up recovery');
  };
  let KEY1, KEY2, KEY3;
  const REQUIRED_KEY = /^([0-9A-Z]{4}-){8}[0-9A-Z]{4}$/;
  const sim = async () => JSON.parse((await ls('dh.devcloud.v1')) ?? '{"users":[]}');

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
    'recovery setup: two different questions are required, short answers are refused, nothing is created until it succeeds',
    async () => {
      await p.goto(base);
      await seen('Welcome to DanceHall Fit', 15000);
      await btn('Create account').click();
      await seen('Create your account');
      await recoveryGate();
      await seen('only you can answer');
      assert.ok(
        await btn('Create my account').isDisabled(),
        'disabled until both questions and answers are filled in',
      );
      await p.getByRole('radio').locator('visible=true').nth(0).click();
      await p.getByRole('radio').locator('visible=true').nth(12).click();
      await p.getByLabel('Answer to the first question').fill('ab');
      await p.getByLabel('Answer to the second question').fill('Mama Joyce');
      await btn('Create my account').click();
      await seen('at least three characters');
      assert.equal((await sim()).users.length, 0, 'nothing was created');
      assert.equal(await signedIn(), false);
      await p.getByLabel('Answer to the first question').fill('Mama Joyce');
      await btn('Create my account').click();
      await seen('must be different');
      assert.equal((await sim()).users.length, 0);
      await btn('Cancel').click();
      await seen('Create your account');
    },
  );

  await step(
    'recovery key: shown once with warnings, share/copy are user actions that fail honestly, continuing needs the confirmation, then the key is erased from the phone',
    async () => {
      await p.goto(base);
      await seen('Welcome to DanceHall Fit', 15000);
      await toRecovery();
      await p.getByRole('radio').locator('visible=true').nth(0).click();
      await p.getByRole('radio').locator('visible=true').nth(12).click();
      await p.getByLabel('Answer to the first question').fill(ANSWERS[0]);
      await p.getByLabel('Answer to the second question').fill(ANSWERS[1]);
      await btn('Create my account').click();
      await seen('Save your Recovery Key', 20000);
      await seen('Anyone who has both the key and your answers');
      await seen('may be impossible to recover');
      const key = await readKey(p);
      assert.match(key, REQUIRED_KEY);
      assert.equal((await sim()).users.length, 1, 'exactly one account');
      assert.equal(await signedIn(), true);
      assert.ok(await btn('Continue').isDisabled(), 'Continue needs the confirmation');
      // The browser build has no share sheet: the failure is reported, never hidden.
      await btn('Save with another app').click();
      await seen('share sheet could not open');
      // The key is stored (secure storage on a phone) only until it is confirmed; the answers are never stored.
      const draft = (await ls('dh.acct.backup.v1')) ?? '';
      assert.ok(draft.includes(key.replace(/-/g, '')), 'the key is kept until confirmed');
      const all = JSON.stringify(Object.entries(await p.evaluate(() => ({ ...localStorage }))));
      assert.ok(
        !all.toLowerCase().includes(ANSWERS[0].toLowerCase()),
        'the answers are not stored anywhere',
      );
      assert.ok(!all.toLowerCase().includes(ANSWERS[1].toLowerCase()));
      // Closing the app before confirming resumes at the same key: no second account, no lost key.
      await reload();
      await seen('Save your Recovery Key', 15000);
      assert.equal(await readKey(p), key, 'the same key is shown again');
      assert.equal((await sim()).users.length, 1, 'still one account');
      await p
        .getByRole('switch', { name: 'I have saved my Recovery Key somewhere safe' })
        .last()
        .check({ force: true });
      await btn('Continue').click();
      await seen('Protect your account with a PIN');
      const after = (await ls('dh.acct.backup.v1')) ?? '';
      assert.ok(!after.includes('"key"'), 'confirming erases the key from the phone');
      assert.ok(after.includes('confirmed'));
    },
  );

  await step(
    'PIN setup: weak PINs are refused with a reason, a mismatch starts again, the PIN is a lock only',
    async () => {
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
      await seen('Protect your account with a PIN');
      await enterPin(p, PIN);
      await enterPin(p, PIN);
      await seen('Before you finish');
      await seen('Recovery Key and the answers to your two questions');
      // Closing the app before the PIN is saved: the account exists and is not left open, so setup resumes at the PIN.
      assert.equal(await ls('dh.pin.v1'), null, 'no PIN was stored yet');
      await reload();
      await seen('Protect your account with a PIN', 15000);
      assert.equal((await sim()).users.length, 1);
      await enterPin(p, PIN);
      await enterPin(p, PIN);
      await btn('Protect my account').click();
      await p.getByLabel('What should we call you?').waitFor({ state: 'visible' });
      // Clean slate for the next checks.
      await p.evaluate(() => localStorage.clear());
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
    'session lost but this phone still holds the device credential: it signs in again by itself, the history is still there, and the PIN lock returns',
    async () => {
      await p.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('dh.mock.v1'));
        s.signedIn = false; // the session is gone, as after an expiry; the account's data stays with the account
        localStorage.setItem('dh.mock.v1', JSON.stringify(s));
      });
      await reload();
      await unlockIfLocked(p, '730512'); // the PIN was changed in the security-settings check
      await seen('Security', 20000); // it reopens on the Me tab, signed in again
      await tab('Today');
      await seen('Hello, Sam', 20000); // the account's saved profile is still there
      assert.equal(await signedIn(), true);
    },
  );

  await step(
    'session ended and the credential was refused: the account screen says so and can remove the PIN',
    async () => {
      await p.evaluate(() => {
        localStorage.removeItem('dh.mock.v1'); // no session
        localStorage.removeItem('dh.device.v1'); // and the account no longer accepts this phone
      });
      await reload();
      await tab('Me');
      await seen('Your account', 15000); // now a guest
      await btn('Create account').click();
      await seen('Your sign-in ended');
      await seen('Signing in again is not available in this build yet');
      await btn('Remove the PIN from this phone').click();
      await seen('Create your account');
      assert.equal(await ls('dh.pin.v1'), null, 'the PIN was removed');
      await p.evaluate(() => localStorage.clear());
    },
  );

  await step(
    'a crafted return address is ignored: after sign-up the person lands in the app, not on another site',
    async () => {
      await p.goto(base + '/account/start?next=https%3A%2F%2Fevil.example%2Fsteal&intent=log_food');
      await seen('To log food, you need an account.');
      KEY1 = await createAccountViaPin(p);
      await onboard(p);
      await seen('Hello, Sam', 20000);
      assert.ok(p.url().startsWith(base), p.url());
    },
  );

  // Recovery and key replacement label each answer with its question (shown in the catalogue's order, not the order chosen at setup).
  // ANSWERS[0] was given for the teacher question and ANSWERS[1] for the street question during setup.
  const answerFields = async (a = ANSWERS) => {
    await p.getByLabel(/favourite teacher/).fill(a[0]);
    await p.getByLabel(/street you lived on/).fill(a[1]);
  };
  // For a key the server does not know the questions are decoys, so fill the two visible fields in order.
  const answerAny = async (a) => {
    const boxes = p.getByRole('textbox').locator('visible=true');
    await boxes.nth(0).fill(a[0]);
    await boxes.nth(1).fill(a[1]);
  };
  const keyScreenConfirm = async () => {
    await p
      .getByRole('switch', { name: 'I have saved my Recovery Key somewhere safe' })
      .last()
      .check({ force: true });
    await btn('Continue').click();
  };

  await step(
    'replace the Recovery Key: wrong answers change nothing; right answers make a new key and the old key stops working',
    async () => {
      await tab('Me');
      await seen('Recovery Key');
      await seen('Saved. You confirmed you keep it safe.');
      await btn('Replace Recovery Key').click();
      await seen('Replace your Recovery Key');
      await answerFields(['wrong one', 'wrong two']);
      await btn('Make a new key').click();
      await seen('Those answers were not right');
      await answerFields([ANSWERS[0].toUpperCase() + '!', ANSWERS[1]]); // the right answers (matching ignores case and punctuation)
      await btn('Make a new key').click();
      await seen('Save your Recovery Key', 20000);
      await seen('Anyone who has both');
      KEY2 = await readKey(p);
      assert.match(KEY2, REQUIRED_KEY);
      assert.notEqual(KEY2, KEY1, 'a different key');
      await keyScreenConfirm();
      await tab('Me');
      await seen('Security', 15000);
      assert.equal((await sim()).users.length, 1, 'same account');
    },
  );

  const toRecoverScreen = async () => {
    await tab('Me');
    await seen('Your account', 15000);
    await btn('Create account').click();
    await seen('Create your account');
    await btn('Recover my account').click();
    await seen('Enter the Recovery Key you saved');
  };
  const forgetThisPhone = async () => {
    // As a new phone: the account's cloud data (the simulation's server and the mock data) stays; everything this phone held is gone.
    await p.evaluate(() => {
      for (const k of [
        'dh.pin.v1',
        'dh.pin.throttle.v1',
        'dh.pin.biometric.v1',
        'dh.device.v1',
        'dh.acct.backup.v1',
        'dh.acct.recover.v1',
        'dh.acct.setup.v1',
      ])
        localStorage.removeItem(k);
      const s = JSON.parse(localStorage.getItem('dh.mock.v1'));
      s.signedIn = false;
      localStorage.setItem('dh.mock.v1', JSON.stringify(s));
    });
    await reload();
  };

  await step(
    'recovery: a wrong key and a wrong answer look the same; the replaced key no longer works; a mistyped key is caught on the phone',
    async () => {
      await forgetThisPhone();
      await toRecoverScreen();
      // A typo is caught by the checksum, before anything is sent.
      await p.getByLabel('Recovery Key').fill(KEY2.replace(/^./, KEY2[0] === '2' ? '3' : '2'));
      await btn('Continue').click();
      await seen('does not look right');
      // The OLD (replaced) key is a valid-looking key the server does not know: the questions appear all the same...
      await p.getByLabel('Recovery Key').fill(KEY1);
      await btn('Continue').click();
      await seen('Answer your two questions');
      await answerAny(ANSWERS);
      await btn('Check my answers').click();
      await seen('We could not verify those details');
      // ...and the current key with a wrong answer says exactly the same thing.
      await p.getByLabel('Recovery Key').fill(KEY2);
      await btn('Continue').click();
      await seen('Answer your two questions');
      await answerFields([ANSWERS[0], 'not it']);
      await btn('Check my answers').click();
      await seen('We could not verify those details');
      assert.equal(await signedIn(), false);
      assert.equal(await ls('dh.device.v1'), null, 'nothing was granted');
    },
  );

  await step(
    'recovery: key + answers, a waiting period, then the SAME account on a new phone with a new key and PIN; saved history is back',
    async () => {
      await p.getByLabel('Recovery Key').fill(KEY2.toLowerCase().replace(/-/g, ' '));
      await btn('Continue').click();
      await seen('Answer your two questions');
      await answerFields([ANSWERS[0].toUpperCase(), ANSWERS[1] + '.']);
      await btn('Check my answers').click();
      await seen('Recovery started', 20000);
      await seen('finishes after a waiting period');
      await seen('simulates the waiting period');
      assert.equal(await signedIn(), false, 'nothing is granted during the waiting period');
      await btn('Check again').click();
      await seen('Not ready yet');
      // A recovery in progress survives closing the app.
      await reload(); // the app reopens on the same screen and the verified recovery is still waiting
      await seen('Recovery started', 20000);
      assert.equal(await signedIn(), false);
      await p.waitForTimeout(6000);
      await btn('Finish recovery').click();
      await seen('Save your Recovery Key', 20000);
      KEY3 = await readKey(p);
      assert.match(KEY3, REQUIRED_KEY);
      assert.notEqual(KEY3, KEY2, 'the key is rotated by recovery');
      assert.equal(await signedIn(), true);
      assert.equal((await sim()).users.length, 1, 'the same account, not a new one');
      await keyScreenConfirm();
      await seen('Protect your account with a PIN');
      await enterPin(p, '615243');
      await enterPin(p, '615243');
      await btn('Protect my account').click();
      await seen('Hello, Sam', 20000); // onboarding is not repeated and the saved profile is back
      assert.ok(!(await ls('dh.acct.recover.v1')), 'the recovery draft is gone');
    },
  );

  await step(
    'recovery: the previous key (rotated by recovery) no longer opens the account, and the new PIN works',
    async () => {
      await reload();
      await unlockIfLocked(p, '615243');
      await forgetThisPhone();
      await toRecoverScreen();
      await p.getByLabel('Recovery Key').fill(KEY2);
      await btn('Continue').click();
      await seen('Answer your two questions');
      await answerAny(ANSWERS);
      await btn('Check my answers').click();
      await seen('We could not verify those details');
      await p.getByLabel('Recovery Key').fill(KEY3);
      await btn('Continue').click();
      await seen('Answer your two questions');
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
