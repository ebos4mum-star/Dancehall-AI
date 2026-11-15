import { GuestMe } from '@/account/guest';
import { SecurityCard } from '@/account/SecurityCard';
import { View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useApp } from '@/data/AppProvider';
import { useDanceData } from '@/dance/hooks';
import { t, type StringKey } from '@/i18n';
import { formatDate } from '@/lib/format';
import { initials } from '@/lib/initials';
import { useProgressInsights } from '@/progress/hooks';
import { useShowWeight } from '@/wellness/hooks';
import { brand, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { HeroCard } from '@/ui/Depth';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView } from 'react-native';
import { IconBadge, SectionTitle, type IconName } from '@/ui/kit';
import { PulseStage } from '@/pulse/PulseStage';
import { haptics } from '@/ui/haptics';
import { Reveal } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { StatTile } from '@/ui/StatTile';

const MENU: Array<{ icon: IconName; title: StringKey; sub: StringKey; to: string }> = [
  { icon: 'trending-up', title: 'me.progress', sub: 'me.progressSub', to: '/progress' },
  { icon: 'flag', title: 'me.goals', sub: 'me.goalsSub', to: '/goals' },
  { icon: 'trophy', title: 'me.challenges', sub: 'me.challengesSub', to: '/challenges' },
  { icon: 'shield-checkmark', title: 'me.privacy', sub: 'me.privacySub', to: '/privacy' },
];

function MeScreenAccount() {
  const { profile } = useApp();
  // The progress row says "Weight progress" only for people who track weight.
  const showW = useShowWeight();
  const { colors, spacing: sp, radius } = useTheme();
  const dance = useDanceData();
  const insights = useProgressInsights();
  const rowTitle = (m: (typeof MENU)[number]): StringKey =>
    m.to === '/progress' && !showW ? 'me.progressNoScale' : m.title;
  const rowSub = (m: (typeof MENU)[number]): StringKey =>
    m.to === '/progress' && !showW ? 'me.progressNoScaleSub' : m.sub;
  const recent = insights.achievements.slice(0, 6);
  const name = profile?.displayName ?? null;
  return (
    <Screen title={t('me.title')}>
      <Reveal>
        <HeroCard world="me">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            {/* The round slot on the left is reserved for the person's future avatar; initials stand in until then. */}
            <View
              accessible
              accessibilityLabel={name ?? t('me.title')}
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: brand.lime,
                borderWidth: 3,
                borderColor: brand.ivory,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="heading" style={{ color: brand.plum }}>
                {initials(name)}
              </AppText>
            </View>
            <View style={{ flex: 1 }}>
              <AppText variant="title" accessibilityRole="header" style={{ color: colors.onHero }}>
                {name ?? t('me.title')}
              </AppText>
              <AppText variant="caption" style={{ color: colors.onHero }}>
                {t('me.tagline')}
              </AppText>
            </View>
            <View style={{ width: 84, height: 78, overflow: 'hidden' }}>
              <PulseStage state="idle" size={84} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile value={dance.summary.thisWeek.sessions} label={t('me.statSessions')} />
            <StatTile value={insights.habits.movedDays} label={t('me.statDays')} />
            <StatTile value={insights.achievements.length} label={t('me.statMilestones')} />
          </View>
        </HeroCard>
      </Reveal>

      <SectionTitle
        icon="ribbon"
        title={t('me.recent')}
        action={recent.length > 0 ? t('me.allMilestones') : undefined}
        onAction={() => router.push('/progress')}
      />
      {recent.length === 0 ? (
        <Card>
          <AppText muted>{t('ach.empty')}</AppText>
        </Card>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: sp.sm }}
        >
          {recent.map((a) => (
            <View
              key={a.id}
              accessible
              accessibilityLabel={`${t(`ach.${a.id}.title` as StringKey)}, ${t('ach.earnedOn', { date: formatDate(a.earnedOn) })}`}
              style={{
                width: 132,
                alignItems: 'center',
                gap: sp.xs,
                padding: sp.md,
                borderRadius: radius.lg,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }}
            >
              <IconBadge name="ribbon" size={52} fill={brand.lime} />
              <AppText variant="label" style={{ textAlign: 'center' }}>
                {t(`ach.${a.id}.title` as StringKey)}
              </AppText>
              <AppText variant="caption" muted style={{ textAlign: 'center' }}>
                {formatDate(a.earnedOn)}
              </AppText>
            </View>
          ))}
        </ScrollView>
      )}

      <Card>
        {MENU.map((m, i) => (
          <Pressable
            key={m.to}
            accessibilityRole="button"
            accessibilityLabel={`${t(rowTitle(m))}. ${t(rowSub(m))}`}
            onPress={() => {
              haptics.tap();
              router.push(m.to as never);
            }}
            style={{
              minHeight: 64,
              flexDirection: 'row',
              alignItems: 'center',
              gap: sp.md,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
              paddingVertical: sp.sm,
            }}
          >
            <IconBadge name={m.icon} size={44} fill={colors.primary} color={colors.onPrimary} />
            <View style={{ flex: 1 }}>
              <AppText variant="label">{t(rowTitle(m))}</AppText>
              <AppText variant="caption" muted>
                {t(rowSub(m))}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </Pressable>
        ))}
      </Card>
      <SecurityCard />
      <Card>
        <View style={{ flexDirection: 'row', gap: sp.sm, alignItems: 'center' }}>
          <IconBadge name="lock-closed" size={36} fill={brand.violet} />
          <AppText variant="heading" style={{ flex: 1 }}>
            {t('me.privacyTitle')}
          </AppText>
        </View>
        <AppText muted>{t('me.privacyBody')}</AppText>
      </Card>
      <AppText variant="caption" muted>
        {t('me.version')} {Constants.expoConfig?.version ?? '0.0.0'}
      </AppText>
    </Screen>
  );
}

/** A guest sees the public version of this tab; a person with an account sees their own. */
export default function MeScreen() {
  const { session } = useApp();
  return session ? <MeScreenAccount /> : <GuestMe />;
}
