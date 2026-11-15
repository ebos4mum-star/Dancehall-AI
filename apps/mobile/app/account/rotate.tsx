import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useAccount } from '@/account/AccountProvider';
import { AnswerQuestions } from '@/account/QuestionFields';
import type { Answers, Failure } from '@/account/cloud/accountService';
import { useApp } from '@/data/AppProvider';
import { t, type StringKey } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';

/** Replaces the Recovery Key for a signed-in account. It needs the answers to the two questions; the old key stops working as soon as the new one is accepted. */
export default function Rotate() {
  const { session } = useApp();
  const account = useAccount();
  const [questions, setQuestions] = useState<[string, string] | null | undefined>(undefined);
  const [answers, setAnswers] = useState<[string, string]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void account.cloud.status().then((s) => {
      if (!alive) return;
      if (s.ok) setQuestions(s.questions);
      else {
        setQuestions(null);
        setError(t(`acct.err.${s.reason satisfies Failure}` as StringKey));
      }
    });
    return () => {
      alive = false;
    };
  }, [account.cloud]);

  if (!session && account.ready) return <Redirect href="/account/start" />;

  const go = async () => {
    if (!questions) return;
    setBusy(true);
    setError(null);
    try {
      const a: Answers = [
        { id: questions[0], answer: answers[0] },
        { id: questions[1], answer: answers[1] },
      ];
      const r = await account.cloud.rotateKey(a);
      if (!r.ok) {
        setError(
          r.reason === 'failed' ? t('acct.rot.wrong') : t(`acct.err.${r.reason}` as StringKey),
        );
        return;
      }
      setAnswers(['', '']);
      await account.refreshBackup();
      router.replace('/account/recovery-key');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen top>
      <AppText variant="title" accessibilityRole="header">
        {t('acct.rot.title')}
      </AppText>
      <AppText>{t('acct.rot.body')}</AppText>
      {questions ? (
        <AnswerQuestions questions={questions} answers={answers} onChange={setAnswers} />
      ) : null}
      {error ? (
        <View accessibilityLiveRegion="assertive">
          <Notice tone="warning">{error}</Notice>
        </View>
      ) : null}
      <Button
        label={busy ? t('acct.rot.working') : t('acct.rot.go')}
        disabled={busy || !questions || answers[0].trim() === '' || answers[1].trim() === ''}
        onPress={() => void go()}
      />
      <Button
        variant="secondary"
        label={t('acct.q.cancel')}
        disabled={busy}
        onPress={() => router.back()}
      />
    </Screen>
  );
}
