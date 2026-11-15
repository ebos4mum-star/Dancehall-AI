/*
 * Shared steps for the browser suites now that the app opens as a guest and an account is made with a six-digit PIN (no email, no password).
 * `createAccountViaPin` goes from the guest home to the first onboarding screen, the way a person would: Create account, two security questions, save the Recovery Key, choose a PIN, confirm it.
 */
const PIN = '482916';

async function enterPin(p, pin = PIN) {
  for (const d of pin)
    await p.getByRole('button', { name: d, exact: true }).locator('visible=true').last().click();
}

/** Answers used by the suites (made up: they are not real personal details). */
const ANSWERS = ['Curry goat', 'Mama Joyce'];

/**
 * Creates the two security questions, the Recovery Key backup and the PIN, in the order a person meets them. Starts at the "Set up recovery" screen and ends at
 * the PIN screen where "Protect my account" is pressed; onboarding follows.
 */
async function setUpRecoveryAndPin(p, pin = PIN, hooks = {}) {
  const btn = (n) => p.getByRole('button', { name: n, exact: true }).locator('visible=true').last();
  await p.getByText('Set up recovery').first().waitFor({ state: 'visible' });
  // The first list has all twelve questions; once one is chosen the second list offers the other eleven, and it starts right after the first list.
  await p.getByRole('radio').locator('visible=true').nth(0).click();
  await p.getByRole('radio').locator('visible=true').nth(12).click();
  await p.getByLabel('Answer to the first question').fill(ANSWERS[0]);
  await p.getByLabel('Answer to the second question').fill(ANSWERS[1]);
  await btn('Create my account').click();
  await p.getByText('Save your Recovery Key').first().waitFor({ state: 'visible', timeout: 20000 });
  const key = await readKey(p);
  await p
    .getByRole('switch', { name: 'I have saved my Recovery Key somewhere safe' })
    .last()
    .check({ force: true });
  await btn('Continue').click();
  await p.getByText('Protect your account with a PIN').first().waitFor({ state: 'visible' });
  await enterPin(p, pin);
  await p.getByText('Confirm your PIN').first().waitFor({ state: 'visible' });
  await enterPin(p, pin);
  await btn('Protect my account').click();
  return key;
}

/** Reads the Recovery Key from the screen (three rows of three groups) and returns it grouped with dashes. */
async function readKey(p) {
  const label = await p
    .getByLabel(/^Your Recovery Key:/)
    .first()
    .getAttribute('aria-label');
  return label.replace('Your Recovery Key: ', '').replace(/, /g, '-');
}

/** From the guest home (or the account screen) to the onboarding form. Returns the Recovery Key that was shown. */
async function createAccountViaPin(p, pin = PIN, hooks = {}) {
  const create = () =>
    p.getByRole('button', { name: 'Create account', exact: true }).locator('visible=true').last();
  // From the guest card to the account screen to the questions: press "Create account" until the recovery screen is there (a screen can still be sliding in or out).
  for (let i = 0; i < 4; i++) {
    if (
      await p
        .getByText('Set up recovery')
        .first()
        .isVisible()
        .catch(() => false)
    )
      break;
    await create()
      .click({ timeout: 8000 })
      .catch(() => undefined);
    await p.waitForTimeout(700);
  }
  const key = await setUpRecoveryAndPin(p, pin, hooks);
  await p.getByLabel('What should we call you?').waitFor({ state: 'visible' });
  return key;
}

/** Unlocks the lock screen with the PIN when it is showing. */
async function unlockIfLocked(p, pin = PIN) {
  const locked = await p
    .getByText('Enter your PIN')
    .first()
    .waitFor({ state: 'visible', timeout: 7000 })
    .then(() => true)
    .catch(() => false);
  if (locked) {
    await enterPin(p, pin);
    await p.getByText('Enter your PIN').first().waitFor({ state: 'hidden' });
  }
}

/** Fills in onboarding from the first screen to the home screen (the steps every suite repeats). */
async function onboard(
  p,
  { name = 'Sam', birth = '1990-05-05', country = 'Aus', pick = 'Australia' } = {},
) {
  const btn = (n) => p.getByRole('button', { name: n }).locator('visible=true').last();
  await p.getByLabel('What should we call you?').fill(name);
  await p.getByLabel('Date of birth (YYYY-MM-DD)').fill(birth);
  await p.getByLabel('Country or region').fill(country);
  await p.getByText(pick, { exact: false }).last().click();
  await btn('Continue').click();
  await p.getByText('Your privacy').first().waitFor({ state: 'visible' });
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
}

module.exports = {
  PIN,
  ANSWERS,
  enterPin,
  createAccountViaPin,
  setUpRecoveryAndPin,
  readKey,
  unlockIfLocked,
  onboard,
};
