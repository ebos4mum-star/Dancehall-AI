import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAccount } from '@/account/AccountProvider';
import { AnswerQuestions } from '@/account/QuestionFields';
import type { Answers, Failure } from '@/account/cloud/accountService';
import { useApp } from '@/data/AppProvider';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

type Step = 'key' | 'answers' | 'waiting';
interface Tx {
  txId: string;
  questions: [string, string];
  salt: string;
}

/**
 * Getting an account back on a new phone: Recovery Key, then the two answers, then a waiting period during which the real owner can cancel, then a new device
 * credential, a new PIN and a new Recovery Key. A wrong key and a wrong answer look the same on purpose. The same account comes back, with its saved history.
 */
export default function Recover() {
  const { session } = useApp();
  const account = useAccount();
  const [step, setStep] = useState<Step | null>(null);
  const [typed, setTyped] = useState('');
  const [tx, setTx] = useState<Tx | null>(null);
  const [answers, setAnswers] = useState<[string, string]>(['', '']);
  const [readyAt, setReadyAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A recovery that was already verified on this phone resumes at the waiting step.
  useEffect(() => {
    let alive = true;
    void account.cloud.recoveryInProgress().then((p) => {
      if (!alive) return;
      if (p) {
        setReadyAt(p.readyAt);
        setStep('waiting');
      } else setStep('key');
    });
    return () => {
      alive = false;
    };
  }, [account.cloud]);
  useEffect(() => {
    if (step !== 'waiting') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);

  const fail = useCallback((reason: Failure) => setError(t(`acct.err.${reason}` as StringKey)), []);

  // Signed in (including just after recovery finishes): the new Recovery Key screen decides where to go next.
  if (session) return <Redirect href="/account/recovery-key" />;
  if (account.ready && !account.cloudEnabled) return <Redirect href="/account/start" />;
  if (!step) return <Screen top>{null}</Screen>;

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await account.cloud.recoverBegin(typed);
      if (!r.ok) return fail(r.reason);
      setTx({ txId: r.txId, questions: r.questions, salt: r.salt });
      setStep('answers');
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    if (!tx) return;
    setBusy(true);
    setError(null);
    try {
      const a: Answers = [
        { id: tx.questions[0], answer: answers[0] },
        { id: tx.questions[1], answer: answers[1] },
      ];
      const r = await account.cloud.recoverVerify(tx, a);
      if (!r.ok) {
        // A failed attempt uses up this transaction (the server burns it): start again from the key.
        fail(r.reason);
        if (r.reason === 'failed') {
          setTx(null);
          setAnswers(['', '']);
          setStep('key');
        }
        return;
      }
      setAnswers(['', '']); // the answers leave memory as soon as they have been checked
      setTyped('');
      setReadyAt(r.readyAt);
      setNow(Date.now());
      setStep('waiting');
    } finally {
      setBusy(false);
    }
  };
  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await account.cloud.recoverFinish();
      if (!r.ok) return fail(r.reason);
      if (r.waiting) {
        setReadyAt(r.waiting.readyAt);
        setError(t('acct.r.notYet'));
        return;
      }
      await account.refreshBackup();
      // Signed in as the same account: the new Recovery Key is shown, then a new PIN is chosen.
      router.replace('/account/recovery-key');
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    await account.cloud.cancelRecoveryDraft();
    setStep('key');
    setError(t('acct.r.cancelled'));
  };

  const ready = now >= readyAt;
  return (
    <Screen top>
      <AppText variant="title" accessibilityRole="header">
        {step === 'waiting' ? t('acct.r.waitTitle') : t('acct.r.title')}
      </AppText>
      {step === 'key' ? (
        <>
          <AppText>{t('acct.r.keyIntro')}</AppText>
          <TextField
            label={t('acct.r.keyLabel')}
            hint={t('acct.r.keyHint')}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            importantForAutofill="no"
            textContentType="none"
          />
          <Button
            label={busy ? t('acct.r.checking') : t('acct.r.continue')}
            disabled={busy || typed.trim() === ''}
            onPress={() => void begin()}
          />
          <Notice>{t('acct.r.lostBoth')}</Notice>
        </>
      ) : null}
      {step === 'answers' && tx ? (
        <>
          <AppText variant="heading">{t('acct.r.questionsTitle')}</AppText>
          <AnswerQuestions questions={tx.questions} answers={answers} onChange={setAnswers} />
          <Button
            label={busy ? t('acct.r.checking') : t('acct.r.verify')}
            disabled={busy || answers[0].trim() === '' || answers[1].trim() === ''}
            onPress={() => void verify()}
          />
        </>
      ) : null}
      {step === 'waiting' ? (
        <>
          <AppText>{t('acct.r.waitBody')}</AppText>
          <Notice>{t('acct.r.readyAt', { time: new Date(readyAt).toLocaleString() })}</Notice>
          {account.cloud.kind === 'simulation' ? <Notice>{t('acct.r.sim')}</Notice> : null}
          <Notice>{t('acct.r.signedOutNote')}</Notice>
          <Button
            label={busy ? t('acct.r.finishing') : ready ? t('acct.r.finish') : t('acct.r.check')}
            disabled={busy}
            onPress={() => {
              if (ready) return void finish();
              setNow(Date.now());
              setError(t('acct.r.notYet'));
            }}
          />
          <Button
            variant="secondary"
            label={t('acct.r.cancel')}
            disabled={busy}
            onPress={() => void cancel()}
          />
        </>
      ) : null}
      {error ? (
        <View accessibilityLiveRegion="assertive">
          <Notice tone="warning">{error}</Notice>
        </View>
      ) : null}
      <View style={{ height: spacing.sm }} />
      <Button
        variant="secondary"
        label={t('acct.q.cancel')}
        disabled={busy}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/account/start'))}
      />
    </Screen>
  );
}
