/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script */
/*
 * Browser verification of the interactive charts (real web export, MOCK mode, synthetic history shifted so it ends today).
 * Browser cannot verify haptics, native touch feel or performance: those are native-only.
 * Usage: pnpm export:web && node e2e/charts.cjs   Output: docs/review-shots/charts-*.png, results-charts.json
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const { enterPin } = require('./auth.cjs');
const OUT = process.env.REVIEW_OUT || '../../docs/review-shots';
const SEED = process.env.SEED_FILE || '/tmp/seeds/veteran-now.json';
fs.mkdirSync(OUT, { recursive: true });
const results = {};
const base = 'http://127.0.0.1:8099';
(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8099);
  const browser = await chromium.launch();
  for (const reduced of [false, true]) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1.5,
      ...(reduced ? { reducedMotion: 'reduce' } : {}),
    });
    const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
    await ctx.addInitScript((s) => {
      for (const [k, v] of Object.entries(s))
        if (!localStorage.getItem(k)) localStorage.setItem(k, v);
    }, seed);
    const p = await ctx.newPage();
    p.setDefaultTimeout(6000);
    const errors = [];
    p.on('pageerror', (e) => errors.push(e.message));
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
    await p.waitForTimeout(2200);
    const go = async (path) => {
      await p.evaluate((u) => {
        window.history.pushState({}, '', u);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }, path);
      await p.waitForTimeout(1200);
    };
    const tag = reduced ? 'reduced' : 'normal';
    const scrollTo = async (text) => {
      await p
        .getByText(text, { exact: false })
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await p.waitForTimeout(900);
    };
    const check = async (key, fn) => {
      try {
        results[`${tag}-${key}`] = { ok: true, ...(await fn()) };
      } catch (e) {
        results[`${tag}-${key}`] = { ok: false, error: String(e.message).split('\n')[0] };
      }
      console.log(
        results[`${tag}-${key}`].ok ? 'OK  ' : 'FAIL',
        tag,
        key,
        results[`${tag}-${key}`].error || '',
      );
    };
    await check('home-week', async () => {
      await go('/');
      await scrollTo('Your week in movement');
      const bar = p.getByRole('button', { name: /^\w+day \d+ \w+: \d+ min/ }).nth(3);
      await bar.click();
      await p.waitForTimeout(300);
      const text = await p.evaluate(() => document.body.innerText);
      if (!/min/.test(text)) throw new Error('no tooltip text');
      await p.screenshot({ path: `${OUT}/charts-${tag}-home.png` });
      return { bars: await p.getByRole('button', { name: /^\w+day \d+ \w+: / }).count() };
    });
    await check('progress', async () => {
      await go('/progress');
      await scrollTo('Movement over time');
      await p.screenshot({ path: `${OUT}/charts-${tag}-progress-movement.png` });
      await p.getByRole('button', { name: 'Months' }).first().click();
      await p.waitForTimeout(900);
      await p.getByRole('button', { name: 'Show values' }).first().click();
      await p.waitForTimeout(300);
      const t = await p.evaluate(() => document.body.innerText);
      if (!/Sessions per month/.test(t) && !/sessions/.test(t))
        throw new Error('month mode missing');
      await p.screenshot({ path: `${OUT}/charts-${tag}-progress-months.png` });
      await scrollTo('Your active days');
      await p.screenshot({ path: `${OUT}/charts-${tag}-progress-calendar.png` });
      await scrollTo('What you logged');
      await p
        .getByRole('button', { name: 'Next day' })
        .first()
        .click()
        .catch(() => {});
      await p.screenshot({ path: `${OUT}/charts-${tag}-progress-nutrition.png` });
      return {
        hasNutrition:
          /What you logged/.test(t) || (await p.getByText('What you logged').count()) > 0,
      };
    });
    await check('scenes-and-pulse', async () => {
      await go('/progress');
      await p.evaluate(() => window.scrollTo(0, 0));
      await p.screenshot({ path: `${OUT}/charts-${tag}-scene-progress.png` });
      await go('/friends');
      const friendsText = await p.evaluate(() => document.body.innerText);
      await p.screenshot({ path: `${OUT}/charts-${tag}-scene-friends.png` });
      await go('/');
      const pulse = p.getByRole('button', { name: 'Say hi to Pulse' }).first();
      await pulse.click();
      await p.waitForTimeout(500);
      const label = await p
        .getByLabel(/Pulse, your guide/)
        .first()
        .getAttribute('aria-label')
        .catch(() => null);
      await p.screenshot({ path: `${OUT}/charts-${tag}-pulse-tap.png` });
      return { friendsHasBanner: /Friends/.test(friendsText), pulseLabelAfterTap: label };
    });
    results[`${tag}-pageerrors`] = errors;
    await ctx.close();
  }
  fs.writeFileSync(`${OUT}/results-charts.json`, JSON.stringify(results, null, 2));
  await browser.close();
  srv.close?.();
  process.exit(Object.values(results).some((r) => r && r.ok === false) ? 1 : 0);
})();
