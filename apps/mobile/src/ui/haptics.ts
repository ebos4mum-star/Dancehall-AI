import * as Haptics from 'expo-haptics';

// Haptics mark meaningful moments only (a deliberate tap, a capture, a save). Unsupported devices simply ignore them.
const safe = (p: Promise<unknown>) => void p.catch(() => undefined);
export const haptics = {
  tap: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  capture: () => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** A short two-beat pattern for milestones and completed challenges. Uses only the success notification and one medium tap. */
  celebrate: () => {
    safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    setTimeout(() => safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)), 180);
  },
};
