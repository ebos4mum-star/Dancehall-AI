/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script */
/*
 * Browser route sweep (web export, MOCK mode, synthetic data): after a real account + onboarding, visit EVERY route and a set of hostile deep links.
 * Passes when no page throws, nothing is blank, no raw error/"undefined"/"[object Object]" text leaks, and the app stays usable (a tab is still reachable).
 * Usage: pnpm export:web && node e2e/routes.cjs
 */
const { chromium } = require('playwright');
const { createAccountViaPin, onboard } = require('./auth.cjs');

const ROUTES = [
  '/',
  '/goals',
  '/progress',
  '/challenges',
  '/community',
  '/friends',
  '/privacy',
  '/coach/settings',
  '/coach/review',
  '/dance/history',
  '/dance/program',
  '/dance/schedule',
  '/dance/session',
  '/food/add',
  '/food/barcode',
  '/food/camera',
  '/food/fridge',
  '/food/history',
  '/food/household',
  '/food/plan',
  '/food/review',
  '/food/saved',
  '/food/swap',
  '/account/pin',
  '/account/rotate',
  '/account/recovery-key',
  '/account/questions',
];
const HOSTILE = [
  '/dance/does-not-exist',
  '/dance/%00',
  '/dance/' + 'x'.repeat(300),
  '/food/review?id=nope',
  '/definitely-not-a-route',
  '/community?x=<script>alert(1)</script>',
  '/food/add?name=%3Cimg%20src%3Dx%3E&kcal=NaN&grams=-5',
  '/food/swap?foodId=none',
];
(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8099);
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 320, height: 568 } }); // smallest supported phone
  p.setDefaultTimeout(6000);
  let errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('dialog', (d) => {
    errors.push('dialog:' + d.message());
    d.dismiss();
  });
  const base = 'http://127.0.0.1:8099';
  await p.goto(base);
  await p.waitForTimeout(2500);
  await createAccountViaPin(p);
  await onboard(p);
  await p.waitForTimeout(1500);
  const go = async (path) => {
    await p.evaluate((u) => {
      window.history.pushState({}, '', u);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await p.waitForTimeout(700);
  };
  let fail = 0;
  for (const [kind, list] of [
    ['route', ROUTES],
    ['hostile', HOSTILE],
  ]) {
    for (const path of list) {
      errors = [];
      await go(path);
      const body = await p.evaluate(() => document.body.innerText || '');
      const probs = [];
      if (body.trim().length < 15) probs.push('blank');
      if (/\[object Object\]|\bundefined\b|\bNaN\b|TypeError|Unhandled/.test(body))
        probs.push(
          'leaked: ' +
            (body.match(/\[object Object\]|\bundefined\b|\bNaN\b|TypeError|Unhandled/) || [''])[0],
        );
      if (errors.length) probs.push('errors: ' + errors.slice(0, 2).join(' | '));
      const reachable =
        (await p
          .getByRole('tab')
          .first()
          .isVisible()
          .catch(() => false)) || (await p.getByRole('button').count()) > 0;
      if (!reachable) probs.push('no way out (no tab or button)');
      console.log(probs.length ? 'FAIL ' : 'PASS ', kind, path, probs.join('; '));
      if (probs.length) fail++;
    }
  }
  await browser.close();
  srv.close();
  console.log(fail ? `${fail} route problem(s)` : 'route sweep: no problems');
  process.exit(fail ? 1 : 0);
})();
