import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { useAccount } from './AccountProvider';

/** The PIN and Face ID or Touch ID settings, for someone who has an account. */
export function SecurityCard() {
  const { colors } = useTheme();
  const a = useAccount();
  if (!a.ready || !a.pinSet) return null;
  const kind = a.biometric.kind ? t(`pin.kind.${a.biometric.kind}` as StringKey) : '';
  return (
    <Card>
      <AppText variant="heading" accessibilityRole="header">
        {t('sec.title')}
      </AppText>
      <AppText muted>{t('sec.pinOn')}</AppText>
      {a.biometric.available ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <View style={{ flex: 1 }}>
            <AppText variant="label">{t('sec.bio', { kind })}</AppText>
            <AppText variant="caption" muted>
              {t('sec.bioBody', { kind })}
            </AppText>
          </View>
          <Switch
            accessibilityLabel={t('sec.bio', { kind })}
            value={a.biometric.enabled}
            onValueChange={(v) => void a.setBiometricEnabled(v)}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      ) : null}
      <Button
        variant="secondary"
        label={t('sec.changePin')}
        onPress={() => router.push('/account/pin?mode=change')}
      />
      <Button variant="secondary" label={t('sec.lockNow')} onPress={a.lockNow} />
    </Card>
  );
}
