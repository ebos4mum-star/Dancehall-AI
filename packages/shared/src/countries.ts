/**
 * Country activation. No country is active by default. Activation requires every gate to be
 * verified by a person (recorded in the admin portal in a later phase). This module only models the rule.
 */
export const ACTIVATION_GATES = [
  'privacy_law_reviewed',
  'billing_and_tax_reviewed',
  'nutrition_content_reviewed',
  'content_rights_cleared',
  'safety_and_support_resources',
  'store_availability_confirmed',
] as const;
export type ActivationGate = (typeof ACTIVATION_GATES)[number];

export interface CountryActivation {
  /** ISO 3166-1 alpha-2 */
  country: string;
  gates: Readonly<Partial<Record<ActivationGate, boolean>>>;
  /** Manual master switch; both the switch and every gate must be true. */
  enabled: boolean;
}

export function missingGates(c: CountryActivation): ActivationGate[] {
  return ACTIVATION_GATES.filter((g) => c.gates[g] !== true);
}

export function isCountryActive(c: CountryActivation | undefined): boolean {
  return !!c && c.enabled && missingGates(c).length === 0;
}
