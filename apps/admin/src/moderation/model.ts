// Pure rules for the moderation console: what an item needs, how urgent it is, how far behind the queue is, and the written procedure for each kind of report.
import { MODERATION_TARGETS } from '@dancehall/shared';

export interface QueueMedia {
  kind: 'photo' | 'video';
  role: 'single' | 'before' | 'after';
  uri: string;
  durationS?: number | null;
}
export interface QueueItem {
  id: string;
  targetType: 'post' | 'comment';
  /** Public username only. The console never receives an account id or email. */
  author: string;
  body: string;
  status: 'held' | 'hidden' | 'published';
  flags: string[];
  reasons: string[];
  reportCount: number;
  urgent: boolean;
  ageHours: number;
  createdAt: string;
  media: QueueMedia[];
}
export interface Backlog {
  open: number;
  urgent: number;
  media: number;
  oldestHours: number;
  oldestUrgentHours: number;
  urgentOverTarget: number;
  overTarget: number;
  urgentTargetHours: number;
  targetHours: number;
  /** What a moderator set, and what is in effect (photos and videos also pause by themselves when review cannot keep up). */
  mode?: Mode;
  effectiveMode?: Mode;
}
export type Mode = 'open' | 'text_only' | 'read_only';
export const MODE_LABELS: Record<Mode, string> = {
  open: 'Open',
  text_only: 'Text only (photos and videos paused)',
  read_only: 'Read only (no new posts or comments)',
};

export type Level = 'clear' | 'ok' | 'attention' | 'overdue';
/** One plain headline for the top of the console. Overdue urgent items always win. */
export function backlogStatus(b: Backlog): { level: Level; headline: string } {
  if (b.urgentOverTarget > 0)
    return {
      level: 'overdue',
      headline: `${b.urgentOverTarget} urgent ${b.urgentOverTarget === 1 ? 'item is' : 'items are'} past the ${b.urgentTargetHours}-hour target. Handle these first.`,
    };
  if (b.urgent > 0)
    return {
      level: 'attention',
      headline: `${b.urgent} urgent ${b.urgent === 1 ? 'item needs' : 'items need'} a look now.`,
    };
  if (b.overTarget > 0)
    return {
      level: 'attention',
      headline: `${b.overTarget} ${b.overTarget === 1 ? 'item is' : 'items are'} past the ${b.targetHours}-hour target.`,
    };
  if (b.open === 0) return { level: 'clear', headline: 'Nothing is waiting.' };
  return {
    level: 'ok',
    headline: `${b.open} ${b.open === 1 ? 'item' : 'items'} waiting, all within target.`,
  };
}

export function ageLabel(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours < 48) return `${Math.floor(hours)} h`;
  return `${Math.floor(hours / 24)} days`;
}
export const isOverdue = (i: Pick<QueueItem, 'urgent' | 'ageHours'>): boolean =>
  i.ageHours > (i.urgent ? MODERATION_TARGETS.urgentHours : MODERATION_TARGETS.normalHours);

/** Urgent first, then reported, then oldest first. The database already orders the queue this way; the console keeps the guarantee even if that changes. */
export function sortQueue(items: QueueItem[]): QueueItem[] {
  const rank = (i: QueueItem) => (i.urgent ? 0 : i.reportCount > 0 ? 1 : 2);
  return [...items].sort(
    (a, b) => rank(a) - rank(b) || b.ageHours - a.ageHours || a.id.localeCompare(b.id),
  );
}

