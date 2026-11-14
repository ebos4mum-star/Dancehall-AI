import Constants from 'expo-constants';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Card } from '@/ui/Card';
import { FadeIn } from '@/ui/FadeIn';
import { Screen } from '@/ui/Screen';

export default function MeScreen() {
  return (
    <Screen title={t('me.title')}>
      <FadeIn>
        <Card>
          <AppText variant="heading">{t('me.privacyTitle')}</AppText>
          <AppText muted>{t('me.privacyBody')}</AppText>
        </Card>
      </FadeIn>
      <AppText variant="caption" muted>
        {t('me.version')} {Constants.expoConfig?.version ?? '0.0.0'}
      </AppText>
    </Screen>
  );
}
