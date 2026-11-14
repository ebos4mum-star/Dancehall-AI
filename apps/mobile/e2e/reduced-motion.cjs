/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script (CommonJS so Playwright resolves from a global install) */
/* Reduced-motion check: Pulse's transform changes over time only when motion is allowed. Usage: pnpm export:web && node e2e/reduced-motion.cjs */
// verifies reduced motion: no running animations/transitions on the Today hero after load
const { chromium } = require('playwright');
(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8094);
  const b = await chromium.launch();
  for (const reduced of [false, true]) {
    const ctx = await b.newContext({
      viewport: { width: 390, height: 844 },
      reducedMotion: reduced ? 'reduce' : 'no-preference',
    });
    const p = await ctx.newPage();
    const btn = (n) => p.getByRole('button', { name: n }).last();
    await p.goto('http://127.0.0.1:8094');
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
    await p.waitForTimeout(4000);
    // sample Pulse container transform twice: moving only when motion is allowed
    const sample = () =>
      p.evaluate(() => {
        const el = document.querySelector('[aria-label^="Pulse, your guide"]');
        const c = el && el.firstElementChild;
        return c ? getComputedStyle(c).transform : 'none';
      });
    const a = await sample();
    await p.waitForTimeout(1300);
    const c2 = await sample();
    console.log(
      reduced ? 'reduced motion ON ' : 'reduced motion OFF',
      '| Pulse transform changes over time:',
      a !== c2,
    );
    if (reduced && a !== c2) process.exitCode = 1;
    if (!reduced && a === c2) process.exitCode = 1;
    await ctx.close();
  }
  await b.close();
  srv.close();
})();
