/** "just now", "5m", "3h", or a short date. Pure, so it is tested. */
export function timeAgo(iso: string, now: Date): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.floor((now.getTime() - t) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}h`;
  if (min < 7 * 24 * 60) return `${Math.floor(min / (24 * 60))}d`;
  return new Date(t).toISOString().slice(0, 10);
}

/** Guess a media type from a file name when the picker does not give one. */
export function mimeFromUri(uri: string, kind: 'photo' | 'video'): string {
  const ext = uri.split('?')[0]!.split('.').pop()?.toLowerCase() ?? '';
  const known: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
  };
  return known[ext] ?? (kind === 'photo' ? 'image/jpeg' : 'video/mp4');
}
