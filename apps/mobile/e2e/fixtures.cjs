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
    await p.getByRole('tab', { name, exact: true }).click();
    await p.waitForTimeout(700);
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
      await tab('Dance');
      await seen('Move today');
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