export interface Playbook {
  title: string;
  /** Needs a decision within the urgent target. */
  urgent: boolean;
  steps: string[];
}
const MEDIA_STEPS = [
  'Look at every photo and video in full before approving.',
  'Remove anything showing a child, nudity, someone who has not clearly agreed to be shown, or a place that identifies where someone lives.',
  'Remove before-and-after pairs that shame a body or promote fast weight loss.',
  'Approve only if you would be comfortable with it being the first thing a new member sees. If unsure, remove.',
];
/** The written procedure for each reason. The full text lives in docs/COMMUNITY_MODERATION.md; the console shows the same steps at the point of decision. */
export function playbookFor(item: Pick<QueueItem, 'reasons' | 'flags' | 'media'>): Playbook {
  const all = new Set([...item.reasons, ...item.flags]);
  if (all.has('self_harm'))
    return {
      title: 'Someone may need help (urgent)',
      urgent: true,
      steps: [
        'Keep it hidden. Do not approve it.',
        'Do not contact the member outside the app and do not guess where they are.',
        'Record the action. Tell the named escalation contact the same day so they can decide what support to offer.',
        'If the text says someone is in immediate danger and you have a safe way to reach emergency services for the member’s area, follow the escalation procedure in docs/COMMUNITY_MODERATION.md.',
        'Do not penalise the member for asking for help. Restrict only if they also broke another rule.',
      ],
    };
  if (all.has('private_information'))
    return {
      title: 'Private information (urgent)',
      urgent: true,
      steps: [
        'Remove it now.',
        'If it was shared on purpose or more than once, mute the member for 24 hours.',
        'Never copy the information anywhere else.',
      ],
    };
  if (all.has('body_shaming_or_eating_concern') || all.has('ed_content'))
    return {
      title: 'Body shaming or disordered eating',
      urgent: false,
      steps: [
        'Remove it.',
        'Mute the member for 24 hours if it targets someone else.',
        'Do not engage with the member about their own health. The app already offers support information.',
      ],
    };
  if (all.has('harassment'))
    return {
      title: 'Harassment',
      urgent: false,
      steps: [
        'Remove the content.',
        'First time: mute for 24 hours. Repeat: mute for 7 days. Serious or repeated after that: suspend.',
        'Reporters are never told who they are reported by or what you decided about the member.',
      ],
    };
  if (
    all.has('unsafe_advice') ||
    all.has('health_claim') ||
    all.has('weight_claim') ||
    all.has('health_numbers')
  )
    return {
      title: 'Health claim or numbers',
      urgent: false,
      steps: [
        'Remove if it promotes fast weight loss, a medicine, a diet product or specific numbers about someone’s body.',
        'Approve if it is a harmless mention that the screening caught by accident.',
        'Do not edit a member’s words. Approve or remove only.',
      ],
    };
  if (all.has('spam'))
    return {
      title: 'Spam or selling',
      urgent: false,
      steps: ['Remove it.', 'Mute for 24 hours; suspend if it continues.'],
    };
  if (item.media.length > 0 || all.has('media_review'))
    return { title: 'Photo or video review', urgent: false, steps: MEDIA_STEPS };
  return {
    title: 'Review',
    urgent: false,
    steps: [
      'Read it in context.',
      'Approve if it is kind, honest and follows the guidelines. Remove if not. If unsure, remove: members can post again.',
    ],
  };
}

export type RestrictInput = {
  restriction: 'none' | 'muted' | 'suspended';
  hours?: number | null;
  reason?: string;
  note?: string;
};
export const RESTRICT_REASONS = [
  'harassment',
  'unsafe_content',
  'spam',
  'impersonation',
  'other',
] as const;
/** Checks a restriction before it is sent. Suspending needs a reason; a note is kept in the audit trail's companion record, never public. */
export function validateRestriction(i: RestrictInput): string | null {
  if (i.restriction === 'none') return null;
  if (!RESTRICT_REASONS.includes(i.reason as (typeof RESTRICT_REASONS)[number]))
    return 'Choose a reason.';
  if (
    i.hours !== null &&
    i.hours !== undefined &&
    (!Number.isInteger(i.hours) || i.hours < 1 || i.hours > 8760)
  )
    return 'Choose a length between 1 hour and one year, or leave it open-ended.';
  if (i.restriction === 'suspended' && (i.note ?? '').trim().length < 5)
    return 'Add a short note saying why. It is kept for the record.';
  return null;
}
export const needsNote = (action: 'approve' | 'remove' | 'restore'): boolean => action === 'remove';
