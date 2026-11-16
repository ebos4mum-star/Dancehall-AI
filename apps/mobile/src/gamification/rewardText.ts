import { t, type StringKey } from '../i18n';
import type { RewardSummary } from './rewards';

/** The words for a reward, one line per thing earned. Used by the banner (shown) and its accessible label (read aloud), so they can never differ. */
export function rewardLines(s: RewardSummary, groupGoal?: string): string[] {
  const out: string[] = [];
  if (groupGoal) out.push(t('gm.reward.group', { name: groupGoal }));
  if (s.xpGained > 0) out.push(t('gm.reward.xp', { n: s.xpGained }));
  if (s.importedWorkouts > 0) out.push(t('gm.reward.imported', { n: s.importedWorkouts }));
  for (const q of s.questsDone)
    out.push(t('gm.reward.quest', { name: t(`gm.q.${q}` as StringKey) }));
  if (s.levelUp !== null) out.push(t('gm.reward.level', { n: s.levelUp }));
  if (s.streakMilestone !== null) out.push(t('gm.reward.streak', { n: s.streakMilestone }));
  for (const b of s.badges) out.push(t('gm.reward.badge', { name: t(`gm.b.${b}` as StringKey) }));
  for (const c of s.cosmetics)
    out.push(t('gm.reward.cosmetic', { name: t(`gm.c.${c}` as StringKey) }));
  if (s.seasonDone) out.push(t('gm.reward.season'));
  return out;
}
