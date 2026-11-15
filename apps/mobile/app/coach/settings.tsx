import { withAccount } from '@/account/gate';
import { IconBadge, SectionTitle } from '@/ui/kit';
import { useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FoodHero } from '@/food/kit';
import { SettingRow } from '@/ui/SettingRow';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { formatDate } from '@/lib/format';
import { t } from '@/i18n';
import { brand, radius, spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/useTheme';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { ProgressBar } from '@/ui/ProgressBar';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';

function CoachSettings() {
  const { store, config } = useApp();
  const { colors } = useTheme();
  const { data: consents, error: consentError } = useLoad((s) => s.getConsents());
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

  const used = (usage?.features ?? []).reduce((n, f) => n + f.used, 0);
  return (
    <Screen>
      <FoodHero
        world="coach"
        title={t('ban.coachSettings.title')}
        line={t('ban.coachSettings.line')}
        pulse={on ? 'welcome' : 'idle'}
        stats={[
          { label: t('coachset.personalization'), value: on ? 'On' : 'Off' },
          { label: t('coachset.history'), value: String((convs ?? []).length) },
        ]}
      />
      {err ? <Notice tone="warning">{err}</Notice> : null}
      {consentError ? (
        <Notice tone="warning">{`${consentError} ${t('privacy.loadFailed')}`}</Notice>
      ) : null}

      <AppText variant="heading" accessibilityRole="header">
        {t('coachset.personalization')}
      </AppText>
      <SettingRow
        icon="sparkles"
        title={t('privacy.aiCoach')}
        body={t('coach.personalizeBody')}
        value={on}
        disabled={!consents}
        onChange={(v) => guard(() => store.setConsent('ai_coach_personalization', v))}
      />
      <DepthCard>
        <SectionTitle icon="eye" title={t('coach.used')} />
        {(summary ?? []).length === 0 ? (
          <AppText variant="caption" muted>
            {t('coach.usedNothing')}
          </AppText>
        ) : null}
        {(summary ?? []).map((l) => (
          <View key={l} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <AppText variant="caption" style={{ flex: 1 }}>
              {l}
            </AppText>
          </View>
        ))}
      </DepthCard>

      {store.setAiPaused ? (
        <SettingRow
          icon="pause-circle"
          title={t('coachset.pause')}
          body={t('coachset.pauseNote')}
          value={usage?.userPaused === true}
          onChange={(v) => guard(() => store.setAiPaused!(v))}
        />
      ) : null}

      <AppText variant="heading" accessibilityRole="header">
        {t('coachset.history')}
      </AppText>
      <DepthCard>
        {(convs ?? []).length === 0 ? (
          <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
            <IconBadge name="chatbubbles" size={40} fill={brand.violet} />
            <AppText muted style={{ flex: 1 }}>
              {t('coachset.noHistory')}
            </AppText>
          </View>
        ) : null}
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
            <View style={{ gap: spacing.sm }} accessibilityLiveRegion="polite">
              <Button
                label={`${t('coachset.deleteAll')}?`}
                onPress={() =>
                  guard(async () => {
                    await store.deleteAllConversations!();
                    setConfirmAll(false);
                  })
                }
              />
              <Button
                variant="secondary"
                label={t('food2.keep')}
                onPress={() => setConfirmAll(false)}
              />
            </View>
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

      <AppText variant="heading" accessibilityRole="header">
        {t('coachset.usage')}
      </AppText>
      <DepthCard>
        {(usage?.features ?? []).length === 0 ? (
          <AppText variant="caption" muted>{`${used} / 0`}</AppText>
        ) : null}
        {(usage?.features ?? []).map((f) => (
          <View key={f.feature} style={{ gap: 4 }}>
            <AppText
              variant="label"
              style={{ textTransform: 'capitalize' }}
            >{`${f.feature.replace(/_/g, ' ')}: ${f.used} / ${f.allowance}`}</AppText>
            <ProgressBar
              fraction={f.allowance ? f.used / f.allowance : 0}
              label={`${f.feature} usage`}
            />
          </View>
        ))}
        {usage?.paused ? <Notice>{t('coach.paused')}</Notice> : null}
        {usage?.staffPaused ? <Notice>{t('coachset.staffPaused')}</Notice> : null}
      </DepthCard>

      {store.requestAccountDeletion ? (
        <View
          style={{
            borderRadius: radius.lg,
            borderWidth: 2,
            borderColor: colors.warningText,
            backgroundColor: colors.warningBg,
            padding: spacing.md,
            gap: spacing.sm,
          }}
        >
          <SectionTitle icon="trash" title={t('coachset.deleteAccount')} />
          <AppText variant="caption" style={{ color: colors.warningText }}>
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
        </View>
      ) : null}

      {config.authMode === 'mock' ? (
        <SettingRow
          icon="flask"
          title={t('coachset.kill')}
          body={`${t('coachset.dev')}. ${t('coachset.killNote')}`}
          value={(usage?.staffPaused ?? usage?.paused) === true}
          onChange={(v) => guard(() => store.devSetKillSwitch!(v))}
        />
      ) : null}
    </Screen>
  );
}

/** Needs an account: a guest is sent to create one and then brought back here. */
export default withAccount(CoachSettings, 'coach');
