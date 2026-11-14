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
  if (group === 'finish') await shot('signin');
  await text('Continue with development sign-in').click();
  await p.getByLabel('What should we call you?').fill('Sam');
  await p.getByLabel('Date of birth (YYYY-MM-DD)').fill('1990-05-05');
  await p.getByLabel('Country or region').fill('Jam');
  if (group === 'finish') await shot('onb1');
  await text('Jamaica').click();
  if (group === 'finish') await shot('onb1-country');
  await btn('Continue').click();
  if (group === 'finish') await shot('onb2');
  await p
    .getByRole('switch', { name: 'Store my health information' })
    .last()
    .check({ force: true });
  await p.getByRole('switch', { name: 'Analyze my meal photos' }).last().check({ force: true });
  await btn('Continue').click();
  if (group === 'finish') await shot('onb2-on');
  await p.getByLabel('Height (cm)').fill('170');
  await p.getByLabel('Current weight (kg)').fill('75');
  await btn('Continue').click();
  if (group === 'finish') await shot('onb4');
  for (const n of await p.getByRole('radio', { name: /^No$/ }).all()) await n.click();
  await btn('Continue').click();
  if (group === 'finish') await shot('onb5');
  await btn('Finish setup').click();
  await text('Hello, Sam').waitFor();
  await p.waitForTimeout(3000);

  if (group === 'finish') {
    await tab('Food');
    await btn('Meal plan').click();
    await shot('plan');
    await btn('Preview plan').click();
    await scrollTo(900);
    await shot('plan-preview');
    await btn('Save plan').click();
    await scrollTo(1400);
    await shot('plan-saved');
    await go('/food/saved');
    await shot('saved-empty');
    await go('/food/history');
    await shot('history-empty');
    await go('/food/swap');
    await p.getByLabel('Search foods').fill('rice');
    await shot('swap-search');
    await p.locator('[role="button"][aria-label*="ice"]').first().click();
    await shot('swap-compare');
    await go('/coach/settings');
    await shot('coach-settings');
    await scrollTo(900);
    await shot('coach-settings-2');
    await go('/privacy');
    await shot('privacy');
    await scrollTo(900);
    await shot('privacy-2');
  }
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
    await scrollTo(1200);
    await shot('session-ready-lower');
    await scrollTo(-3000);
    await btn('Start', { exact: true }).click();
    await shot('session-prep');
    await p.waitForTimeout(4200);
    await shot('session-running');
    await btn('Pause').click();
    await shot('session-paused');
    await btn('Resume').click();
    await btn('End session').click();
    await shot('session-end-confirm');
    await btn('End session').click();
    await shot('complete');
    await btn('Hard')
      .click()
      .catch(() => {});
    await btn('Save what I did').click();
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
  if (group === 'food') {
    await tab('Food');
    await shot('tab-top');
    await scrollTo(500);
    await shot('tab-slots');
    await btn('Breakfast', { exact: false }).click();
    await shot('add');
    await p.getByLabel('Search foods').fill('rice');
    await p.waitForTimeout(500);
    await p.locator('[role="button"][aria-label*="ice"]').first().click();
    await btn(/^Add to meal|^Add$/).click();
    await shot('review');
    await scrollTo(700);
    await shot('review-total');
    await btn('Save to diary').click();
    await p.waitForTimeout(500);
    await shot('saved-moment');
    await p.waitForTimeout(2800);
    await scrollTo(500);
    await shot('tab-after-log');
    await go('/food/add');
    await shot('add-with-recents');
    await go('/food/camera');
    await shot('camera');
    await go('/food/history');
    await shot('history');
    await go('/food/saved');
    await shot('saved');
    await go('/food/household');
    await shot('household-empty');
    await p.getByLabel('Household name').fill('Home base');
    await btn('Create a household').click();
    await p.waitForTimeout(700);
    await shot('household-created');
    await btn('Add meal idea', { exact: false })
      .click()
      .catch(() => {});
    await p
      .getByLabel('Meal idea')
      .fill('Rice and peas')
      .catch(() => {});
    await btn('Add meal idea', { exact: true })
      .click()
      .catch(() => {});
    await btn('Add to list', { exact: false })
      .click()
      .catch(() => {});
    await p
      .getByLabel('Item')
      .fill('Plantain')
      .catch(() => {});
    await p
      .getByLabel('Quantity and unit (optional, e.g. 2 kg)')
      .fill('4')
      .catch(() => {});
    await btn('Add to list', { exact: true })
      .click()
      .catch(() => {});
    await p.waitForTimeout(600);
    await shot('household-lists');
  }
  if (group === 'coach') {
    await tab('Coach');
    await shot('tab-top');
    await scrollTo(700);
    await shot('tab-prompts');
    await p.getByRole('button', { name: 'I missed a few days' }).last().click();
    await p.waitForTimeout(500);
    await shot('thinking-or-reply');
    await p.waitForTimeout(2000);
    await shot('reply');
    await scrollTo(600);
    await btn('Why this?', { exact: false })
      .click()
      .catch(() => {});
    await shot('reply-why');
    await go('/coach/review');
    await shot('review-empty');
    await btn('Write my weekly review', { exact: false })
      .click()
      .catch(() => {});
    await p.waitForTimeout(800);
    await shot('review');
    await go('/coach/settings');
    await shot('settings');
  }
  if (group === 'me') {
    await tab('Me');
    await shot('tab-top');
    await scrollTo(500);
    await shot('tab-menu');
    await go('/progress');
    await shot('progress-top');
    await scrollTo(800);
    await shot('progress-mid');
    await go('/goals');
    await shot('goals-empty');
    await btn('Create goal', { exact: false })
      .click()
      .catch(() => {});
    await p.waitForTimeout(700);
    await shot('goals-after');
    await go('/challenges');
    await shot('challenge-start');
    await btn('Start challenge', { exact: false })
      .click()
      .catch(() => {});
    await p.waitForTimeout(700);
    await shot('challenge-active');
    await go('/privacy');
    await shot('privacy-top');
    await scrollTo(800);
    await shot('privacy-consents');
    await scrollTo(900);
    await shot('privacy-export');
  }
  console.log(group, 'page errors:', errors.length, errors.slice(0, 5));
  await browser.close();
  srv.close();
})();
