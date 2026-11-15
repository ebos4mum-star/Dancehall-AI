import { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { PIN_LENGTH, digitsOnly } from '@dancehall/shared';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Notice } from '@/ui/Banner';
import { useAccount } from './AccountProvider';
import { PinPad } from './PinPad';

/**
 * Covers the app while it is locked. Face ID or Touch ID is offered first when the person turned it on, and the PIN pad is always there as the way in. A wrong PIN
 * says how many attempts are left; after that comes a timed wait, and after ten failures the PIN stops working on this phone and the person can sign out of it.
 */
export function LockScreen() {
  const { colors } = useTheme();
  const a = useAccount();
  const [entry, setEntry] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const triedBio = useRef(false);
  const kind = a.biometric.kind ? t(`pin.kind.${a.biometric.kind}` as StringKey) : '';

  const submit = useCallback(
    async (pin: string) => {
      setBusy(true);
      try {
        const r = await a.unlockWithPin(pin);
        if (r.ok) return;
        setMessage(
          r.reason === 'wrong'
            ? r.lockedForS > 0
              ? t('lock.locked', { s: r.lockedForS })
              : r.attemptsLeft <= 1
                ? t('lock.wrongLast')
                : t('lock.wrong', { n: r.attemptsLeft })
            : r.reason === 'locked'
              ? t('lock.locked', { s: r.lockedForS })
              : r.reason === 'reset_required'
                ? t('lock.reset')
                : t('pin.err.format'),
        );
      } finally {
        setEntry('');
        setBusy(false);
      }
    },
    [a],
  );

  // Offer the biometric once when the screen appears.
  useEffect(() => {
    if (triedBio.current || !a.biometric.enabled) return;
    triedBio.current = true;
    void a.unlockWithBiometric();
  }, [a]);

  const stopped = a.resetRequired;
  const waiting = a.lockedForS > 0;
  const shown = stopped
    ? t('lock.reset')
    : waiting
      ? t('lock.locked', { s: a.lockedForS })
      : message;

  return (
    <View
      accessibilityViewIsModal
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.lg,
        gap: spacing.lg,
        zIndex: 1000,
      }}
    >
      <View style={{ alignItems: 'center', gap: spacing.xs }}>
        <AppText variant="title" accessibilityRole="header">
          {t('lock.title')}
        </AppText>
        <AppText muted style={{ textAlign: 'center' }}>
          {t('lock.body')}
        </AppText>
      </View>
      {stopped ? null : (
        <PinPad
          length={entry.length}
          label={t('lock.title')}
          disabled={busy || waiting}
          onDigit={(d) => {
            const next = digitsOnly(entry + d);
            setEntry(next);
            setMessage(null);
            if (next.length === PIN_LENGTH) void submit(next);
          }}
          onDelete={() => setEntry((e) => e.slice(0, -1))}
        />
      )}
      {shown ? (
        <View accessibilityLiveRegion="assertive" style={{ maxWidth: 360 }}>
          <Notice tone="warning">{shown}</Notice>
        </View>
      ) : null}
      {a.biometric.enabled && !stopped ? (
        <Button
          variant="secondary"
          label={t('lock.bio', { kind })}
          disabled={busy || waiting}
          onPress={() => void a.unlockWithBiometric()}
        />
      ) : null}
      {stopped ? (
        <Button
          variant="secondary"
          label={t('lock.signOut')}
          onPress={() => void a.signOutDevice()}
        />
      ) : null}
    </View>
  );
}
