/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script (CommonJS so Playwright resolves from a global install) */
/*
 * Browser checks for the Dancehall, reggae, chair dance, seated and strength pipelines, run against a DEVELOPMENT build with the internal test fixtures switched on
 * (placeholder content, never real workouts). Usage:  pnpm export:web:fixtures && node e2e/fixtures.cjs
 * The normal regression build (e2e/regression.cjs) separately asserts that none of this exists without the switch.
 */
process.env.E2E_DIST = 'dist-fixtures';
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
  const srv = await serve(8098);
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.setDefaultTimeout(6000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const base = 'http://127.0.0.1:8098';
  const btn = (n) => p.getByRole('button', { name: n }).last();
  const exact = (n) => p.getByRole('button', { name: n, exact: true }).last();
  const ALL = 'All styles';
  const tap = (loc) => loc.click();
  const text = (t) => p.getByText(t, { exact: false }).last();
  const seen = async (t, ms = 5000) => text(t).waitFor({ state: 'visible', timeout: ms });
  const gone = async (t) =>
    assert.equal(await p.getByText(t, { exact: false }).count(), 0, `${t} should not be shown`);
  const tab = async (name) => {
    // A detail screen hides the tab bar: go back until it is there.
    for (let i = 0; i < 4; i++) {
      try {
        await p
          .getByRole('tab', { name, exact: true })
          .waitFor({ state: 'visible', timeout: i === 0 ? 6000 : 1500 });
        break;
      } catch {
        await p.goBack();
      }
    }
    // A tap right after a screen transition can be lost, so check the tab is selected and tap again if not.
    for (let i = 0; i < 4; i++) {
      await p.waitForTimeout(500);
      await p.getByRole('tab', { name, exact: true }).click();
      await p.waitForTimeout(700);
      if (
        (await p.getByRole('tab', { name, exact: true }).getAttribute('aria-selected')) === 'true'
      )
        break;
    }
  };
  const lastSwitch = (n) => p.getByRole('switch', { name: n }).last();
  const shots = process.env.SHOTS_DIR;
  const shot = async (n) => shots && (await p.screenshot({ path: `${shots}/fixtures-${n}.png` }));

  await p.goto(base);
  await p.waitForTimeout(2500);
  await step('setup: onboarding completes in the fixtures build', async () => {
    await seen('Development mode: mock sign-in');
    await text('Continue with development sign-in').click();
    await p.getByLabel('What should we call you?').fill('Sam');
    await p.getByLabel('Date of birth (YYYY-MM-DD)').fill('1990-05-05');
    await p.getByLabel('Country or region').fill('Aus');
    await text('Australia').click();
    await btn('Continue').click();
    await seen('Your privacy');
    await lastSwitch('Store my health information').check({ force: true });
    await btn('Continue').click();
    await p.getByLabel('Height (cm)').fill('170');
    await p.getByLabel('Current weight (kg)').fill('75');
    await btn('Continue').click();
    for (const n of await p.getByRole('radio', { name: /^No$/ }).all()) await n.click();
    await btn('Continue').click();
    await btn('Finish setup').click();
    await seen('Hello, Sam');
  });

  await step(
    'styles: Dancehall, reggae and chair dance are offered, and every fixture is labelled',
    async () => {
      // The Dance route is a separate chunk and the preview build lists many sessions, so its first render can be slow in a small sandbox: retry the tap once.
      for (let attempt = 0; attempt < 3; attempt++) {
        await tab('Dance');
        try {
          await seen('Move today', 12000);
          break;
        } catch (e) {
          if (attempt === 2) throw e;
          await tab('Today');
        }
      }
      for (const s of ['Dancehall', 'Reggae', 'Chair dance'])
        assert.ok((await p.getByRole('button', { name: s, exact: true }).count()) >= 1, s);
      await exact('Chair dance').click();
      await seen('Internal fixture');
      await shot('chair-list');
      // Every card in the filtered list says it is a fixture.
      const cards = await p
        .getByRole('button', { name: /Chair dance pipeline test|Chair dance short test/ })
        .all();
      assert.ok(cards.length >= 2);
      for (const c of cards)
        assert.match((await c.getAttribute('aria-label')) ?? '', /Internal fixture/);
      await exact(ALL).click();
    },
  );

  await step(
    'chair dance: detail and session say it is a fixture and can be done seated',
    async () => {
      await exact('Chair dance').click();
      await btn(/Chair dance pipeline test/).click();
      await seen('Internal test fixture');
      await seen('Can be done seated');
      // Chair dance is seated throughout: there is nothing to switch.
      assert.equal(await p.getByRole('switch', { name: 'Seated version' }).count(), 0);
      await btn('Start guided session').click();
      await seen('Internal test fixture');
      await exact('Start').click();
      await btn('Skip countdown').click();
      await seen('Placeholder text for a pipeline test');
      await p.goBack();
      await p.goBack();
    },
  );

  await step(
    'seated attribute: another session can be marked suitable and switched to its seated version',
    async () => {
      await tab('Dance');
      await exact(ALL).click();
      await btn(/Seated-suitable attribute test/).click();
      await seen('Can be done seated');
      await lastSwitch('Seated version').check({ force: true });
      await btn('Start guided session').click();
      await exact('Start').click();
      await btn('Skip countdown').click();
      await seen('(seated version)');
      // Switching seated off mid-session changes the instructions in place.
      await tap(exact('Pause'));
      await tap(btn(/^Seated version/));
      await tap(btn('Turn off'));
      await p.waitForTimeout(300);
      assert.equal(
        await p.getByText('(seated version)', { exact: false }).locator('visible=true').count(),
        0,
      );
      await p.goBack();
      await p.goBack();
    },
  );

  await step('seated filter: only seated-friendly sessions are shown when asked', async () => {
    await tab('Dance');
    await btn('Filters').click();
    await seen('Show only sessions you can do seated');
    await p.getByRole('radio', { name: 'Seated-friendly' }).last().click();
    await seen('Chair dance pipeline test');
    await seen('Seated-suitable attribute test');
    await gone('Afrobeats Wake-Up');
    await shot('seated-filter');
    await p.getByRole('radio', { name: 'Any' }).last().click();
  });

  await step(
    'strength: sessions appear only because fixtures are on, through the same screens',
    async () => {
      await tab('Dance');
      await seen('Strength sessions');
      await seen('Each set has an easier version');
      await btn(/Strength pipeline test/).click();
      await seen('Internal test fixture');
      await seen('Exercise A');
      await seen('3 × 8 reps');
      await seen('Easier version');
      // Strength is not a catalogue workout, so it cannot be scheduled.
      assert.equal(
        await p
          .getByRole('button', { name: 'Schedule', exact: true })
          .locator('visible=true')
          .count(),
        0,
      );
      await shot('strength-detail');
    },
  );

  await step(
    'strength session: counted sets wait for Done, then rest, and the session is saved as strength',
    async () => {
      await btn('Start guided session').click();
      await seen('Internal test fixture');
      await exact('Start').click();
      await btn('Skip countdown').click();
      await seen('Fixture warm-up');
      await tap(btn('Skip')); // finish the warm-up
      await seen('Set 1 of 3');
      await seen('8 reps');
      await p.waitForTimeout(2500); // time passing never ends a counted set
      await seen('Set 1 of 3');
      await shot('strength-set');
      await tap(btn('Done with this set'));
      await seen('Rest');
      await tap(btn('Skip'));
      await seen('Set 2 of 3');
      // The easier version switches in place.
      await tap(btn(/^Easier version/));
      await tap(btn('Turn on').last());
      await seen('Easier version:');
      await btn('End session').click();
      await btn('End session').last().click();
      await seen('Save what I did');
      await btn('Save what I did').click();
      await seen('Strength session saved to today.');
    },
  );

  await step('strength is recorded as strength activity (counts for the day)', async () => {
    await btn('Continue').click();
    await tab('Dance');
    await seen('min strength');
  });

  await step(
    'cuisines: the priority cuisines are in My approach and the meal planner',
    async () => {
      await tab('Me');
      await btn(/^Goals/).click();
      await btn(/^Foods you eat/).click();
      for (const c of ['Jamaican', 'Caribbean', 'West African', 'East African', 'Southern African'])
        assert.ok((await p.getByRole('button', { name: c, exact: true }).count()) >= 1, c);
      await btn('Jamaican').click();
      await seen('Foods you grew up with');
      await p.goBack();
      await tab('Food');
      await btn('Meal plan').click();
      await seen('Jamaican');
      await seen('East African');
      await seen('Southern African');
      await p.goBack(); // a detail screen hides the tab bar
      await p.waitForTimeout(500);
    },
  );

  await step(
    'drafts: an original Dancehall session is labelled as an unreviewed draft and plays in the player',
    async () => {
      await tab('Dance');
      await exact(ALL).click();
      await exact('Dancehall').click();
      await btn(/Dancehall Foundations/).click();
      await seen('Draft, not reviewed');
      // The review requirements: what is still outstanding, and who has to do it.
      await btn(/^What this still needs/).click();
      for (const r of [
        'Exercise safety review',
        'Choreography authenticity and rights',
        'Cultural review',
        'Media rights',
        'None of these has been done',
      ])
        await seen(r);
      await btn('Start guided session').click();
      await seen('Draft, not reviewed');
      await exact('Start').click();
      await btn('Skip countdown').click();
      await seen('Weight shifts and shoulder rolls');
      await shot('draft-dancehall-session');
      await p.goBack();
      await p.goBack();
    },
  );

  await step(
    'drafts: a beginner strength draft counts sets in reps and says it is not reviewed',
    async () => {
      await tab('Dance');
      await btn(/Beginner Strength: Full Body/).click();
      await seen('Draft, not reviewed');
      await seen('Chair sit-to-stand');
      await seen('2 × 8 reps');
      await btn('Start guided session').click();
      await exact('Start').click();
      await btn('Skip countdown').click();
      await tap(btn('Skip')); // finish the warm-up
      await seen('Set 1 of 2');
      await seen('Chair sit-to-stand');
      await shot('draft-strength-set');
      await p.goBack();
      await p.goBack();
    },
  );

  await step(
    'foods: a sourced Caribbean food is found, labelled as awaiting review, and names its source',
    async () => {
      await tab('Food');
      await btn('Add food').click();
      await p.getByLabel('Search foods').fill('callaloo');
      await p.waitForTimeout(500);
      await seen('Source data, awaiting dietitian review');
      await p.locator('[role="button"][aria-label*="Amaranth"]').first().click();
      await seen('FDC 169202');
      await shot('staged-food');
      await p.goBack();
    },
  );

  await step(
    'home: Use what you have is on the Dance tab, matches the items, and asks for an equipment check before starting',
    async () => {
      await tab('Dance');
      await seen('Use what you have');
      await exact('Sturdy chair').click();
      await exact('Wall').click();
      await seen('exercises, about');
      await shot('home-card');
      await btn('See this session').click();
      await seen('Draft, not reviewed');
      await seen('Check your equipment');
      await seen('Sturdy chair, Wall');
      await seen('Chair sit-to-stand');
      await seen('There is no video demonstration for this movement yet');
      // Starting needs the equipment check first.
      assert.equal(await btn('Start guided session').isDisabled(), true);
      await seen('Confirm your equipment check to start.');
      await lastSwitch('I have checked my equipment').check({ force: true });
      assert.equal(await btn('Start guided session').isDisabled(), false);
      await shot('home-detail');
    },
  );

  await step(
    'home: a safer swap replaces an exercise with one that is never harder and needs nothing else',
    async () => {
      await btn(/^Swap for a safer option: Seated knee extension/).click();
      await seen('Seated knee extension');
      assert.equal(await p.getByText('Chair sit-to-stand', { exact: true }).count(), 0);
    },
  );

  await step(
    'home: the session runs in the existing player with counted sets and written instructions',
    async () => {
      await btn('Start guided session').click();
      await exact('Start').click();
      await btn('Skip countdown').click();
      await tap(btn('Skip')); // finish the warm-up
      await seen('Set 1 of 2');
      await seen('How to do it');
      await seen('There is no video demonstration for this movement yet');
      await shot('home-session');
      await tap(btn('Done with this set'));
      await p.goBack();
      await p.goBack();
    },
  );

  await step(
    'home: a seated session uses only seated exercises, and changing items works at any time',
    async () => {
      await tab('Dance');
      await exact('Water bottles').click();
      await exact('Towel').click();
      await lastSwitch('Seated session').check({ force: true });
      await seen('exercises, about');
      assert.equal(
        await p
          .getByText(/Wall push-up/)
          .locator('visible=true')
          .count(),
        0,
      );
      await seen('Seated knee extension', 3000).catch(() => undefined);
      await exact('No equipment').click();
      await lastSwitch('Seated session').uncheck({ force: true });
      await seen('exercises, about');
      await shot('home-none');
    },
  );

  await step(
    'demos: a draft clip is labelled, plays, pauses, replays, changes speed and shows captions (placeholder surface)',
    async () => {
      await tab('Dance');
      await exact(ALL).click();
      await exact('Chair dance').click();
      await btn(/Chair Dance Groove/).click();
      await btn(/^Main/).click(); // the blocks of the main section, one of which has a draft placeholder clip
      await seen('Draft media, not approved for release');
      await seen('Placeholder clip. This is not a demonstration.');
      await p.goBack();
      // The Use what you have session with a placeholder clip on the wall push-up.
      await tab('Dance');
      await exact('Sturdy chair').click();
      await exact('Wall').click();
      await btn('See this session').click();
      await seen('Draft media, not approved for release');
      await seen('Placeholder clip. This is not a demonstration.');
      await seen('Placeholder caption, first half');
      const play = () => p.getByRole('button', { name: 'Play demonstration' }).first();
      const pause = () => p.getByRole('button', { name: 'Pause demonstration' }).first();
      await play().click();
      await p.waitForTimeout(700);
      await pause().waitFor({ state: 'visible' });
      await pause().click();
      await play().waitFor({ state: 'visible' });
      const speed = (r) => p.getByRole('radio', { name: `Speed ${r}`, exact: true }).first();
      await speed('0.5×').click();
      assert.equal(await speed('0.5×').getAttribute('aria-checked'), 'true');
      await play().click();
      await p.waitForTimeout(7500); // a 12 s clip at half speed is not over yet
      assert.equal(await p.getByText('Finished. Press Replay to watch again.').count(), 0);
      await speed('1×').click();
      await p.waitForTimeout(6500);
      await seen('Finished. Press Replay to watch again.');
      await p.getByRole('button', { name: 'Replay', exact: true }).first().click();
      await pause().waitFor({ state: 'visible' });
      await shot('demo-player');
      // Captions can be turned off and on again.
      const captions = p.getByRole('switch', { name: 'Captions' }).first();
      await captions.uncheck({ force: true });
      assert.equal(
        await p
          .getByText(/Placeholder caption, /)
          .locator('visible=true')
          .count(),
        0,
      );
      await captions.check({ force: true });
      await seen('Placeholder caption');
    },
  );

  await step(
    'demos: a real video file plays through the same player, and media that cannot load falls back to the written steps',
    async () => {
      await tab('Dance');
      await exact('No equipment').click();
      await btn('See this session').click();
      // home-dead-bug uses a real WebM served by the test server; home-glute-bridge points at a file that cannot load.
      await seen('The demonstration could not be loaded. Follow the written steps.', 8000);
      assert.ok((await p.locator('video').count()) >= 1, 'a real video element is present');
      await p.getByRole('button', { name: 'Play demonstration' }).first().click();
      await p.waitForTimeout(1500);
      const t0 = await p.evaluate(() => document.querySelector('video')?.currentTime ?? -1);
      assert.ok(t0 > 0, `the real video advanced (${t0})`);
      await p.getByRole('button', { name: 'Pause demonstration' }).first().click();
      await p.waitForTimeout(400);
      const t1 = await p.evaluate(() => document.querySelector('video')?.currentTime ?? -1);
      await p.waitForTimeout(600);
      const t2 = await p.evaluate(() => document.querySelector('video')?.currentTime ?? -1);
      assert.equal(t1, t2, 'pausing stops the real video');
      await p.getByRole('radio', { name: 'Speed 0.5×', exact: true }).first().click();
      const rate = await p.evaluate(() => document.querySelector('video')?.playbackRate ?? -1);
      assert.equal(rate, 0.5, 'the speed reaches the real video');
      await shot('demo-fallback');
    },
  );

  await step(
    'demos: with reduced motion nothing plays by itself, and the session shows the demonstration beside the written steps',
    async () => {
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.reload();
      await p.waitForTimeout(2500);
      await tab('Dance');
      await btn('See this session').click();
      await seen('Reduced motion is on');
      assert.equal(await p.getByRole('button', { name: 'Pause demonstration' }).count(), 0);
      await seen('Play demonstration');
      await p.emulateMedia({ reducedMotion: 'no-preference' });
    },
  );

  console.log(
    `\n${results.filter((r) => r[0] === 'PASS').length}/${results.length} fixture checks passed`,
  );
  const real = errors.filter((e) => !/ResizeObserver|favicon/i.test(e));
  if (real.length) console.log('page errors:', real.slice(0, 3));
  await browser.close();
  srv.close();
  process.exit(results.every((r) => r[0] === 'PASS') ? 0 : 1);
})();
