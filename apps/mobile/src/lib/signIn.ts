/** Pure helpers for the email-code sign-in screen, kept out of the component so they can be unit-tested. */

/** Seconds a user must wait before asking for another code (Supabase also rate-limits server-side). */
export const RESEND_COOLDOWN_SECONDS = 30;

/** Pragmatic check: one "@", a non-empty local part, and a dotted domain. The server remains the authority. */
export function isValidEmail(raw: string): boolean {
  const email = raw.trim();
  if (email.length > 254 || /\s/.test(email)) return false;
  return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(email);
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Keeps digits only, so pasted codes like "123 456" or "123-456" work. Capped at 8 digits. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 8);
}

export function isCompleteCode(code: string): boolean {
  return /^\d{6,8}$/.test(code);
}
