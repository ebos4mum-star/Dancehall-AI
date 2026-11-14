/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script (CommonJS so Playwright resolves from a global install) */
/* Visual walkthrough: captures real screenshots of the web export in MOCK mode (synthetic data).
 * Usage: pnpm export:web && SHOTS_DIR=../../docs/preview node e2e/walkthrough.cjs */
const { chromium } = require('playwright');
const out = process.env.SHOTS_DIR || 'shots';
require('node:fs').mkdirSync(out, { recursive: true });
(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8098);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: process.env.E2E_SCHEME || 'light',
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const btn = (n) => p.getByRole('button', { name: n }).last();
  const text = (t) => p.getByText(t, { exact: false }).last();
  let i = 0;
  const shot = async (name) => {
    await p.waitForTimeout(700);
    i += 1;
    await p.screenshot({
      path: `${out}/${String(i).padStart(2, '0')}-${name}.png`,
      fullPage: false,
    });
    console.log('shot', name);
  };
  const go = async (path, name) => {
    await p.evaluate((x) => {
      window.history.pushState({}, '', x);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await shot(name);
  };
  await p.goto('http://127.0.0.1:8098');
  await p.waitForTimeout(2500);
  await shot('sign-in-dev');
  await text('Continue with development sign-in').click();
  await p.getByLabel('What should we call you?').fill('Sam');
  await p.getByLabel('Date of birth (YYYY-MM-DD)').fill('1990-05-05');
  await p.getByLabel('Country or region').fill('Jam');
  await text('Jamaica')
    .click()
    .catch(() => {});
  await shot('onboarding-1-about-you');
  await btn('Continue').click();
  await shot('onboarding-2-privacy');
  await p
    .getByRole('switch', { name: 'Store my health information' })
    .last()
    .check({ force: true });
  await p.getByRole('switch', { name: 'Analyze my meal photos' }).last().check({ force: true });
  await btn('Continue').click();
  await shot('onboarding-3-body');
  await p.getByLabel('Height (cm)').fill('170');
  await p.getByLabel('Current weight (kg)').fill('75');
  await btn('Continue').click();
  await shot('onboarding-4-readiness');
  for (const n of await p.getByRole('radio', { name: /^No$/ }).all()) await n.click();
  await btn('Continue').click();
  await shot('onboarding-5-goal');
  await btn('Finish setup').click();
  await text('Hello, Sam').waitFor();
  await shot('today');
  for (const t of ['Dance', 'Food', 'Coach', 'Me']) {
    await p.getByRole('tab', { name: t, exact: true }).click();
    await shot(`tab-${t.toLowerCase()}`);
  }
  for (const [path, name] of [
    ['/goals', 'goals'],
    ['/progress', 'progress'],
    ['/challenges', 'challenges'],
    ['/privacy', 'privacy'],
    ['/dance/history', 'dance-history'],
    ['/food/add', 'food-add'],
    ['/food/camera', 'food-camera'],
    ['/food/history', 'food-history'],
    ['/food/plan', 'food-plan'],
    ['/food/saved', 'food-saved'],
    ['/food/swap', 'food-swap'],
    ['/food/household', 'food-household'],
    ['/coach/review', 'coach-review'],
    ['/coach/settings', 'coach-settings'],
  ])
    await go(path, name);
  // Real flow: Dance tab -> workout detail -> guided session
  await p.evaluate(() => {
    window.history.pushState({}, '', '/dance');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await p.waitForTimeout(900);
  await p
    .getByText('10', { exact: true })
    .last()
    .click()
    .catch(() => {});
  await text('Amapiano Groove 10').click();
  await shot('dance-workout-detail');
  const start = p.getByRole('button', { name: /(Start|Begin)/ }).last();
  if (await start.isVisible().catch(() => false)) {
    await start.click();
    await shot('dance-guided-session');
  }
  console.log('page errors:', errors.length, errors.slice(0, 5));
  await browser.close();
  srv.close();
})();
