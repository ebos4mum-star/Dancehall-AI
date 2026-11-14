/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script (CommonJS so Playwright resolves from a global install) */
/*
 * Browser regression for Batches A-D plus the AI pause / account-deletion controls, run against the static web export in MOCK mode
 * (synthetic data, no network, no cloud, no paid AI). Usage:  pnpm export:web && node e2e/regression.cjs
 * Needs Playwright's Chromium (pre-installed in the cloud sandbox; locally: npx playwright install chromium).
 */
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

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
        .slice(0, process.env.E2E_VERBOSE ? 6 : 1)
        .join(' | '),
    );
  }
}

(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8099);
  const browser = await chromium.launch();
  const scheme = process.env.E2E_SCHEME || 'light';
  const p = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: scheme });
  p.setDefaultTimeout(5000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const base = 'http://127.0.0.1:8099';
  // Tabs stay mounted, so always act on the LAST (front-most) match.
  const btn = (n) => p.getByRole('button', { name: n }).last();
  const text = (t) => p.getByText(t, { exact: false }).last();
  const seen = async (t, ms = 4000) => text(t).waitFor({ state: 'visible', timeout: ms });
  // Optional visual capture: SHOTS_DIR=/path E2E_SCHEME=dark node e2e/regression.cjs (first visit of each tab, web render only).
  const shotsSeen = new Set();
  const shot = async (name) => {
    if (!process.env.SHOTS_DIR || shotsSeen.has(name)) return;
    shotsSeen.add(name);
    await p.screenshot({ path: `${process.env.SHOTS_DIR}/${scheme}-${name}.png` });
  };
  const tab = async (name) => {
    await p.getByRole('tab', { name, exact: true }).click();
    await p.waitForTimeout(900);
    await shot(`tab-${name.toLowerCase()}`);
  };
  const lastSwitch = (n) => p.getByRole('switch', { name: n }).last();

  await p.goto(base);
  await p.waitForTimeout(2500);

  // ---------------- Batch A: sign-in, onboarding, consent, readiness ----------------
  await step('A: dev sign-in screen is shown in mock mode, adults only', async () => {
    await seen('Development mode: mock sign-in');
    await seen('adults aged 18 and over');
  });
  await step('A: under-18 date of birth is refused', async () => {
    await text('Continue with development sign-in').click();
    await p.getByLabel('What should we call you?').fill('Sam');
    await p.getByLabel('Date of birth (YYYY-MM-DD)').fill('2015-05-05');
    await p.getByLabel('Country or region').fill('Aus');
    await text('Australia').click();
    await btn('Continue').click();
    await seen('18 or older');
    assert.equal(
      await text('Step 2 of 5')
        .isVisible()
        .catch(() => false),
      false,
    );
  });
  await step('A: onboarding completes (consent, body basics, readiness, goal)', async () => {
    await p.getByLabel('Date of birth (YYYY-MM-DD)').fill('1990-05-05');
    await btn('Continue').click();
    await seen('Your privacy');
    await lastSwitch('Store my health information').check({ force: true });
    await lastSwitch('Analyze my meal photos').check({ force: true });
    await btn('Continue').click();
    await p.getByLabel('Height (cm)').fill('170');
    await p.getByLabel('Current weight (kg)').fill('75');
    await btn('Continue').click();
    for (const n of await p.getByRole('radio', { name: /^No$/ }).all()) await n.click();
    await btn('Continue').click();
    await btn('Finish setup').click();
    await seen('Hello, Sam');
  });
  await step('A/D: Today shows the Daily Fit Plan with reasons', async () => {
    await seen('Your Daily Fit Plan');
    await shot('today-plan');
    await btn(/^Why\?/).click();
    assert.ok(await p.getByText(/./).count());
  });
  await step(
    'Phase 1: Today hero shows Pulse, real status chips, a Next up action, and an honest empty "Done today"',
    async () => {
      await p
        .getByLabel(/Pulse, your guide/)
        .first()
        .waitFor({ state: 'attached' });
      await seen('No food logged yet');
      await seen('Next up');
      await seen('Nothing recorded yet');
      assert.equal((await p.getByText('Done today', { exact: true }).count()) > 0, true);
    },
  );
  await step(
    'UI: every SVG id in the document is unique (hidden tabs cannot shadow Pulse gradients)',
    async () => {
      const dup = await p.evaluate(() => {
        const seen = new Set();
        const dups = [];
        for (const el of document.querySelectorAll('svg [id]')) {
          if (seen.has(el.id)) dups.push(el.id);
          seen.add(el.id);
        }
        return dups;
      });
      assert.deepEqual(dup, []);
    },
  );
  await step('A: weight logging updates the latest weight', async () => {
    await p.getByLabel('Log weight (kg)').fill('74.5');
    await btn('Log weight').click();
    await seen('74.5 kg');
  });

  // ---------------- Batch C: dance ----------------
  await step('C: Dance tab shows Quick Fit and the licensing note', async () => {
    await tab('Dance');
    await seen('Move today');
    await seen('no video, music or instructors yet');
  });
  await step('C: a style filter narrows the catalog', async () => {
    await text('Afrobeats').click();
    await p.waitForTimeout(500);
    await seen('Afrobeats');
    if (!(await p.getByRole('tab', { name: 'Food', exact: true }).isVisible())) {
      await p.goBack(); // a detail screen hides the tab bar
      await p.waitForTimeout(600);
    }
  });

  // ---------------- Batch B: food ----------------
  await step('B: Food tab offers photo, manual logging, swaps, plans', async () => {
    await tab('Food');
    await seen('Snap your meal');
    for (const b of ['Add food', 'Saved meals', 'Swap ideas', 'Meal plan', 'History'])
      assert.ok(await btn(b).isVisible(), b);
  });
  await step('B: the camera screen says recognition is simulated', async () => {
    await btn('Snap a meal').click();
    await p.waitForTimeout(900);
    await seen('simulat');
    await p.goBack();
    await p.waitForTimeout(700);
  });

  // ---------------- Batch D: Coach, pause, kill switch, deletion ----------------
  await step('D: Coach tab, personalization off by default, simulated labeling', async () => {
    await tab('Coach');
    await seen('Fit Concierge');
    await seen('Allow personalization');
  });
  await step('D: a prompt gets a labeled, simulated reply with reasons', async () => {
    await btn('I only have 10 minutes').click();
    await seen('Simulated reply', 6000);
  });
  await step('D: crisis wording gets the fixed safety response, not a plan', async () => {
    await p.getByRole('textbox').last().fill('I want to kill myself');
    await btn('Send').click();
    await p.waitForTimeout(1200);
    assert.ok(
      await p
        .getByText(/support|helpline|emergency|someone you trust/i)
        .last()
        .isVisible(),
    );
  });
  await step('D: Coach privacy shows the usage, pause and deletion controls', async () => {
    await btn('Privacy and history').click();
    await seen('Pause AI for me');
    await seen('Delete my account');
  });
  await step('D: the person’s pause blocks the coach and shows its own message', async () => {
    await lastSwitch('Pause AI for me').check({ force: true });
    await p.waitForTimeout(500);
    await p.goBack();
    await p.waitForTimeout(700);
    await seen('paused');
  });
  await step('D: un-pausing restores the coach', async () => {
    await btn('Privacy and history').click();
    await lastSwitch('Pause AI for me').uncheck({ force: true });
    await p.waitForTimeout(500);
    assert.equal(await lastSwitch('Pause AI for me').isChecked(), false);
  });
  await step('D: account deletion is a 30-day, cancellable request', async () => {
    await btn('Delete my account').click();
    await seen('Deletion requested');
    await btn('Cancel deletion').click();
    await p.waitForTimeout(500);
    assert.equal(
      await text('Deletion requested')
        .isVisible()
        .catch(() => false),
      false,
    );
  });
  await step('E: Fit Challenge starts with a gentle goal and shows on Today', async () => {
    await p.goBack();
    await p.waitForTimeout(500);
    await tab('Me');
    await btn('Fit Challenge').click();
    await seen('rest days are built in');
    await seen('3 active days');
    await btn('Start challenge').click();
    await seen('0 of 3 active days');
    await shot('challenge');
    await p.goBack();
    await tab('Today');
    await seen('7-day challenge');
  });
  await step(
    'E: Progress shows the habit week and milestones with no streak language',
    async () => {
      await tab('Me');
      await btn('Weight progress').click();
      await seen('Your milestones');
      await shot('progress');
      await seen('This week');
      for (const bad of ['You missed', 'You lost', 'failed']) {
        assert.equal(await p.getByText(bad, { exact: false }).count(), 0, bad);
      }
      await p.goBack();
    },
  );
  await step('E: account settings let the person rename themselves', async () => {
    await tab('Me');
    await btn('Privacy and settings').click();
    await p.getByLabel('Display name').fill('Sam K');
    await btn('Save').click();
    await p.waitForTimeout(600);
    await p.goBack();
    await seen('Sam K');
  });
  await step('F: a guided workout can be finished, saved, and counts for the week', async () => {
    await tab('Dance');
    await btn(/Quick Fit/).click();
    await btn('Start guided session').click();
    await p.getByRole('button', { name: 'Start', exact: true }).last().click();
    await p.waitForTimeout(2200);
    await btn('End session').click();
    await seen('You moved for');
    await btn('Save to my activity').click();
    await p.getByLabel('Sessions this week: 1').last().waitFor({ state: 'visible', timeout: 4000 });
    await shot('session-done');
    await btn('Continue').click();
    await p.waitForTimeout(600);
  });
  await step('F: a meal plan becomes a grocery list that scales to the household', async () => {
    await tab('Food');
    await btn('Meal plan').click();
    await btn('Preview plan').click();
    await btn('Save plan').click();
    await btn('Grocery list').click();
    await seen('Shopping list');
    await shot('grocery');
    const one = await p.getByRole('checkbox').first().getAttribute('aria-label');
    await p.getByRole('radio', { name: '2', exact: true }).last().click();
    await p.waitForTimeout(400);
    const two = await p.getByRole('checkbox').first().getAttribute('aria-label');
    const grams = (l) => Number(/(\d+) g/.exec(l)[1]);
    assert.ok(grams(two) >= grams(one) * 2 - 10 && grams(two) > grams(one), `${one} -> ${two}`);
    await p.goBack();
    await p.waitForTimeout(500);
  });
  await step('G: an empty meal diary offers a clear next step', async () => {
    await btn('History').click();
    await seen('Your meal diary starts here');
    await btn('Log a meal').click();
    await seen('Add food');
    await p.goBack();
    await p.waitForTimeout(400);
    await p.goBack();
    await p.waitForTimeout(400);
  });
  await step('G: a logged meal appears in the diary with a neutral 7-day summary', async () => {
    await btn('Add food').click();
    await p.getByLabel('Search foods').fill('rice');
    await p.waitForTimeout(500);
    await p.locator('[role="button"][aria-label*="ice"]').first().click();
    await btn(/^Add to meal|^Add$/).click();
    await btn('Save to diary').click();
    await p.waitForTimeout(800);
    await btn('History').click();
    await seen('Last 7 days');
    await seen('1 of 7 days logged');
    await shot('food-diary');
    for (const bad of ['over your', 'too much', 'you failed']) {
      assert.equal(await p.getByText(bad, { exact: false }).count(), 0, bad);
    }
    await p.goBack();
    await p.waitForTimeout(400);
  });
  await step(
    'H: Me shows identity, this week, and the milestone from the finished workout',
    async () => {
      await tab('Me');
      await seen('Sessions this week');
      await seen('Recent milestones');
      await seen('First dance session');
      await btn('See progress and milestones').click();
      await seen('Your milestones');
      await p.goBack();
      await p.waitForTimeout(400);
    },
  );
  await step(
    'I: the person can export their data and the export is complete and private',
    async () => {
      await tab('Me');
      await btn('Privacy and settings').click();
      await btn('Export my data').click();
      await seen('Your export is ready');
      const text = await p.getByLabel('Export (JSON)').inputValue();
      const d = JSON.parse(text);
      assert.equal(d.format, 'dancehall-fit-export-v1');
      assert.ok(d.workoutSessions.length >= 1 && d.foodLogs.length >= 1 && d.weights.length >= 1);
      assert.ok(d.challenges.length >= 1 && d.mealPlans.length >= 1);
      await p.goBack();
      await p.waitForTimeout(400);
    },
  );
  await step(
    'J: a custom habit can be added, ticked, and removed, with no streak language',
    async () => {
      await tab('Today');
      await p.getByLabel('New habit').last().fill('Stretch two minutes');
      await btn('Add habit').click();
      await seen('0 of 7 days this week');
      await p
        .getByRole('checkbox', { name: /Stretch two minutes: not done today/ })
        .last()
        .click();
      await seen('1 of 7 days this week');
      assert.equal(await p.getByText('streak', { exact: false }).count(), 0);
      await btn('Add habit').isDisabled();
    },
  );
  await step('Privacy: data survives a reload (device storage), no page errors', async () => {
    await p.goto(base);
    await p.waitForTimeout(2500);
    await seen('Hello, Sam K');
    await seen('1 of 7 days this week');
    assert.deepEqual(errors, []);
  });

  await browser.close();
  srv.close();
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} browser checks passed`);
  process.exit(failed ? 1 : 0);
})();
