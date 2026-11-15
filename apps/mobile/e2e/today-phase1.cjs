/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script (CommonJS so Playwright resolves from a global install) */
/* Captures the Phase 1 Today reference screens from the web export in MOCK mode (synthetic data).
 * Usage: pnpm export:web && SHOTS_DIR=../../docs/preview/phase1 node e2e/today-phase1.cjs */
const { chromium } = require('playwright');
const { createAccountViaPin } = require('./auth.cjs');
const out = process.env.SHOTS_DIR || 'shots';
require('node:fs').mkdirSync(out, { recursive: true });

async function session(browser, scheme, reduced) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
    reducedMotion: reduced ? 'reduce' : 'no-preference',
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const btn = (n) => p.getByRole('button', { name: n }).last();
  await p.goto('http://127.0.0.1:8095');
  await p.waitForTimeout(2500);
  await createAccountViaPin(p);
  await p.getByLabel('What should we call you?').fill('Sam');
  await p.getByLabel('Date of birth (YYYY-MM-DD)').fill('1990-05-05');
  await p.getByLabel('Country or region').fill('Jam');
  await p.getByText('Jamaica').last().click();
  await btn('Continue').click();
  await p
    .getByRole('switch', { name: 'Store my health information' })
    .last()
    .check({ force: true });
  await btn('Continue').click();
  await p.getByLabel('Height (cm)').fill('170');
  await p.getByLabel('Current weight (kg)').fill('75');
  await btn('Continue').click();
  for (const n of await p.getByRole('radio', { name: /^No$/ }).all()) await n.click();
  await btn('Continue').click();
  await btn('Finish setup').click();
  await p.getByText('Hello, Sam').waitFor();
  return { p, errors, btn };
}

(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8095);
  const browser = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const { p, errors } = await session(browser, scheme, false);
    await p.waitForTimeout(700);
    await p.screenshot({ path: `${out}/${scheme}-1-welcome.png` });
    await p.waitForTimeout(3200);
    await p.screenshot({ path: `${out}/${scheme}-2-today-top.png` });
    // Tall capture of the whole page.
    await p.setViewportSize({ width: 390, height: 2300 });
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${out}/${scheme}-3-today-full.png` });
    await p.setViewportSize({ width: 390, height: 844 });
    await p.waitForTimeout(500);
    // A real accomplishment: tick a habit-type plan item, then catch Pulse celebrating.
    const box = p
      .getByRole('checkbox')
      .filter({ hasText: /water|Stretch|walk|breaths|screens/i })
      .first();
    await box.click();
    await p.mouse.move(200, 400);
    await p.mouse.wheel(0, -4000);
    await p.waitForTimeout(450);
    await p.screenshot({ path: `${out}/${scheme}-4-celebrate.png` });
    console.log(scheme, 'page errors:', errors.length, errors.slice(0, 3));
    await p.context().close();
  }
  {
    const { p, errors } = await session(browser, 'light', true);
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${out}/light-5-reduced-motion.png` });
    console.log('reduced-motion page errors:', errors.length);
    await p.context().close();
  }
  await browser.close();
  srv.close();
})();
