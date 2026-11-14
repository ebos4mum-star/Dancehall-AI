/** All user-facing strings live in a locale file so more languages can be added without touching screens. */
export const en = {
  'tabs.today': 'Today',
  'tabs.dance': 'Dance',
  'tabs.food': 'Food',
  'tabs.coach': 'Coach',
  'tabs.me': 'Me',
  'today.title': 'Today',
  'today.emptyTitle': 'Your day starts here',
  'today.emptyBody':
    'Your plan, workouts and meals will appear here once those features are switched on. Nothing is scheduled yet.',
  'dance.title': 'Dance',
  'dance.emptyTitle': 'The dance library is on its way',
  'dance.emptyBody':
    'Workouts need licensed music and video, which are not in place yet. We will not show placeholder classes.',
  'food.title': 'Food',
  'food.emptyTitle': 'No meals logged',
  'food.emptyBody':
    'Food logging and photo estimates are coming. Photo results will always be labeled as estimates that you can edit.',
  'coach.title': 'Coach',
  'coach.emptyTitle': 'Your Fit Concierge is not switched on',
  'coach.emptyBody': 'The coach is not available in this early build. No AI service is connected.',
  'me.title': 'Me',
  'me.privacyTitle': 'Your health information is private',
  'me.privacyBody':
    'Your weight, food and health records stay private to you unless you choose to share something.',
  'me.version': 'Version',
  'a11y.estimateBadge': 'Estimate',
} as const;
export type StringKey = keyof typeof en;
