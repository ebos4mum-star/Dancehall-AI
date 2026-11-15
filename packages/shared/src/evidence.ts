import type { ReviewStatus } from './instruction-media';
import { unsafeOutputProblems } from './coach-safety';
import type { PathwayId } from './wellness';

/**
 * Evidence labels and the review gate for health guidance. PROVISIONAL: the gate is a floor in code; qualified reviewers still decide the content.
 *
 * Four labels, shown the same way everywhere:
 *  - strong: consistent findings from systematic reviews or major guidelines (named sources required)
 *  - moderate: mixed, short-term or limited findings (named sources required)
 *  - traditional: culturally important practice with limited clinical testing; shown with respect, never as a health claim
 *  - unsupported: a claim the app will not endorse; it may only be shown as an explanation of why not
 *
 * Stage A ships NO content items. This module only decides what could ever be shown: an item with no approved, independent review is never returned.
 */
export const EVIDENCE_LEVELS = ['strong', 'moderate', 'traditional', 'unsupported'] as const;
export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];

export const REVIEWER_ROLES = [
  'registered_dietitian',
  'clinician',
  'certified_strength_coach',
  'physiotherapist',
  'exercise_physiologist',
  'cultural_reviewer',
] as const;
export type ReviewerRole = (typeof REVIEWER_ROLES)[number];

export interface ContentSource {
  title: string;
  publisher: string;
  year: number;
  url?: string;
}
export interface ContentReview {
  status: ReviewStatus;
  reviewerRole?: ReviewerRole;
  /** Reference to the review record (never personal data). */
  evidenceRef?: string;
  reviewedOn?: string;
  /** The reviewer must not be the author. */
  isAuthor?: boolean;
}
export interface ContentItem {
  id: string;
  pathway: PathwayId;
  title: string;
  body: string;
  evidence: EvidenceLevel;
  /** How the item may be shown. `explain_why_not` is the only way an `unsupported` item may appear. */
  kind: 'education' | 'explain_why_not';
  sources: ContentSource[];
  review: ContentReview;
}

/** Everything wrong with an item that would stop it being shown. An empty list means it may be shown. */
export function contentProblems(item: ContentItem): string[] {
  const p: string[] = [];
  if (!item.title.trim() || !item.body.trim()) p.push('empty title or body');
  if (item.review.status !== 'approved') p.push('not approved');
  if (!item.review.reviewerRole || !item.review.evidenceRef || !item.review.reviewedOn)
    p.push('review record incomplete');
  if (item.review.isAuthor !== false) p.push('reviewer must be independent of the author');
  if ((item.evidence === 'strong' || item.evidence === 'moderate') && item.sources.length === 0)
    p.push('strong or moderate evidence needs named sources');
  if (item.evidence === 'unsupported' && item.kind !== 'explain_why_not')
    p.push('unsupported claims may only be shown as an explanation of why not');
  if (item.kind === 'explain_why_not' && item.evidence !== 'unsupported')
    p.push('explain_why_not is only for unsupported claims');
  for (const t of [item.title, item.body])
    for (const q of unsafeOutputProblems(t)) p.push(`language: ${q}`);
  return p;
}

/** The only way to get content out: items with no problems, for the given pathways, in a stable order. */
export function renderableContent(
  items: readonly ContentItem[],
  pathways?: readonly PathwayId[],
): ContentItem[] {
  return items
    .filter((i) => contentProblems(i).length === 0)
    .filter((i) => !pathways || pathways.includes(i.pathway))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** The registry. Intentionally empty in Stage A: no health guidance is published until a qualified reviewer approves it. */
export const CONTENT_ITEMS: readonly ContentItem[] = [];

export const EVIDENCE_LABELS: Record<EvidenceLevel, string> = {
  strong: 'Strong evidence',
  moderate: 'Moderate or emerging evidence',
  traditional: 'Traditional practice, limited clinical evidence',
  unsupported: 'Not supported',
};
