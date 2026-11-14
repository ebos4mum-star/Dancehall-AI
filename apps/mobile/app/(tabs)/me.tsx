import { View } from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useApp } from '@/data/AppProvider';
import { useDanceData } from '@/dance/hooks';
import { t, type StringKey } from '@/i18n';
import { formatDate } from '@/lib/format';
import { initials } from '@/lib/initials';
import { useProgressInsights } from '@/progress/hooks';
import { brand, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { HeroCard } from '@/ui/Depth';
import { FadeIn } from '@/ui/FadeIn';
import { Reveal } from '@/ui/motion';
import { Screen } from '@/ui/Screen';
import { StatTile } from '@/ui/StatTile';

export default function MeScreen() {
  const { profile } = useApp();
  const { colors } = useTheme();
  const dance = useDanceData();
  const insights = useProgressInsights();
  const recent = insights.achievements.slice(0, 3);
  const name = profile?.displayName ?? null;
  return (
    <Screen title={t('me.title')}>
      <Reveal>
        <HeroCard world="me">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <View
              accessible
              accessibilityLabel={name ?? t('me.title')}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: brand.lime,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <AppText variant="heading" style={{ color: brand.plum }}>
                {initials(name)}
              </AppText>
            </View>
            <AppText
              variant="title"
              accessibilityRole="header"
              style={{ color: colors.onHero, flex: 1 }}
            >
              {name ?? t('me.title')}
            </AppText>
          </View>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <StatTile value={dance.summary.thisWeek.sessions} label={t('me.statSessions')} />
            <StatTile value={insights.habits.movedDays} label={t('me.statDays')} />
            <StatTile value={insights.achievements.length} label={t('me.statMilestones')} />
          </View>
        </HeroCard>
      </Reveal>
      {recent.length > 0 ? (
        <FadeIn>
          <Card>
            <AppText variant="heading" accessibilityRole="header">
              {t('me.recent')}
            </AppText>
            {recent.map((a) => (
              <View key={a.id} accessible style={{ gap: 2 }}>
                <AppText>{t(`ach.${a.id}.title` as StringKey)}</AppText>
                <AppText variant="caption" muted>
                  {t('ach.earnedOn', { date: formatDate(a.earnedOn) })}
                </AppText>
              </View>
            ))}
            <Button
              variant="secondary"
              label={t('me.allMilestones')}
              onPress={() => router.push('/progress')}
            />
          </Card>
        </FadeIn>
      ) : null}
      <FadeIn>
        <Card>
          <Button label={t('me.progress')} onPress={() => router.push('/progress')} />
          <Button variant="secondary" label={t('me.goals')} onPress={() => router.push('/goals')} />
          <Button
            variant="secondary"
            label={t('me.challenges')}
            onPress={() => router.push('/challenges')}
          />
          <Button
            variant="secondary"
            label={t('me.privacy')}
            onPress={() => router.push('/privacy')}
          />
        </Card>
      </FadeIn>
      <Card>
        <AppText variant="heading">{t('me.privacyTitle')}</AppText>
        <AppText muted>{t('me.privacyBody')}</AppText>
      </Card>
      <AppText variant="caption" muted>
        {t('me.version')} {Constants.expoConfig?.version ?? '0.0.0'}
      </AppText>
    </Screen>
  );
}
