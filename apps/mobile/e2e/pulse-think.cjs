/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script */
/*
 * Captures Pulse's thinking pose in the Coach header (normal and Reduce Motion). Uses the private design-review build (EXPO_PUBLIC_PREVIEW_REVIEW=1) so the pose can be held still
 * for a screenshot; the real trigger (Coach busy, celebrations not Off) is covered by unit and source tests, and the reply in the mock Coach is too fast to catch by hand.
 * Usage: EXPO_PUBLIC_PREVIEW_REVIEW=1 npx expo export --platform web --output-dir dist-review && E2E_DIST=dist-review node e2e/pulse-think.cjs
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const { createAccountViaPin, onboard } = require('./auth.cjs');
const OUT = process.env.REVIEW_OUT || '../../docs/review-shots';
const base = 'http://127.0.0.1:8099';
const results = {};
(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8099);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1.5,
  });
  const p = await ctx.newPage();
  p.setDefaultTimeout(6000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base);
  await p.waitForTimeout(2500);
  await createAccountViaPin(p);
  await onboard(p);
  await p.waitForTimeout(2000);
  const go = async (path) => {
    await p.evaluate((u) => {
      window.history.pushState({}, '', u);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await p.waitForTimeout(1300);
  };
  await go('/coach');
  const box = p.locator('textarea').last();
  await box.fill('How do I start gently?');
  await p.getByRole('button', { name: 'Send' }).last().click();
  await p.waitForTimeout(1200);
  const label = async () =>
    p
      .getByLabel(/Pulse, your guide/)
      .first()
      .getAttribute('aria-label');
  for (const mode of ['normal', 'reduced']) {
    await go('/');
    await p.getByText('Design review controls').first().scrollIntoViewIfNeeded();
    await p
      .getByRole('button', { name: mode === 'reduced' ? 'Reduced motion' : 'Full motion' })
      .first()
      .click();
    await p.getByRole('button', { name: 'think' }).first().click();
    await p.waitForTimeout(500);
    await go('/coach');
    await p.waitForTimeout(900);
    results[`${mode}-label`] = await label();
    await p.screenshot({
      path: `${OUT}/story-coach-think-${mode}.png`,
      clip: { x: 0, y: 0, width: 390, height: 330 },
    });
    // Does the pose move? Compare the transform of the Pulse wrapper over time.
    const t = async () =>
      p.evaluate(() => {
        const el = document.querySelector('[aria-label*="thinking it over"] > div');
        return el ? getComputedStyle(el).transform : null;
      });
    const a = await t();
    await p.waitForTimeout(1100);
    const b = await t();
    results[`${mode}-transformChanges`] = a !== b;
  }
  results.pageerrors = errors;
  fs.writeFileSync(`${OUT}/results-think.json`, JSON.stringify(results, null, 2));
  console.log(results);
  await browser.close();
  srv.close?.();
})();
