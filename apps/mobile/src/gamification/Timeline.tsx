import { useMemo } from 'react';
import { View } from 'react-native';
import { BADGE_IDS, type BadgeId } from '@dancehall/shared';
import { t, type StringKey } from '@/i18n';
import { brand, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { SectionTitle } from '@/ui/kit';
import { BadgeArt } from './art';
import {
  BADGE_XP,
  badgeMilestones,
  formatDay,
  historyIsComplete,
  qualifiedBadgeDays,
  type BadgeBasis,
  type BadgeMilestone,
} from './history';
import { useProgression } from './progressionStore';

const SENTENCE: Record<BadgeBasis, (day: string | null) => string> = {
  qualified: (d) => `Earned ${formatDay(d!)}`,
  recorded: (d) =>
    `Recorded ${formatDay(d!)}. This is the day this phone first saw it; it may have been earned earlier.`,
  earlier: () => 'Earned before this phone started tracking. The date is not known.',
};

/**
 * Badge milestones with honest dates. "Earned" only when the records cover the whole history and the app's own rules, replayed on them, name the day. "Recorded" when this
 * phone first saw the badge after its baseline. Otherwise no date at all. A first-sync day is never shown as the day a badge was earned.
 */
export function BadgeTimelineCard() {
  const p = useProgression();
  const { colors } = useTheme();
  const badges = useMemo(() => (p.state?.badges ?? []) as BadgeId[], [p.state?.badges]);
  const complete = useMemo(() => {
    if (!p.history || !p.state) return false;
    return historyIsComplete({
      firstRecord: p.history.firstRecord,
      today: p.history.today,
      confirmedActivityXp: p.state.totalXp - badges.length * BADGE_XP,
      localActivityXp: p.history.localActivityXp,
    });
  }, [p.history, p.state, badges.length]);
  const qualified = useMemo(
    () => (complete && p.history ? qualifiedBadgeDays(p.history.input, badges) : null),
    [complete, p.history, badges],
  );
  const items = useMemo(
    () => badgeMilestones({ badges, qualified, complete, recorded: p.badgeRecorded }),
    [badges, qualified, complete, p.badgeRecorded],
  );
  if (!p.ready || !p.enabled || !p.state) return null;
  const dated = items.filter((x) => x.day);
  const undated = items.filter((x) => !x.day);

  const row = (m: BadgeMilestone, last: boolean) => {
    const name = t(`gm.b.${m.id}` as StringKey);
    const sentence = SENTENCE[m.basis](m.day);
    return (
      <View
        key={m.id}
        accessible
        accessibilityLabel={`${name}. ${sentence}`}
        style={{ flexDirection: 'row', gap: spacing.md, minHeight: 64 }}
      >
        <View style={{ alignItems: 'center', width: 18 }}>
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              marginTop: 8,
              backgroundColor: m.basis === 'qualified' ? brand.lime : 'transparent',
              borderWidth: 3,
              borderColor: m.basis === 'earlier' ? colors.border : brand.violet,
            }}
          />
          {last ? null : (
            <View
              style={{
                flex: 1,
                width: 3,
                marginTop: 2,
                borderRadius: 2,
                backgroundColor: colors.border,
              }}
            />
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm, flex: 1, paddingBottom: spacing.md }}>
          <BadgeArt id={m.id} earned size={44} />
          <View style={{ flex: 1 }}>
            <AppText variant="label">{name}</AppText>
            <AppText variant="caption" muted>
              {sentence}
            </AppText>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Card>
      <SectionTitle icon="time" title="Milestones" />
      {items.length === 0 ? (
        <AppText variant="caption" muted>
          Your first badge will appear here, with its date.
        </AppText>
      ) : (
        <>
          <View>{dated.map((m, k) => row(m, k === dated.length - 1 && undated.length === 0))}</View>
          {undated.length > 0 ? (
            <View>
              <AppText
                variant="label"
                accessibilityRole="header"
                style={{ marginBottom: spacing.xs }}
              >
                Earlier
              </AppText>
              {undated.map((m, k) => row(m, k === undated.length - 1))}
            </View>
          ) : null}
        </>
      )}
      <AppText variant="caption" muted>
        {complete
          ? 'Your records cover your whole history, so each date is the day the app’s rules first gave you the badge.'
          : 'Dates are shown only when they can be known. Where they cannot, the badge is listed without one.'}{' '}
        {BADGE_IDS.length} badges exist; none are ever taken away.
      </AppText>
    </Card>
  );
}
