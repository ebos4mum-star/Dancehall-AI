/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script (CommonJS so Playwright resolves from a global install) */
/* Accessibility sweep over every route in MOCK mode: interactive elements need a name and a 44pt target.
 * Usage: pnpm export:web && node e2e/a11y.cjs   (E2E_SCHEME=dark optional). Exits 1 when a finding remains. */
const { chromium } = require('playwright');
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
  '/dance/history',
  '/dance/schedule',
  '/dance/program?id=sample-4wk-starter',
  '/dance/qf10-amapiano-groove',
  '/dance/session?id=qf10-amapiano-groove',
  '/food/add',
  '/food/camera',
  '/food/history',
  '/food/plan',
  '/food/saved',
  '/food/swap',
  '/food/household',
  '/food/review',
  '/coach/review',
  '/coach/settings',
];
(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8092);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: process.env.E2E_SCHEME || 'light',
  });
  const p = await ctx.newPage();
  const btn = (n) => p.getByRole('button', { name: n }).last();
  await p.goto('http://127.0.0.1:8092');
  await p.waitForTimeout(2500);
  await p.getByText('Continue with development sign-in').last().click();
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
  await p.waitForTimeout(3000);
  let total = 0;
  for (const r of ROUTES) {
    await p.evaluate((x) => {
      history.pushState({}, '', x);
      dispatchEvent(new PopStateEvent('popstate'));
    }, r);
    await p.waitForTimeout(900);
    const found = await p.evaluate(() => {
      const out = [];
      const visible = (el) => {
        const b = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return (
          b.width > 0 &&
          b.height > 0 &&
          cs.visibility !== 'hidden' &&
          cs.display !== 'none' &&
          el.closest('[aria-hidden="true"]') === null &&
          b.bottom > 0 &&
          b.top < innerHeight * 6
        );
      };
      const sel =
        '[role="button"],[role="checkbox"],[role="radio"],[role="switch"],[role="tab"],a[href],input,textarea,button';
      for (const el of document.querySelectorAll(sel)) {
        if (!visible(el)) continue;
        // tabs of hidden stack screens are skipped by the aria-hidden check above
        const b = el.getBoundingClientRect();
        const name = (
          el.getAttribute('aria-label') ||
          el.innerText ||
          el.getAttribute('placeholder') ||
          el.getAttribute('title') ||
          ''
        ).trim();
        const role = el.getAttribute('role') || el.tagName.toLowerCase();
        if (!name) out.push(`NO NAME  ${role}`);
        if (role !== 'switch' && (b.height < 43.5 || b.width < 43.5) && !(el.tagName === 'INPUT'))
          out.push(
            `SMALL ${Math.round(b.width)}x${Math.round(b.height)}  ${role} "${name.slice(0, 30)}"`,
          );
      }
      return out;
    });
    if (found.length) {
      console.log(r);
      for (const f of [...new Set(found)]) console.log('   ', f);
      total += found.length;
    }
  }
  console.log(total === 0 ? 'a11y sweep: no findings' : `a11y sweep: ${total} findings`);
  await browser.close();
  srv.close();
  process.exitCode = total === 0 ? 0 : 1;
})();
