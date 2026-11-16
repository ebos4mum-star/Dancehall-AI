/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script */
/*
 * Input inventory for the screen-by-screen keyboard matrix (BROWSER ONLY). For every route it lists each rendered text input with the HTML attributes React Native Web derived
 * from our rules (inputmode, enterkeyhint, autocapitalize, autocorrect, spellcheck), and tests that Enter moves focus to the next field where a next field exists.
 * This proves our rules reach the DOM. It does not prove how the iOS keyboard looks or behaves.
 * Usage: pnpm export:web && node e2e/inputs.cjs   Output: docs/review-shots/results-inputs.json
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const { enterPin } = require('./auth.cjs');
const OUT = process.env.REVIEW_OUT || '../../docs/review-shots';
const SEED = process.env.SEED_FILE || '/tmp/seeds/veteran-now.json';
const base = 'http://127.0.0.1:8099';
const ROUTES = [
  '/',
  '/dance',
  '/food',
  '/coach',
  '/me',
  '/progress',
  '/goals',
  '/challenges',
  '/privacy',
  '/friends',
  '/community',
  '/food/add',
  '/food/fridge',
  '/food/swap',
  '/food/household',
  '/food/barcode',
  '/food/review',
  '/dance/schedule',
  '/dance/program',
  '/dance/history',
  '/coach/settings',
  '/coach/review',
];
(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8099);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
  await ctx.addInitScript((s) => {
    for (const [k, v] of Object.entries(s))
      if (!localStorage.getItem(k)) localStorage.setItem(k, v);
  }, seed);
  const p = await ctx.newPage();
  p.setDefaultTimeout(5000);
  await p.goto(base);
  await p.waitForTimeout(1500);
  if (
    await p
      .getByText('Protect your account with a PIN')
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    await enterPin(p);
    await p.getByText('Confirm your PIN').first().waitFor({ state: 'visible' });
    await enterPin(p);
    await p
      .getByRole('button', { name: 'Protect my account', exact: true })
      .locator('visible=true')
      .last()
      .click();
  }
  await p.waitForTimeout(2000);
  const out = {};
  for (const r of ROUTES) {
    await p.evaluate((u) => {
      window.history.pushState({}, '', u);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, r);
    await p.waitForTimeout(1300);
    const inputs = await p.evaluate(() =>
      [...document.querySelectorAll('input, textarea')]
        .filter(
          (e) =>
            e.offsetParent !== null && e.type !== 'checkbox' && e.getAttribute('role') !== 'switch',
        )
        .map((e) => ({
          label: e.getAttribute('aria-label') || e.getAttribute('placeholder') || '(unlabelled)',
          tag: e.tagName,
          type: e.getAttribute('type'),
          inputmode: e.getAttribute('inputmode'),
          enterkeyhint: e.getAttribute('enterkeyhint'),
          autocapitalize: e.getAttribute('autocapitalize'),
          autocorrect: e.getAttribute('autocorrect'),
          secure: e.type === 'password',
        })),
    );
    // Enter on every non-last single-line field should move focus.
    const progress = [];
    const els = p.locator('input:visible, textarea:visible');
    const n = await els.count();
    for (let i = 0; i < n - 1; i++) {
      const el = els.nth(i);
      const tag = await el.evaluate((e) => e.tagName + ':' + (e.getAttribute('type') || ''));
      if (tag.startsWith('TEXTAREA') || tag.includes('checkbox')) continue;
      const before = await el.getAttribute('aria-label');
      await el.focus().catch(() => {});
      await el.press('Enter').catch(() => {});
      await p.waitForTimeout(150);
      const after = await p.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName,
      );
      progress.push({ from: before, to: after, moved: after !== before });
    }
    out[r] = { inputs, enterProgression: progress };
    console.log(r.padEnd(20), inputs.length, 'inputs');
  }
  fs.writeFileSync(`${OUT}/results-inputs.json`, JSON.stringify(out, null, 2));
  await browser.close();
  srv.close?.();
})();
