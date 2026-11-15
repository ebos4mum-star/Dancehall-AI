import { useCallback, useEffect, useState } from 'react';
import { Switch, View } from 'react-native';
import { router } from 'expo-router';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { useAccount } from './AccountProvider';

/** The PIN and Face ID or Touch ID settings, for someone who has an account. */
export function SecurityCard() {
  const { colors } = useTheme();
  const a = useAccount();
  const [pending, setPending] = useState<{ readyAt: number } | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const { cloud } = a;
  // Someone (perhaps not the owner) may have started a recovery: say so, and let the owner cancel it from here.
  const load = useCallback(async () => {
    const s = await cloud.status();
    setPending(s.ok ? s.pendingRecovery : null);
  }, [cloud]);
  useEffect(() => {
    if (a.ready && a.pinSet && a.backup !== 'none') void load();
  }, [a.ready, a.pinSet, a.backup, load]);
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
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label">{t('sec.recovery')}</AppText>
        <AppText variant="caption" muted>
          {a.backup === 'confirmed'
            ? t('sec.recoverySaved')
            : a.backup === 'pending'
              ? t('sec.recoveryPending')
              : t('sec.recoveryNone')}
        </AppText>
      </View>
      {pending ? (
        <View style={{ gap: spacing.sm }}>
          <Notice tone="warning">
            {t('sec.pendingRecovery', { time: new Date(pending.readyAt).toLocaleString() })}
          </Notice>
          <Button
            label={t('sec.cancelRecovery')}
            disabled={cancelling}
            onPress={() => {
              setCancelling(true);
              void cloud.cancelServerRecovery().then(async () => {
                await load();
                setCancelling(false);
              });
            }}
          />
        </View>
      ) : null}
      {a.backup === 'pending' ? (
        <Button
          label={t('sec.recoveryShow')}
          onPress={() => router.push('/account/recovery-key')}
        />
      ) : null}
      {a.backup === 'confirmed' ? (
        <Button
          variant="secondary"
          label={t('sec.recoveryRotate')}
          onPress={() => router.push('/account/rotate')}
        />
      ) : null}
      {cloud.kind === 'simulation' ? (
        <AppText variant="caption" muted>
          {t('sec.sim')}
        </AppText>
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
