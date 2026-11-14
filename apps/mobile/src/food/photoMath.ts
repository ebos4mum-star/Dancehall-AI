// Pure helpers (no native modules) so they can be unit-tested.
export const MAX_EDGE_PX = 1024;
export const JPEG_QUALITY = 0.7;

/** Size that fits inside `maxEdge` on the longest side, keeping the aspect ratio (never enlarges). */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number = MAX_EDGE_PX,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest <= 0) return { width, height };
  const k = maxEdge / longest;
  return { width: Math.round(width * k), height: Math.round(height * k) };
}

/** Stable small seed derived from a string (used only to vary simulated results between photos). */
export function seedFrom(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 100003;
  return h;
}
