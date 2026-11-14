import { useState } from 'react';
import { Switch, View } from 'react-native';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { formatDate } from '@/lib/format';
import { t } from '@/i18n';
import { spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { ProgressBar } from '@/ui/ProgressBar';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';

export default function CoachSettings() {
  const { store, config } = useApp();
  const { colors } = useTheme();
  const { data: consents } = useLoad((s) => s.getConsents());
  const { data: summary } = useLoad(async (s) =>
    s.getCoachContextSummary ? s.getCoachContextSummary() : [],
  );
  const { data: convs } = useLoad(async (s) => (s.listConversations ? s.listConversations() : []));
  const { data: usage } = useLoad(async (s) => (s.getAiUsage ? s.getAiUsage() : null));
  const { data: deletion } = useLoad(async (s) =>
    s.getAccountDeletionRequest ? s.getAccountDeletionRequest() : null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const guard = async (fn: () => Promise<unknown>) => {
    try {
      setErr(null);
      await fn();
    } catch (e) {
      haptics.warning();
      setErr(errorMessage(e));
    }
  };
  const on = consents?.ai_coach_personalization ?? false;

  return (
    <Screen top={false}>
      {err ? <Notice tone="warning">{err}</Notice> : null}
      <DepthCard>
        <AppText variant="heading" accessibilityRole="header">
          {t('coachset.personalization')}
        </AppText>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: spacing.md,
          }}
        >
          <AppText variant="label" style={{ flex: 1 }}>
            {t('privacy.aiCoach')}
          </AppText>
          <Switch
            accessibilityLabel={t('privacy.aiCoach')}
            value={on}
            onValueChange={(v) => guard(() => store.setConsent('ai_coach_personalization', v))}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
        <AppText variant="caption" muted>
          {t('coach.personalizeBody')}
        </AppText>
        <AppText variant="label">{t('coach.used')}</AppText>
        {(summary ?? []).map((l) => (
          <AppText key={l} variant="caption" muted>{`• ${l}`}</AppText>
        ))}
      </DepthCard>

      <DepthCard>
        <AppText variant="heading" accessibilityRole="header">
          {t('coachset.history')}
        </AppText>
        {(convs ?? []).length === 0 ? <AppText muted>{t('coachset.noHistory')}</AppText> : null}
        {(convs ?? []).map((c) => (
          <View key={c.id} style={{ gap: spacing.xs }}>
            <AppText variant="label">{c.title}</AppText>
            <AppText
              variant="caption"
              muted
            >{`${formatDate(c.updatedAt)} · ${c.messages.length}`}</AppText>
            <Button
              variant="secondary"
              label={`${t('coachset.deleteOne')}: ${c.title}`}
              onPress={() => guard(() => store.deleteConversation!(c.id))}
            />
          </View>
        ))}
        {(convs ?? []).length > 0 ? (
          confirmAll ? (
            <Button
              label={`${t('coachset.deleteAll')}?`}
              onPress={() =>
                guard(async () => {
                  await store.deleteAllConversations!();
                  setConfirmAll(false);
                })
              }
            />
          ) : (
            <Button
              variant="secondary"
              label={t('coachset.deleteAll')}
              onPress={() => setConfirmAll(true)}
            />
          )
        ) : null}
        <AppText variant="caption" muted>
          {t('coachset.retention')}
        </AppText>
      </DepthCard>

      <DepthCard>
        <AppText variant="heading" accessibilityRole="header">
          {t('coachset.usage')}
        </AppText>
        {(usage?.features ?? []).map((f) => (
          <View key={f.feature} style={{ gap: 4 }}>
            <AppText
              variant="caption"
              muted
            >{`${f.feature.replace('_', ' ')}: ${f.used} / ${f.allowance}`}</AppText>
            <ProgressBar
              fraction={f.allowance ? f.used / f.allowance : 0}
              label={`${f.feature} usage`}
            />
          </View>
        ))}
        {usage?.paused ? <Notice>{t('coach.paused')}</Notice> : null}
        {usage?.staffPaused ? <Notice>{t('coachset.staffPaused')}</Notice> : null}
      </DepthCard>

      {store.setAiPaused ? (
        <DepthCard>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.md,
            }}
          >
            <AppText variant="label" style={{ flex: 1 }}>
              {t('coachset.pause')}
            </AppText>
            <Switch
              accessibilityLabel={t('coachset.pause')}
              value={usage?.userPaused === true}
              onValueChange={(v) => guard(() => store.setAiPaused!(v))}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <AppText variant="caption" muted>
            {t('coachset.pauseNote')}
          </AppText>
        </DepthCard>
      ) : null}

      {store.requestAccountDeletion ? (
        <DepthCard>
          <AppText variant="heading" accessibilityRole="header">
            {t('coachset.deleteAccount')}
          </AppText>
          <AppText variant="caption" muted>
            {t('coachset.deleteAccountNote')}
          </AppText>
          {deletion ? (
            <>
              <Notice>{`${t('coachset.deleteRequested')} ${formatDate(deletion.scheduledFor)}`}</Notice>
              <Button
                variant="secondary"
                label={t('coachset.deleteCancel')}
                onPress={() => guard(() => store.cancelAccountDeletion!())}
              />
            </>
          ) : (
            <Button
              variant="secondary"
              label={t('coachset.deleteAccount')}
              onPress={() => guard(() => store.requestAccountDeletion!())}
            />
          )}
        </DepthCard>
      ) : null}

      {config.authMode === 'mock' ? (
        <DepthCard>
          <AppText variant="heading" accessibilityRole="header">
            {t('coachset.dev')}
          </AppText>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: spacing.md,
            }}
          >
            <AppText variant="label" style={{ flex: 1 }}>
              {t('coachset.kill')}
            </AppText>
            <Switch
              accessibilityLabel={t('coachset.kill')}
              value={(usage?.staffPaused ?? usage?.paused) === true}
              onValueChange={(v) => guard(() => store.devSetKillSwitch!(v))}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <AppText variant="caption" muted>
            {t('coachset.killNote')}
          </AppText>
        </DepthCard>
      ) : null}
    </Screen>
  );
}
