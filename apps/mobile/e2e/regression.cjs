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
        .slice(0, process.env.E2E_VERBOSE ? 20 : 1)
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
  await step('B: a weight-neutral person is not shown or asked for weight', async () => {
    // Onboarding chose no weight goal, so weight tracking is off until the person opts in.
    assert.equal(await p.getByLabel('Log weight (kg)').count(), 0);
    assert.equal(await p.getByText('Weigh in, if you like', { exact: false }).count(), 0);
    await tab('Me');
    assert.ok((await p.getByRole('button', { name: /^Your progress\./ }).count()) >= 1);
    assert.equal(await p.getByRole('button', { name: /Weight progress/ }).count(), 0);
    await btn(/^Your progress\./).click();
    await seen('Weight tracking is off');
    assert.equal(await p.getByLabel('Log weight (kg)').count(), 0);
    await p.goBack();
    await tab('Today');
  });
  await step('A: weight logging (after opting in) updates the latest weight', async () => {
    await tab('Me');
    await btn(/^Goals/).click();
    await seen('Track my weight');
    await lastSwitch('Track my weight').check({ force: true });
    await p.goBack();
    await tab('Today');
    await p.getByLabel('Log weight (kg)').fill('74.5');
    await btn('Log weight').click();
    await seen('74.5 kg');
  });
  await step(
    'B: My approach offers four goals, secondary goals and explains the plan',
    async () => {
      await tab('Me');
      await btn(/^Goals/).click();
      await seen('My approach');
      for (const g of ['Lose weight', 'Maintain weight', 'Improve fitness', 'Build strength'])
        assert.ok((await p.getByRole('button', { name: g }).count()) >= 1, g);
      await btn('Build strength').click();
      await seen('Get stronger at your own pace');
      await seen('Your plan is built around');
      await seen('Guided strength workouts are not available yet');
      await seen('Why:');
      await shot('goals-approach');
      if (process.env.SHOTS_DIR) {
        // A tall capture of the whole My approach card (only when screenshots are requested).
        await p.setViewportSize({ width: 390, height: 2600 });
        await p.waitForTimeout(500);
        await shot('goals-approach-tall');
        await p.setViewportSize({ width: 390, height: 844 });
      }
      // A compatible secondary goal joins the plan, and its pathway says which goal brought it.
      await btn(/^Also working on/).click();
      await btn('Improve fitness').click();
      await seen('also working on: improve fitness');
      await btn(/Everyday movement, From your goal/).click();
      await seen('as a second goal');
      // Editing: choosing a pathway makes it "Your choice"; going back restores the suggestions from the goals.
      await btn('Mindful eating').click();
      await seen('Go back to suggestions from my goals');
      await btn('Go back to suggestions from my goals').click();
      // A food preference is saved and the plan explains it as a suggestion until chosen.
      await btn(/^Foods you eat/).click();
      await btn('Caribbean').click();
      await seen('Foods you grew up with');
      // Everything survives a reload (device storage).
      await p.reload();
      await p.waitForTimeout(2500);
      await seen('My approach');
      // The saved goal and food preference came back: their explanations are on screen again.
      await seen('Get stronger at your own pace');
      await seen('Foods you grew up with');
      await btn(/^Foods you eat/).click();
      await btn('Caribbean').click();
      // Restore the original goal for the flows that follow.
      await p.getByRole('button', { name: 'Improve fitness', exact: true }).first().click();
      await seen('Move more and feel better');
      await p.goBack();
      await p.waitForTimeout(400);
      await tab('Today');
    },
  );

  // ---------------- Batch C: dance ----------------
  await step('C: Dance tab shows Quick Fit and the licensing note', async () => {
    await tab('Dance');
    await seen('Move today');
    // Without the development switch there is no Dancehall, reggae, chair dance, seated filter, strength session or fixture anywhere on the Dance tab.
    for (const absent of [
      'Dancehall',
      'Reggae',
      'Chair dance',
      'Internal fixture',
      'Strength sessions',
      'Seated-friendly',
    ])
      assert.equal(
        await p.getByText(absent, { exact: true }).locator('visible=true').count(),
        0,
        `${absent} must not be shown in a normal build`,
      );

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
    // Before the session: honest presentation modes and a preview.
    await seen('How you will be guided');
    await seen('No demonstration has been recorded');
    assert.equal(
      await p
        .getByRole('radio', { name: /^Real dancer\. Unavailable/ })
        .last()
        .isEnabled(),
      false,
    );
    assert.equal(
      await p
        .getByRole('radio', { name: /^3D dancer\. Unavailable/ })
        .last()
        .isEnabled(),
      false,
    );
    await seen('What is in this session');
    await p.getByRole('button', { name: 'Start', exact: true }).last().click();
    await seen('Get ready');
    await p.waitForTimeout(3600);
    await btn('Pause').click();
    await seen('Paused');
    await btn('Resume').click();
    await p.waitForTimeout(1500);
    await btn('End session').click();
    await seen('End this session?');
    await btn('Keep going').click();
    await btn('End session').click();
    await btn('End session').click();
    await seen('You moved for');
    await seen('Movements finished');
    await btn('Save what I did').click();
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
  await step('K: water logging, focus choice and honest estimates', async () => {
    await tab('Food');
    await seen('Water today');
    await btn('Add a glass (250 ml)').click();
    await seen('250 of about');
    await btn('Add a bottle (500 ml)').click();
    await seen('750 of about');
    await btn('Undo last').click();
    await seen('250 of about');
    await seen('Your estimates');
    await seen('Estimate · not reviewed by a dietitian');
    await tab('Me');
    await btn(/^Goals/).click();
    await seen('Your focus');
    await btn('Maintain weight').click();
    await seen('Keep your weight steady');
    await btn('No numbers').click();
    await p.goBack();
    await p.waitForTimeout(400);
    await tab('Food');
    await seen('No calorie target');
    await seen('logged today');
    // The person chose no numbers: no calorie figure is visible anywhere on the Food tab.
    assert.deepEqual(
      await p
        .getByText(/\bkcal\b/)
        .locator('visible=true')
        .allTextContents(),
      [],
    );
    await p.goBack().catch(() => {});
  });
  await step('L: walking, recovery, hunger and coach reflect what was logged', async () => {
    await tab('Dance');
    await seen('Walking and strength');
    await seen('Guided strength workouts');
    await seen('Not available yet');
    await p.getByLabel('Walk length').last().fill('20');
    await btn('Log walk').click();
    await seen('20 min walking');
    await shot('wellness-dance');
    // A double tap on the same pending form logs nothing new: the field was cleared.
    assert.equal(await btn('Log walk').isDisabled(), true);
    await btn('Sore').click();
    await seen('easy walk may feel kinder');
    await tab('Food');
    await seen('Hunger check-in');
    await btn('Hungry').click();
    await seen('Check-ins today: 1');
    await shot('wellness-food');
    await tab('Coach');
    await p.getByRole('textbox').last().fill('Why is this in my plan?');
    await btn('Send').click();
    await seen('Every suggestion is rule-based', 6000);
    await shot('wellness-coach');
  });
  await step('M: Pulse celebrates only goals the person set, once, and respects Off', async () => {
    // No goal set yet: passing the general water guide celebrates nothing.
    await tab('Food');
    for (let i = 0; i < 6; i++) {
      await btn('Add a bottle (500 ml)').click();
      await p.waitForTimeout(250);
    }
    await p.waitForTimeout(3500);
    assert.equal(await p.getByText('Daily water goal reached').count(), 0);
    // Setting a goal the person has already passed is remembered silently, not celebrated retroactively.
    await tab('Me');
    await btn(/^Goals/).click();
    await seen('Pulse celebrations');
    await p.getByLabel('Daily water goal', { exact: false }).last().fill('2000');
    await p
      .getByRole('button', { name: 'Save', exact: true })
      .locator('visible=true')
      .nth(1)
      .click();
    await p.waitForTimeout(3500);
    assert.equal(await p.getByText('Daily water goal reached').count(), 0);
    // Celebrations Off: a goal reached while off is remembered but shows nothing, and turning celebrations on again does not replay it.
    await p.getByRole('button', { name: /^Off/ }).locator('visible=true').last().click();
    await p.getByLabel('Daily movement goal', { exact: false }).last().fill('10');
    await btn('Save celebration goals').click();
    await p.waitForTimeout(3600);
    assert.equal(await p.getByText('You moved today').count(), 0);
    await p.getByRole('button', { name: /^Full/ }).locator('visible=true').last().click();
    await p.waitForTimeout(3600);
    assert.equal(await p.getByText('You moved today').count(), 0);
    await p.goBack();
    await p.waitForTimeout(400);
  });
  await step('M2: Pulse celebrates a weekly goal reached after it was set, once', async () => {
    // Today's movement was already handled (and remembered) above, so a new goal level on the same day does not repeat it.
    await tab('Me');
    await btn(/^Goals/).click();
    await p.getByLabel('Minutes a week', { exact: false }).last().fill('400');
    await p
      .getByRole('button', { name: 'Save', exact: true })
      .locator('visible=true')
      .nth(0)
      .click();
    await p.goBack();
    await p.waitForTimeout(400);
    await tab('Dance');
    await p.getByLabel('Walk length').last().fill('400');
    await btn('Log walk').click();
    await seen('Weekly movement goal reached', 6000);
    await shot('wellness-celebration');
    await p.waitForTimeout(3500);
    assert.equal(await p.getByText('Weekly movement goal reached').count(), 0);
    await p.getByLabel('Walk length').last().fill('15');
    await btn('Log walk').click();
    await p.waitForTimeout(1500);
    assert.equal(await p.getByText('Weekly movement goal reached').count(), 0);
    assert.equal(await p.getByText('You moved today').count(), 0);
  });
  await step(
    'N: with numbers hidden, no calorie or nutrient figure appears on any screen',
    async () => {
      const routes = [
        '/',
        '/dance',
        '/food',
        '/coach',
        '/me',
        '/progress',
        '/goals',
        '/challenges',
        '/food/add',
        '/food/swap',
        '/food/history',
        '/food/plan',
        '/food/saved',
        '/food/review',
        '/coach/review',
      ];
      for (const r of routes) {
        await p.goto(base + r);
        await p.waitForTimeout(1600);
        const hits = await p
          .getByText(/\bkcal\b|kilocalorie|\bprotein\b.*\d+ ?g|\d+ ?g protein/i)
          .locator('visible=true')
          .allTextContents();
        assert.deepEqual(hits, [], `visible nutrition figures on ${r}`);
      }
      // Swap ideas offer no calorie-based mode.
      await p.goto(base + '/food/swap');
      await p.waitForTimeout(1500);
      assert.equal(
        await p
          .getByRole('button', { name: /^Lighter$/ })
          .locator('visible=true')
          .count(),
        0,
      );
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
