/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node script */
/*
 * Browser journey for progression and Apple Health import (web export, MOCK mode, synthetic data, simulated Health provider; NOT native HealthKit).
 * New person -> Today shows level, streak, quests -> Settings: set a rest day and target -> turn on Apple Health import -> Today XP rises once and
 * does not rise again on a second import -> switch rewards off and they disappear -> back on. Usage: pnpm export:web && node e2e/gamification.cjs
 */
const { chromium } = require('playwright');
const { createAccountViaPin, onboard } = require('./auth.cjs');
const assert = require('node:assert/strict');

let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    console.log('PASS ', name);
  } catch (e) {
    failed++;
    console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]);
  }
}
(async () => {
  const { serve } = await import('./serve.mjs');
  const srv = await serve(8099);
  const browser = await chromium.launch();
  const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p.setDefaultTimeout(6000);
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  const base = 'http://127.0.0.1:8099';
  const go = async (path) => {
    await p.evaluate((u) => {
      window.history.pushState({}, '', u);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }, path);
    await p.waitForTimeout(900);
  };
  const body = () => p.evaluate(() => document.body.innerText);
  const xpNow = async () => {
    const m = /(\d+) XP\b/.exec(await body());
    return m ? Number(m[1]) : null;
  };
  await p.goto(base);
  await p.waitForTimeout(2500);
  await createAccountViaPin(p);
  await onboard(p);
  await p.waitForTimeout(1800);

  await step('Today shows level 1, a streak prompt, three quests and the XP promise', async () => {
    const b = await body();
    assert.match(b, /Level 1/);
    assert.match(b, /start a streak|streak/i);
    assert.match(b, /Today.s quests/);
    assert.match(b, /Food amounts, calories and weight never earn or cost XP/);
    assert.equal(await xpNow(), 0);
  });
  await step('there is no new tab and no Journey tab', async () => {
    const tabs = (await p.getByRole('tab').allInnerTexts()).map((s) => s.trim().toLowerCase());
    assert.ok(!tabs.some((t) => t.includes('journey')), tabs.join(','));
    assert.equal(tabs.length, 5, tabs.join(','));
  });
  await step(
    'Settings: planned rest days and a weekly target can be set, and rest days are capped at four',
    async () => {
      await go('/privacy');
      const b = await body();
      assert.match(b, /Progress and rewards/);
      assert.match(b, /Planned rest days/);
      for (const d of ['Mon', 'Tue', 'Wed'])
        await p.getByRole('switch', { name: d }).last().click();
      // Sunday (default) + Mon + Tue + Wed = 4: the rest must now be disabled.
      const thu = p.getByRole('switch', { name: 'Thu' }).last();
      assert.equal(await thu.getAttribute('aria-disabled'), 'true');
      await p.getByRole('radio', { name: '4' }).last().click();
      assert.match(await body(), /✓ 4/);
    },
  );
  await step(
    'Apple Health (simulated): off by default, then importing adds workouts once',
    async () => {
      const b = await body();
      assert.match(b, /Import workouts from Apple Health/);
      assert.match(b, /No calories, heart rate or location are read/);
      await go('/');
      assert.equal(await xpNow(), 0, 'nothing imported before the switch');
      await go('/privacy');
      await p.getByRole('switch', { name: 'Import workouts from Apple Health' }).last().click();
      await p.waitForTimeout(1200);
      assert.match(await body(), /Imported 2 workouts/);
      await go('/');
      const after = await xpNow();
      assert.ok(after > 0, `xp ${after}`);
      await go('/privacy');
      await p.getByRole('button', { name: 'Import now' }).last().click();
      await p.waitForTimeout(1000);
      assert.match(await body(), /No new workouts to import/);
      await go('/');
      assert.equal(await xpNow(), after, 'a second import must not pay again');
    },
  );
  await step('imported workouts appear in workout history once each', async () => {
    await go('/dance/history');
    const b = await body();
    assert.equal((b.match(/Simulated walk/g) ?? []).length, 1);
    assert.equal((b.match(/Simulated cycling/g) ?? []).length, 1);
  });
  await step('Workouts tab shows the weekly target and quests', async () => {
    await go('/dance');
    const b = await body();
    assert.match(b, /active days this week/);
  });
  await step('Progress shows badges, the season challenge and the wardrobe', async () => {
    await go('/progress');
    const b = await body();
    assert.match(b, /Badges/);
    assert.match(b, /Season challenge/);
    assert.match(b, /Pulse.s wardrobe/);
  });
  await step(
    'Switching rewards off hides them everywhere; switching on brings them back',
    async () => {
      await go('/privacy');
      await p.getByRole('switch', { name: 'Show XP, streaks and quests' }).last().click();
      await go('/');
      assert.doesNotMatch(await body(), /Today.s quests/);
      await go('/progress');
      assert.doesNotMatch(await body(), /Season challenge/);
      await go('/privacy');
      await p.getByRole('switch', { name: 'Show XP, streaks and quests' }).last().click();
      await go('/');
      assert.match(await body(), /Today.s quests/);
    },
  );
  await step('no page errors during the journey', async () => assert.deepEqual(errors, []));
  await browser.close();
  srv.close();
  process.exit(failed ? 1 : 0);
})();
