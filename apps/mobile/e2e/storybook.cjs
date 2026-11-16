/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script */
/*
 * Browser capture and keyboard-attribute verification of the storybook chapters (real web export, MOCK mode, synthetic data).
 * Verifies in a BROWSER only: the HTML input attributes React Native Web derives from our keyboard rules, and Enter-key focus progression.
 * It does NOT verify iOS keyboard behaviour (that needs a device). Output: docs/review-shots/story-*.png, results-storybook.json
 * Usage: pnpm export:web && node e2e/storybook.cjs
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const { createAccountViaPin, enterPin } = require('./auth.cjs');
const OUT = process.env.REVIEW_OUT || '../../docs/review-shots';
const SEED = process.env.SEED_FILE || '/tmp/seeds/veteran-now.json';
fs.mkdirSync(OUT, { recursive: true });
const base = 'http://127.0.0.1:8099';
const results = {};
const attrs = (loc) =>
  loc.evaluate((el) => ({
    type: el.getAttribute('type'),
    inputmode: el.getAttribute('inputmode'),
    enterkeyhint: el.getAttribute('enterkeyhint'),
    autocapitalize: el.getAttribute('autocapitalize'),
    autocorrect: el.getAttribute('autocorrect'),
    spellcheck: el.getAttribute('spellcheck'),
    tag: el.tagName,
  }));
const top = (p) =>
  p.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll('*').forEach((e) => {
      if (e.scrollTop > 0) e.scrollTop = 0;
    });
  });
const rec = async (key, fn) => {
  try {
    results[key] = { ok: true, ...(await fn()) };
  } catch (e) {
    results[key] = { ok: false, error: String(e.message).split('\n')[0] };
  }
  console.log(results[key].ok ? 'OK  ' : 'FAIL', key, results[key].error || '');
};
(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8099);
  const browser = await chromium.launch();

  // ---- Onboarding: fresh account, every step ----
  {
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
    await p.waitForTimeout(1200);
    const btn = (n) => p.getByRole('button', { name: n }).locator('visible=true').last();
    const shot = async (n) => {
      await top(p);
      await p.waitForTimeout(700);
      await p.screenshot({ path: `${OUT}/story-onboarding-${n}.png` });
    };
    await rec('onb-1-attrs', async () => {
      await shot('1-about-you');
      const name = p.getByLabel('What should we call you?');
      const dob = p.getByLabel('Date of birth (YYYY-MM-DD)');
      const country = p.getByLabel('Country or region');
      const a = { name: await attrs(name), dob: await attrs(dob), country: await attrs(country) };
      await name.fill('Sam');
      await name.press('Enter');
      await p.waitForTimeout(250);
      const focusedAfterEnter = await p.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? null,
      );
      return { ...a, focusedAfterEnterOnName: focusedAfterEnter };
    });
    await p.getByLabel('Date of birth (YYYY-MM-DD)').fill('1990-05-05');
    await p.getByLabel('Country or region').fill('Aus');
    await p.getByText('Australia', { exact: false }).last().click();
    await btn('Continue').click();
    await p.getByText('Your privacy').first().waitFor({ state: 'visible' });
    await shot('2-privacy');
    await p
      .getByRole('switch', { name: 'Store my health information' })
      .last()
      .check({ force: true });
    await btn('Continue').click();
    await p.getByLabel('Height (cm)').waitFor({ state: 'visible' });
    await rec('onb-3-attrs', async () => ({
      height: await attrs(p.getByLabel('Height (cm)')),
      weight: await attrs(p.getByLabel('Current weight (kg)')),
    }));
    await shot('3-body');
    await p.getByLabel('Height (cm)').fill('170');
    await p.getByLabel('Current weight (kg)').fill('75');
    await btn('Continue').click();
    await p.waitForTimeout(500);
    await shot('4-readiness');
    for (const n of await p.getByRole('radio', { name: /^No$/ }).all()) await n.click();
    await btn('Continue').click();
    await p.waitForTimeout(500);
    await shot('5-goal');
    results['onb-pageerrors'] = errors;
    await btn('Finish setup').click();
    await p.waitForTimeout(2000);
    // ---- the same account: Coach (empty hero, then a chat) ----
    await rec('coach', async () => {
      await p.evaluate(() => {
        window.history.pushState({}, '', '/coach');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await p.waitForTimeout(1500);
      await top(p);
      await p.screenshot({ path: `${OUT}/story-coach-empty.png` });
      const box = p.locator('textarea').last();
      const a = await attrs(box);
      await box.fill('How do I start gently?');
      const sendHint = a.enterkeyhint;
      await box.press('Enter');
      await p.waitForTimeout(600);
      const heroGone = !(await p
        .getByText('Fit Concierge')
        .first()
        .isVisible()
        .catch(() => false));
      let sentBy = heroGone ? 'Enter' : null;
      if (!heroGone) {
        await p.getByRole('button', { name: 'Send' }).last().click();
        await p.waitForTimeout(600);
        sentBy = (await p
          .getByText('Fit Concierge')
          .first()
          .isVisible()
          .catch(() => false))
          ? 'neither'
          : 'Send button';
      }
      results['coach-sentBy'] = sentBy;
      await p.waitForTimeout(400);
      await p.screenshot({ path: `${OUT}/story-coach-thinking.png` });
      await p.waitForTimeout(3500);
      await p.screenshot({ path: `${OUT}/story-coach-chat.png` });
      return { composer: a, sendHint, tag: a.tag };
    });
    await ctx.close();
  }

  // ---- Seeded data: Progress (from the top) and Community ----
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 1.5,
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
      await p.waitForTimeout(1600);
      await top(p);
      await p.waitForTimeout(500);
    };
    await rec('progress-top', async () => {
      await go('/progress');
      await p.screenshot({ path: `${OUT}/story-progress-top.png` });
      return {};
    });
    await rec('community', async () => {
      await go('/community');
      await p.screenshot({ path: `${OUT}/story-community.png` });
      return { text: (await p.evaluate(() => document.body.innerText)).slice(0, 160) };
    });
    await rec('friends', async () => {
      await go('/friends');
      await p.screenshot({ path: `${OUT}/story-friends.png` });
      const user = p.getByLabel(/public name|username/i).first();
      return { username: (await user.count()) ? await attrs(user) : null };
    });
    results['seed-pageerrors'] = errors;
    await ctx.close();
  }
  fs.writeFileSync(`${OUT}/results-storybook.json`, JSON.stringify(results, null, 2));
  await browser.close();
  srv.close?.();
  process.exit(Object.values(results).some((r) => r && r.ok === false) ? 1 : 0);
})();
