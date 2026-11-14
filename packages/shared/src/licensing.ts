import type { WorkoutBlock } from './workouts';

export type LicenceStatus = 'draft' | 'cleared' | 'revoked';
export type AssetKind = 'music' | 'video' | 'instructor_likeness' | 'image' | 'other';
export interface Licence {
  id: string;
  assetKind: AssetKind;
  title: string;
  status: LicenceStatus;
  /** ISO 3166-1 alpha-2 codes, or "*" for worldwide. */
  territories: string[];
  startsOn: string;
  endsOn: string | null;
  /** Reference to the signed agreement (never the agreement itself). Required before a licence can be cleared. */
  evidenceRef: string | null;
}
export interface MediaAsset {
  id: string;
  workoutId: string;
  kind: 'video' | 'audio' | 'image';
  licenceId: string;
  durationS: number | null;
}

/** Mirrors the database function `app.licence_allows`: cleared, in date, and covering the territory. */
export function licenceAllows(
  l: Licence | undefined,
  country: string | null | undefined,
  today: string,
): boolean {
  if (!l || l.status !== 'cleared') return false;
  if (l.startsOn > today || (l.endsOn !== null && l.endsOn < today)) return false;
  if (l.territories.includes('*')) return true;
  return !!country && l.territories.includes(country);
}

export type Playback =
  | { mode: 'guided_text'; reason: 'no_media' | 'not_cleared' }
  | { mode: 'media'; assets: MediaAsset[] };

/**
 * How a workout may be presented in a country. Media is offered only if EVERY attached asset (video, music, likeness) is cleared there,
 * so licensed video is never shown with unlicensed music. Otherwise the text-guided session is used.
 */
export function playbackFor(
  assets: readonly MediaAsset[],
  licences: readonly Licence[],
  country: string | null | undefined,
  today: string,
): Playback {
  if (assets.length === 0) return { mode: 'guided_text', reason: 'no_media' };
  const byId = new Map(licences.map((l) => [l.id, l]));
  const allCleared = assets.every((a) => licenceAllows(byId.get(a.licenceId), country, today));
  return allCleared
    ? { mode: 'media', assets: [...assets] }
    : { mode: 'guided_text', reason: 'not_cleared' };
}

export interface PublishCheckItem {
  id: 'original' | 'review' | 'licences' | 'structure' | 'safety';
  label: string;
  passed: boolean;
  detail?: string;
}
export interface PublishCheck {
  ok: boolean;
  items: PublishCheckItem[];
}

/** Structural safety rules: warm-up, cool-down, and a low-impact version of every block. Also enforced by the database. */
export function structureProblems(blocks: readonly WorkoutBlock[]): string[] {
  const out: string[] = [];
  if (!blocks.some((b) => b.kind === 'warmup')) out.push('no warm-up');
  if (!blocks.some((b) => b.kind === 'cooldown')) out.push('no cool-down');
  if (!blocks.some((b) => b.kind === 'main')) out.push('no main section');
  if (blocks.some((b) => !b.lowImpactAlt || b.lowImpactAlt.trim() === ''))
    out.push('a block has no low-impact version');
  if (blocks.some((b) => !(b.seconds > 0))) out.push('a block has no duration');
  return out;
}

/**
 * The publication checklist for public release. Sample (synthetic) content can never pass the first item.
 * The review must come from someone other than the author (separation of duties).
 */
export function publishReadiness(args: {
  isSynthetic: boolean;
  createdBy?: string | null;
  blocks: readonly WorkoutBlock[];
  safety: readonly string[];
  reviews: ReadonlyArray<{
    type: 'fitness' | 'safety';
    outcome: 'approved' | 'changes_requested';
    reviewerId: string;
  }>;
  media: readonly MediaAsset[];
  licences: readonly Licence[];
  today: string;
}): PublishCheck {
  const approved = args.reviews.some(
    (r) => r.type === 'fitness' && r.outcome === 'approved' && r.reviewerId !== args.createdBy,
  );
  const byId = new Map(args.licences.map((l) => [l.id, l]));
  const unlicensed = args.media.filter((m) => {
    const l = byId.get(m.licenceId);
    return (
      !l ||
      l.status !== 'cleared' ||
      l.startsOn > args.today ||
      (l.endsOn !== null && l.endsOn < args.today)
    );
  });
  const problems = structureProblems(args.blocks);
  const items: PublishCheckItem[] = [
    {
      id: 'original',
      label: 'Real content (not a sample outline)',
      passed: !args.isSynthetic,
      detail: args.isSynthetic ? 'Sample content is for development builds only' : undefined,
    },
    {
      id: 'review',
      label: 'Approved by a certified fitness reviewer who is not the author',
      passed: approved,
    },
    {
      id: 'licences',
      label: 'Every video, music and likeness asset has a cleared, in-date licence',
      passed: unlicensed.length === 0,
      detail: unlicensed.length ? `${unlicensed.length} asset(s) not cleared` : undefined,
    },
    {
      id: 'structure',
      label: 'Warm-up, cool-down and a low-impact version of every block',
      passed: problems.length === 0,
      detail: problems.join('; ') || undefined,
    },
    { id: 'safety', label: 'Safety notes present', passed: args.safety.length > 0 },
  ];
  return { ok: items.every((i) => i.passed), items };
}
