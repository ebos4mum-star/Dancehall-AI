/** Up to two letters for the identity badge: first letters of the first two words, or "?" when there is no usable name. */
export function initials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  const letters = words
    .slice(0, 2)
    .map((w) => Array.from(w)[0] ?? '')
    .join('');
  return letters ? letters.toLocaleUpperCase() : '?';
}
