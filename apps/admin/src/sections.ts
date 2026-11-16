import type { Permission } from '@dancehall/shared';

/** Admin areas prepared for later phases. Each is gated by one permission; none has data or a live backend yet. */
export interface AdminSection {
  slug: string;
  title: string;
  permission: Permission;
  purpose: string;
  plannedPhase: string;
  /** Hard rules the future implementation must follow. */
  rules: string[];
}

export const SECTIONS: readonly AdminSection[] = [
  {
    slug: 'content',
    title: 'Content library',
    permission: 'content.edit',
    purpose: 'Create and review workouts, programs, recipes and food entries.',
    plannedPhase: 'Phase 3 (workouts), Phase 4 (nutrition)',
    rules: [
      'Publishing needs content.publish and a cleared licence record.',
      'Fitness and nutrition content needs a recorded professional review.',
    ],
  },
  {
    slug: 'licensing',
    title: 'Licensing records',
    permission: 'licensing.manage',
    purpose: 'Track rights for music, video and instructor likeness, by territory and expiry.',
    plannedPhase: 'Phase 3',
    rules: [
      'Content cannot go public without a cleared record for each territory it is shown in.',
      'Expired licences automatically unpublish dependent content.',
    ],
  },
  {
    slug: 'moderation',
    title: 'Moderation',
    permission: 'moderation.review',
    purpose: 'Review held and reported Community posts, comments, photos and clips.',
    plannedPhase: 'Phase 8',
    rules: [
      'No public user content before reporting, blocking and review exist.',
      'Moderators never see private health records.',
      'Queue shows usernames only: never account ids or emails.',
      'Acting requires the moderation.review permission and a second factor.',
    ],
  },
  {
    slug: 'flags',
    title: 'Feature flags',
    permission: 'flags.manage',
    purpose: 'Switch features and AI kill switches on or off, globally and by country.',
    plannedPhase: 'Phase 1',
    rules: ['Every change is written to the audit log.', 'All flags default to off.'],
  },
  {
    slug: 'ai-costs',
    title: 'AI cost monitoring',
    permission: 'ai_costs.view',
    purpose: 'Show spend against the monthly ceiling, per feature and per tier, with alerts.',
    plannedPhase: 'Phase 5',
    rules: ['Shows aggregate cost only, never user prompts or health data.'],
  },
  {
    slug: 'audit',
    title: 'Audit log',
    permission: 'audit.view',
    purpose: 'Append-only record of staff actions and configuration changes.',
    plannedPhase: 'Phase 1',
    rules: [
      'Entries cannot be edited or deleted.',
      'Any support access to account data is recorded with a reason.',
    ],
  },
];

export const findSection = (slug: string): AdminSection | undefined =>
  SECTIONS.find((s) => s.slug === slug);
