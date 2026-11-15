/**
 * Whether internal test fixtures are switched on. Off unless the development build explicitly enables them (see fixtures.ts). Kept in its own tiny module so the
 * content modules can read it without importing each other. Production configuration refuses to enable it.
 */
let on = false;
export const fixturesEnabled = (): boolean => on;
export function setFixturesEnabled(v: boolean): void {
  on = v;
}
