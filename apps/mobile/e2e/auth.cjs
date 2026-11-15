/*
 * Shared steps for the browser suites now that the app opens as a guest and an account is made with a six-digit PIN (no email, no password).
 * `createAccountViaPin` goes from the guest home to the first onboarding screen, the way a person would: Create account, choose a PIN, confirm it.
 */
const PIN = '482916';

async function enterPin(p, pin = PIN) {
  for (const d of pin)
    await p.getByRole('button', { name: d, exact: true }).locator('visible=true').last().click();
}

/** From the guest home (or the account screen) to the onboarding form. */
async function createAccountViaPin(p, pin = PIN) {
  const create = () =>
    p.getByRole('button', { name: 'Create account', exact: true }).locator('visible=true').last();
  // From the guest card to the account screen to the PIN pad: press "Create account" until the PIN pad is there (a screen can still be sliding in or out).
  for (let i = 0; i < 4; i++) {
    if (
      await p
        .getByText('Create a PIN')
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
  await p.getByText('Create a PIN').first().waitFor({ state: 'visible' });
  await enterPin(p, pin);
  await p.getByText('Confirm your PIN').first().waitFor({ state: 'visible' });
  await enterPin(p, pin);
  await p.getByRole('button', { name: 'Create my account' }).locator('visible=true').last().click();
  await p.getByLabel('What should we call you?').waitFor({ state: 'visible' });
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

module.exports = { PIN, enterPin, createAccountViaPin, unlockIfLocked, onboard };
