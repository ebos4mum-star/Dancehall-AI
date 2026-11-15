import { useReducer, useRef, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import {
  PIN_LENGTH,
  digitsOnly,
  initPinSetup,
  pinSetupReduce,
  type PinProblem,
} from '@dancehall/shared';
import { useAccount } from '@/account/AccountProvider';
import { PinPad } from '@/account/PinPad';
import { useApp } from '@/data/AppProvider';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';

type Mode = 'create' | 'protect' | 'change';
type Stage = 'old' | 'pin' | 'bio' | 'finish';

/**
 * Creating, confirming and changing the PIN. The PIN exists only in this screen's memory while it is typed twice, then goes to the secure vault once as a salted hash.
 * Cancelling at any point discards it and changes nothing. If the app is closed half way, nothing was saved: an account that had been created but has no PIN yet is
 * sent back here at the next start, so an interrupted setup can never leave an unprotected account open.
 */
export default function PinScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { session, store, refresh } = useApp();
  const account = useAccount();
  const requested: Mode =
    params.mode === 'protect' || params.mode === 'change' ? params.mode : 'create';
  // A signed-in person without a PIN is "protecting" an existing account, not creating one.
  const mode: Mode = requested === 'create' && session ? 'protect' : requested;
  const [setup, dispatch] = useReducer(pinSetupReduce, undefined, initPinSetup);
  const [stage, setStage] = useState<Stage>(mode === 'change' ? 'old' : 'pin');
  const [oldEntry, setOldEntry] = useState('');
  const oldPin = useRef('');
  const [wantBio, setWantBio] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode === 'change' && account.ready && !account.pinSet) return <Redirect href="/" />;
  if (mode === 'create' && typeof store.signInDev !== 'function')
    return <Redirect href="/account/start" />;

  const kind = account.biometric.kind ? t(`pin.kind.${account.biometric.kind}` as StringKey) : '';
  const err = (e: PinProblem | 'mismatch' | null) => (e ? t(`pin.err.${e}` as StringKey) : null);

  // The PIN pad advances the reducer; when it reaches done, move on once.
  const press = (d: string) => {
    const next = pinSetupReduce(setup, { type: 'digit', digit: d });
    dispatch({ type: 'digit', digit: d });
    if (next.step === 'done' && stage === 'pin') {
      if (mode === 'change') void finalize(next.entry, false);
      else if (account.biometric.available) setStage('bio');
      else setStage('finish');
    }
  };

  const finalize = async (pin: string, bio: boolean) => {
    setBusy(true);
    setError(null);
    try {
      if (mode === 'change') {
        const r = await account.changePin(oldPin.current, pin);
        if (!r.ok) {
          setError(
            r.reason === 'locked' ? t('lock.locked', { s: r.lockedForS }) : t('lock.wrongLast'),
          );
          dispatch({ type: 'restart' });
          setStage('old');
          oldPin.current = '';
          setOldEntry('');
          return;
        }
        router.back();
        return;
      }
      // A new account is created first; if that fails nothing has been stored. Then the PIN is set, and the app continues (onboarding, then what was being done).
      if (!session) {
        if (!store.signInDev) throw new Error('no account creation');
        await store.signInDev();
        await refresh();
      }
      await account.createPin(pin, { biometric: bio });
      resetToStart();
    } catch {
      setError(t('pin.failed'));
    } finally {
      oldPin.current = '';
      setBusy(false);
    }
  };

  // The account screens were opened on top of the guest app. Clear them so there is only one copy of the app underneath, then continue from the start.
  const resetToStart = () => {
    // Back to the app underneath (popping the account screens); its layout then sends a new account on to onboarding.
    router.dismissTo('/(tabs)');
  };

  const cancel = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (stage === 'bio')
    return (
      <Screen top>
        <AppText variant="title" accessibilityRole="header">
          {t('pin.bioTitle', { kind })}
        </AppText>
        <AppText>{t('pin.bioBody', { kind })}</AppText>
        <Button
          label={t('pin.bioOn', { kind })}
          onPress={() => {
            setWantBio(true);
            setStage('finish');
          }}
        />
        <Button
          variant="secondary"
          label={t('pin.bioNotNow')}
          onPress={() => {
            setWantBio(false);
            setStage('finish');
          }}
        />
      </Screen>
    );

  if (stage === 'finish')
    return (
      <Screen top>
        <AppText variant="title" accessibilityRole="header">
          {t('pin.noRecoveryTitle')}
        </AppText>
        <Notice tone="warning">{t('pin.noRecoveryBody')}</Notice>
        {error ? <Notice tone="warning">{error}</Notice> : null}
        <Button
          label={
            busy ? t('pin.working') : mode === 'create' ? t('pin.finish') : t('pin.finishProtect')
          }
          disabled={busy}
          onPress={() => void finalize(setup.entry, wantBio)}
        />
        {mode === 'create' ? (
          <Button variant="secondary" label={t('pin.cancel')} disabled={busy} onPress={cancel} />
        ) : (
          <Button
            variant="secondary"
            label={t('pin.signOutInstead')}
            disabled={busy}
            onPress={() => void account.signOutDevice().then(resetToStart)}
          />
        )}
      </Screen>
    );

  const oldStage = stage === 'old';
  const title = oldStage
    ? t('pin.oldTitle')
    : setup.step === 'confirm'
      ? t('pin.confirmTitle')
      : mode === 'change'
        ? t('pin.changeTitle')
        : mode === 'protect'
          ? t('pin.protectTitle')
          : t('pin.createTitle');
  const body = oldStage
    ? null
    : setup.step === 'confirm'
      ? t('pin.confirmBody')
      : mode === 'protect'
        ? t('pin.protectBody')
        : t('pin.createBody');

  return (
    <Screen top>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title" accessibilityRole="header">
          {title}
        </AppText>
        {body ? <AppText muted>{body}</AppText> : null}
      </View>
      <PinPad
        length={oldStage ? oldEntry.length : setup.entry.length}
        label={title}
        disabled={busy}
        onDigit={(d) => {
          if (oldStage) {
            const v = digitsOnly(oldEntry + d);
            setOldEntry(v);
            if (v.length === PIN_LENGTH) {
              oldPin.current = v;
              setOldEntry('');
              setStage('pin');
            }
          } else press(d);
        }}
        onDelete={() =>
          oldStage ? setOldEntry((e) => e.slice(0, -1)) : dispatch({ type: 'delete' })
        }
      />
      {error ? (
        <View accessibilityLiveRegion="assertive">
          <Notice tone="warning">{error}</Notice>
        </View>
      ) : null}
      {setup.error ? (
        <View accessibilityLiveRegion="assertive">
          <Notice tone="warning">{err(setup.error)!}</Notice>
        </View>
      ) : null}
      {mode === 'protect' ? (
        <Button
          variant="secondary"
          label={t('pin.signOutInstead')}
          disabled={busy}
          onPress={() => void account.signOutDevice().then(resetToStart)}
        />
      ) : (
        <Button variant="secondary" label={t('pin.cancel')} disabled={busy} onPress={cancel} />
      )}
    </Screen>
  );
}
