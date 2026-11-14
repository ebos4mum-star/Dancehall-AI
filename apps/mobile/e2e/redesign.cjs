/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script (CommonJS so Playwright resolves from a global install) */
/* Captures the redesigned flows from the web export in MOCK mode (synthetic data).
 * Usage: pnpm export:web && GROUP=dance SHOTS_DIR=../../docs/preview/redesign-light node e2e/redesign.cjs   (E2E_SCHEME=dark, E2E_REDUCED=1 optional) */
const { chromium } = require('playwright');
const out = process.env.SHOTS_DIR || 'shots';
const group = process.env.GROUP || 'dance';
require('node:fs').mkdirSync(out, { recursive: true });

(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8093);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: process.env.E2E_SCHEME || 'light',
    reducedMotion: process.env.E2E_REDUCED ? 'reduce' : 'no-preference',
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const btn = (n, o = {}) => p.getByRole('button', { name: n, ...o }).last();
  const text = (t) => p.getByText(t, { exact: false }).last();
  let i = 0;
  const shot = async (name) => {
    await p.waitForTimeout(700);
    i += 1;
    await p.screenshot({ path: `${out}/${group}-${String(i).padStart(2, '0')}-${name}.png` });
  };
  const tab = async (n) => {
    await p.getByRole('tab', { name: n, exact: true }).click();
    await p.waitForTimeout(800);
  };
  const go = async (path) => {
    await p.evaluate((x) => {
      window.history.pushState({}, '', x);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await p.waitForTimeout(900);
  };
  const scrollTo = async (y) => {
    await p.mouse.move(200, 400);
    await p.mouse.wheel(0, y);
    await p.waitForTimeout(500);
  };
  // onboarding
  await p.goto('http://127.0.0.1:8093');
  await p.waitForTimeout(2500);
  await text('Continue with development sign-in').click();
  await p.getByLabel('What should we call you?').fill('Sam');
  await p.getByLabel('Date of birth (YYYY-MM-DD)').fill('1990-05-05');
  await p.getByLabel('Country or region').fill('Jam');
  await text('Jamaica').click();
  await btn('Continue').click();
  await p
    .getByRole('switch', { name: 'Store my health information' })
    .last()
    .check({ force: true });
  await p.getByRole('switch', { name: 'Analyze my meal photos' }).last().check({ force: true });
  await btn('Continue').click();
  await p.getByLabel('Height (cm)').fill('170');
  await p.getByLabel('Current weight (kg)').fill('75');
  await btn('Continue').click();
  for (const n of await p.getByRole('radio', { name: /^No$/ }).all()) await n.click();
  await btn('Continue').click();
  await btn('Finish setup').click();
  await text('Hello, Sam').waitFor();
  await p.waitForTimeout(3000);

  if (group === 'dance') {
    await tab('Dance');
    await shot('tab-top');
    await p.getByRole('button', { name: 'Tired' }).last().click();
    await p.waitForTimeout(600);
    await scrollTo(520);
    await shot('mood-picks');
    await scrollTo(700);
    await shot('styles-filters');
    await btn(/^Filters/).click();
    await shot('filters-open');
    await scrollTo(800);
    await shot('workout-list');
    await scrollTo(1600);
    await shot('programs');
    await tab('Dance');
    await text('Amapiano Groove 10').click();
    await shot('detail-top');
    await scrollTo(700);
    await shot('detail-timeline');
    await scrollTo(1400);
    await shot('detail-blocks');
    await scrollTo(-3000);
    await btn('Start guided session').click();
    await shot('session-ready');
    await btn('Start', { exact: true }).click();
    await p.waitForTimeout(2200);
    await shot('session-running');
    await btn('End session').click();
    await shot('complete');
    await btn('Hard')
      .click()
      .catch(() => {});
    await btn('Save to my activity').click();
    await shot('complete-saved');
    await btn('Continue').click();
    await p.waitForTimeout(800);
    await go('/dance/history');
    await shot('history');
    await go('/dance/schedule');
    await shot('schedule-empty');
    await go('/dance/program?id=sample-4wk-starter');
    await shot('program');
    await btn('Start this program')
      .click()
      .catch(() => {});
    await p.waitForTimeout(600);
    await shot('program-started');
    await go('/dance/schedule');
    await shot('schedule');
  }
  console.log(group, 'page errors:', errors.length, errors.slice(0, 5));
  await browser.close();
  srv.close();
})();
