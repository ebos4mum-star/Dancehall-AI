import { View } from 'react-native';
import {
  composedReview,
  strengthWorkoutReview,
  workoutReview,
  type ReviewItem,
} from '@dancehall/shared';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Disclosure } from '@/ui/kit';
import type { SessionContent } from './content';

/** The review requirements of a draft, from the shared review workflow. Null for anything that is not a draft. */
export function reviewItemFor(w: SessionContent): ReviewItem | null {
  if (!w.draft) return null;
  if (w.home) return composedReview(w.title, w.id, 'use-what-you-have', w.exercises ?? []);
  if (w.dance) return workoutReview(w.dance);
  if (w.strength) return strengthWorkoutReview(w.strength);
  return null;
}

/**
 * What a draft still needs before it can be published: exercise safety, choreography authenticity, cultural review and media rights, each with who has to do it.
 * It states what is outstanding. It never says anything has been reviewed.
 */
export function ReviewNeeds({ w }: { w: SessionContent }) {
  const item = reviewItemFor(w);
  if (!item) return null;
  const open = item.requirements.filter((r) => r.status === 'outstanding');
  if (open.length === 0) return null;
  return (
    <Disclosure title={t('review.title')} summary={t('review.count', { n: open.length })}>
      <View style={{ gap: spacing.sm }}>
        <AppText variant="caption" muted>
          {t('review.intro')}
        </AppText>
        {open.map((r) => (
          <View key={r.id} style={{ gap: 2 }}>
            <AppText variant="label">{r.label}</AppText>
            <AppText variant="caption" muted>{`${t('review.by')}: ${r.by}`}</AppText>
            <AppText variant="caption">{r.detail}</AppText>
          </View>
        ))}
      </View>
    </Disclosure>
  );
}
