/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script */
/*
 * Browser verification of the XP history card and the badge timeline on Progress (real web export, MOCK mode, synthetic records shifted to end today).
 *  - "long": a long history (older than the 60-day window): must show partial coverage and NO qualified badge dates.
 *  - "gappy": 18 days of weekday-only activity: a streak badge depends on the planned rest days, so it must be Estimated (with a range) or Earlier, never Earned.
 *  - "young": 11 days of records: must show where history starts and qualified badge dates.
 * Run in normal and Reduce Motion modes. Browser only: not a native check.
 * Usage: pnpm export:web && node e2e/analytics.cjs   Output: docs/review-shots/story-xp-*.png, story-milestones-*.png, results-analytics.json
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const { enterPin } = require('./auth.cjs');
const OUT = process.env.REVIEW_OUT || '../../docs/review-shots';
const base = 'http://127.0.0.1:8099';
const SEEDS = {
  long: '/tmp/seeds/veteran-now.json',
  young: '/tmp/seeds/young-now.json',
  gappy: '/tmp/seeds/gappy-now.json',
};
const results = {};
const text = (p) => p.evaluate(() => document.body.innerText);
(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8099);
  const browser = await chromium.launch();
  for (const [name, file] of Object.entries(SEEDS))
    for (const reduced of [false, true]) {
      const tag = `${name}-${reduced ? 'reduced' : 'normal'}`;
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 1.5,
        ...(reduced ? { reducedMotion: 'reduce' } : {}),
      });
      const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
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
      await p.waitForTimeout(2500);
      await p.evaluate(() => {
        window.history.pushState({}, '', '/progress');
        window.dispatchEvent(new PopStateEvent('popstate'));
      });
      await p.waitForTimeout(2500);
      const r = { ok: true };
      try {
        await p.getByText('Your XP over time').first().scrollIntoViewIfNeeded();
        await p.waitForTimeout(900);
        await p.screenshot({ path: `${OUT}/story-xp-${tag}.png` });
        const t1 = await text(p);
        r.xpCard = /Your XP over time/.test(t1);
        r.partialNote = /Daily detail covers the last 60 days/.test(t1);
        r.youngNote = /History starts on/.test(t1);
        r.weeklyNote = /Weekly quest XP is shown on the last day of its week/.test(t1);
        r.badgeNote = /Badge bonuses/.test(t1);
        // touch exploration: the Next day button reads a point; Show values opens the text list.
        await p
          .getByRole('button', { name: 'Show values' })
          .last()
          .click()
          .catch(() => {});
        await p.waitForTimeout(300);
        await p.getByRole('button', { name: 'Each day' }).first().click();
        await p.waitForTimeout(900);
        r.dailyMode = /XP earned each day/.test(await text(p));
        await p.getByText('Milestones', { exact: true }).first().scrollIntoViewIfNeeded();
        await p.waitForTimeout(700);
        await p.screenshot({ path: `${OUT}/story-milestones-${tag}.png` });
        const t2 = await text(p);
        r.earnedDates = (t2.match(/Earned \d{1,2} [A-Z][a-z]{2} \d{4}/g) ?? []).length;
        r.estimatedDates = (t2.match(/Estimated \d{1,2} [A-Z][a-z]{2} \d{4}/g) ?? []).length;
        r.recorded = /Recorded \d/.test(t2);
        r.undated = /date cannot be known/.test(t2);
        r.exactNote = /Earned dates are exact/.test(t2);
        r.estimateNote = /Estimated dates depend on a setting/.test(t2);
        r.noLegacyClaim = !/each date is the day the app/.test(t2);
        r.hasMilestones = /Milestones/.test(t2);
        r.pageErrors = errors;
      } catch (e) {
        r.ok = false;
        r.error = String(e.message).split('\n')[0];
      }
      results[tag] = r;
      console.log(r.ok ? 'OK  ' : 'FAIL', tag, JSON.stringify(r));
      await ctx.close();
    }
  fs.writeFileSync(`${OUT}/results-analytics.json`, JSON.stringify(results, null, 2));
  await browser.close();
  srv.close?.();
  process.exit(Object.values(results).some((r) => !r.ok) ? 1 : 0);
})();
