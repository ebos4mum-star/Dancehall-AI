import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { ANSWER_GUIDANCE } from '@dancehall/shared';
import { useAccount } from '@/account/AccountProvider';
import { ChooseQuestions, emptyPick, type Pick2 } from '@/account/QuestionFields';
import type { Answers, Failure } from '@/account/cloud/accountService';
import { useApp } from '@/data/AppProvider';
import { t, type StringKey } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { AppText } from '@/ui/AppText';
import { Notice } from '@/ui/Banner';
import { Button } from '@/ui/Button';
import { Screen } from '@/ui/Screen';

/**
 * Creating the cloud account: two security questions and their answers, then the account is made and the Recovery Key is shown. The answers exist only in this
 * screen's memory; they are stretched with a slow hash on this phone and only that proof is sent. If setup is interrupted, the same request is resumed
 * (no second account) and the answers need not be typed again.
 */
export default function Questions() {
  const { session } = useApp();
  const account = useAccount();
  const [pick, setPick] = useState<Pick2>(emptyPick);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resume, setResume] = useState(false);

  useEffect(() => {
    let alive = true;
    void account.cloud.pendingSetup().then((p) => alive && setResume(!!p));
    return () => {
      alive = false;
    };
  }, [account.cloud]);

  if (session) return <Redirect href="/account/recovery-key" />;
  if (account.ready && !account.cloudEnabled) return <Redirect href="/account/start" />;

  const complete = !!pick.q[0] && !!pick.q[1] && pick.a[0].trim() !== '' && pick.a[1].trim() !== '';

  const run = async (answers?: Answers) => {
    setBusy(true);
    setError(null);
    try {
      const r = await account.cloud.createAccount(answers ? { answers } : undefined);
      if (!r.ok) {
        setError(
          r.problem
            ? t(`acct.q.${r.problem}` as StringKey)
            : t(`acct.err.${r.reason satisfies Failure}` as StringKey),
        );
        setResume((await account.cloud.pendingSetup()) !== null);
        return;
      }
      setPick(emptyPick()); // the answers leave memory as soon as the account exists
      await account.refreshBackup();
      router.replace('/account/recovery-key');
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    void run([
      { id: pick.q[0]!, answer: pick.a[0] },
      { id: pick.q[1]!, answer: pick.a[1] },
    ]);

  return (
    <Screen top>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="title" accessibilityRole="header">
          {t('acct.q.title')}
        </AppText>
        <AppText>{t('acct.q.intro')}</AppText>
      </View>
      {resume ? (
        <View style={{ gap: spacing.sm }}>
          <Notice>{t('acct.q.resumeBody')}</Notice>
          <Button
            label={busy ? t('acct.q.working') : t('acct.q.resume')}
            disabled={busy}
            onPress={() => void run()}
          />
        </View>
      ) : null}
      <ChooseQuestions value={pick} onChange={setPick} />
      <Notice>{t('acct.q.privacy')}</Notice>
      <AppText variant="caption" muted>
        {t('acct.q.guidance')}
      </AppText>
      <AppText variant="caption" muted>
        {ANSWER_GUIDANCE}
      </AppText>
      {error ? (
        <View accessibilityLiveRegion="assertive">
          <Notice tone="warning">{error}</Notice>
        </View>
      ) : null}
      <Button
        label={busy ? t('acct.q.working') : t('acct.q.create')}
        disabled={busy || !complete}
        onPress={create}
      />
      <Button
        variant="secondary"
        label={t('acct.q.cancel')}
        disabled={busy}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      />
    </Screen>
  );
}
