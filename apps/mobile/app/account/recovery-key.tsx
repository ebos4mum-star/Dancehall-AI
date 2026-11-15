import { useEffect, useRef, useState } from 'react';
import { Platform, Share, Switch, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAccount } from '@/account/AccountProvider';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Screen } from '@/ui/Screen';
import { useApp } from '@/data/AppProvider';
import { useScreenCaptureBlocked } from '@/account/useScreenCaptureBlocked';

/** How long a copied key stays on the clipboard before the app clears it (best effort: some keyboards keep their own history). */
export const CLIPBOARD_CLEAR_MS = 60_000;

/**
 * Shows the Recovery Key, once, and makes the person back it up before going on. Nothing is saved automatically: not to the photo library (screenshots are blocked
 * where the phone allows), not to the clipboard, not to any cloud. Backing up is the person's act: the system share sheet (to a password manager or secure notes
 * app), an explicit copy, or writing it down. Continuing requires an explicit confirmation, which erases the key from this phone.
 */
export default function RecoveryKey() {
  const { session } = useApp();
  const account = useAccount();
  const { colors } = useTheme();
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [confirmed, setConfirmed] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rotated, setRotated] = useState(false);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copied = useRef<string | null>(null);
  const blocked = useScreenCaptureBlocked(key != null);

  useEffect(() => {
    let alive = true;
    void account.cloud.pendingKey().then((k) => alive && setKey(k));
    return () => {
      alive = false;
    };
  }, [account.cloud]);
  useEffect(
    () => () => {
      if (clearTimer.current) clearTimeout(clearTimer.current);
    },
    [],
  );

  if (!session && account.ready) return <Redirect href="/account/start" />;
  if (key === undefined) return <Screen top>{null}</Screen>;
  if (key === null) {
    // Nothing to show (already confirmed, or opened by mistake): carry on to where the person was going.
    return account.backup === 'pending' ? (
      <Screen top>
        <Notice>{t('acct.k.none')}</Notice>
      </Screen>
    ) : (
      <Redirect href="/(tabs)" />
    );
  }

  const share = async () => {
    setNote(null);
    try {
      // The message is the key only: it is handed to the app the person chooses, and nothing here keeps it.
      await Share.share({ message: key, title: t('acct.k.title') });
    } catch {
      setNote(t('acct.k.shareFailed'));
    }
  };
  const copy = async () => {
    setNote(null);
    try {
      await Clipboard.setStringAsync(key);
      copied.current = key;
      setNote(t('acct.k.copied'));
      if (clearTimer.current) clearTimeout(clearTimer.current);
      clearTimer.current = setTimeout(() => {
        void (async () => {
          try {
            // Only clear what we put there: if the person copied something else since, leave it alone.
            if ((await Clipboard.getStringAsync()) === copied.current)
              await Clipboard.setStringAsync('');
          } catch {
            /* best effort */
          }
        })();
      }, CLIPBOARD_CLEAR_MS);
    } catch {
      setNote(t('acct.k.copyFailed'));
    }
  };
  const done = async () => {
    setBusy(true);
    try {
      await account.cloud.confirmBackup();
      await account.refreshBackup();
      setRotated(true);
      // A new account still needs its PIN; one that already has a PIN goes back to the app.
      if (!account.pinSet) router.replace('/account/pin?mode=protect');
      else router.dismissTo('/(tabs)');
    } finally {
      setBusy(false);
    }
  };

  const groups = key.split('-');
  const rows = [groups.slice(0, 3), groups.slice(3, 6), groups.slice(6, 9)];
  return (
    <Screen top>
      <AppText variant="title" accessibilityRole="header">
        {t('acct.k.title')}
      </AppText>
      <AppText>{t('acct.k.body')}</AppText>
      <Notice tone="warning">{t('acct.k.warn')}</Notice>
      <Card>
        <AppText variant="label">{t('acct.k.label')}</AppText>
        <View
          accessible
          accessibilityLabel={`${t('acct.k.label')}: ${groups.join(', ')}`}
          style={{ gap: spacing.xs }}
        >
          {rows.map((r, i) => (
            <AppText
              key={i}
              variant="heading"
              selectable
              style={{
                fontFamily: Platform.select({
                  ios: 'Menlo',
                  android: 'monospace',
                  default: 'monospace',
                }),
                color: colors.text,
                letterSpacing: 1,
              }}
            >
              {r.join(' ')}
            </AppText>
          ))}
        </View>
        {blocked ? (
          <AppText variant="caption" muted>
            {t('acct.k.noCapture')}
          </AppText>
        ) : null}
      </Card>
      <Button label={t('acct.k.share')} variant="secondary" onPress={() => void share()} />
      <AppText variant="caption" muted>
        {t('acct.k.shareHint')}
      </AppText>
      <Button label={t('acct.k.copy')} variant="secondary" onPress={() => void copy()} />
      <AppText variant="caption" muted>
        {t('acct.k.write')}
      </AppText>
      {note ? (
        <View accessibilityLiveRegion="polite">
          <Notice>{note}</Notice>
        </View>
      ) : null}
      <Notice tone="warning">{t('acct.k.lostBoth')}</Notice>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flex: 1 }}>
          <AppText variant="label">{t('acct.k.confirm')}</AppText>
        </View>
        <Switch
          accessibilityLabel={t('acct.k.confirm')}
          value={confirmed}
          onValueChange={setConfirmed}
          trackColor={{ true: colors.primary, false: colors.border }}
        />
      </View>
      <Button
        label={busy || rotated ? t('acct.k.saving') : t('acct.k.continue')}
        disabled={!confirmed || busy}
        onPress={() => void done()}
      />
    </Screen>
  );
}
