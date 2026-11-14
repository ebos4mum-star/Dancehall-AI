import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useApp } from '@/data/AppProvider';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import { Screen } from '@/ui/Screen';

export default function MeScreen() {
  const { profile } = useApp();
  return (
    <Screen title={profile?.displayName ?? t('me.title')}>
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
