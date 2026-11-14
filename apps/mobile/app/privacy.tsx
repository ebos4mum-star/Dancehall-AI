import { Share, Switch, View } from 'react-native';
import { router } from 'expo-router';
import { consentPurposeSchema, type ConsentPurpose } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { cleanDisplayName } from '@/lib/displayName';
import { buildDataExport, exportToText } from '@/privacy/export';
import { t, type StringKey } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { useState } from 'react';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { Choice } from '@/ui/Choice';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

const LABELS: Record<ConsentPurpose, [StringKey, StringKey]> = {
  health_data_processing: ['privacy.healthData', 'privacy.healthDataBody'],
  ai_processing_of_food_photos: ['privacy.aiPhotos', 'privacy.aiPhotosBody'],
  ai_coach_personalization: ['privacy.aiCoach', 'privacy.aiCoachBody'],
  health_platform_sync: ['privacy.healthSync', 'privacy.healthSyncBody'],
  social_sharing: ['privacy.sharing', 'privacy.sharingBody'],
};

export default function Privacy() {
  const { store, profile, config, refresh } = useApp();
  const { colors, spacing } = useTheme();
  const { data, error } = useLoad((s) => s.getConsents());
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const runExport = async () => {
    setExporting(true);
    setMsg(null);
    try {
      const text = exportToText(await buildDataExport(store));
      setExportText(text);
      // The system share sheet is a deliberate tap; where it is unavailable the text stays on screen to copy.
      await Share.share({ title: 'DanceHall Fit export', message: text }).catch(() => undefined);
    } catch (e) {
      setExportText(null);
      setMsg(errorMessage(e));
    } finally {
      setExporting(false);
    }
  };

  const guard = async (fn: () => Promise<unknown>) => {
    try {
      setMsg(null);
      await fn();
    } catch (e) {
      setMsg(errorMessage(e));
    }
  };

  return (
    <Screen
      top={false}
      banner={{
        world: 'me',
        title: t('ban.privacy.title'),
        line: t('ban.privacy.line'),
        pulse: 'idle',
      }}
    >
      <Card>
        <TextField
          label={t('privacy.displayName')}
          value={name ?? profile?.displayName ?? ''}
          onChangeText={setName}
          maxLength={40}
          autoComplete="name"
          textContentType="name"
        />
        <Button
          variant="secondary"
          label={t('common.save')}
          disabled={
            name === null ||
            cleanDisplayName(name) === null ||
            cleanDisplayName(name) === profile?.displayName
          }
          onPress={() =>
            guard(async () => {
              await store.updateProfile({ displayName: cleanDisplayName(name ?? '')! });
              setName(null);
            })
          }
        />
      </Card>
      <Card>
        <AppText variant="heading" accessibilityRole="header">
          {t('privacy.units')}
        </AppText>
        <Choice
          value={profile?.unitSystem ?? 'metric'}
          onChange={(u) => guard(() => store.updateProfile({ unitSystem: u }))}
          options={[
            { value: 'metric', label: t('common.metric') },
            { value: 'imperial', label: t('common.imperial') },
          ]}
        />
      </Card>
      <AppText variant="heading" accessibilityRole="header">
        {t('privacy.consents')}
      </AppText>
      {consentPurposeSchema.options.map((p) => {
        const [labelKey, bodyKey] = LABELS[p];
        return (
          <Card key={p}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: spacing.md,
              }}
            >
              <AppText variant="label" style={{ flex: 1 }}>
                {t(labelKey)}
              </AppText>
              <Switch
                accessibilityLabel={t(labelKey)}
                value={data?.[p] ?? false}
                disabled={!data}
                onValueChange={(v) => guard(() => store.setConsent(p, v))}
                trackColor={{ true: colors.primary, false: colors.border }}
              />
            </View>
            <AppText variant="caption" muted>
              {t(bodyKey)}
            </AppText>
          </Card>
        );
      })}
      {error ? <Notice tone="warning">{`${error} ${t('privacy.loadFailed')}`}</Notice> : null}
      {msg ? <Notice tone="warning">{msg}</Notice> : null}
      <Card>
        <AppText variant="heading" accessibilityRole="header">
          {t('privacy.exportTitle')}
        </AppText>
        <AppText muted>{t('privacy.exportBody')}</AppText>
        <Button
          variant="secondary"
          label={exporting ? t('common.loading') : t('privacy.exportButton')}
          disabled={exporting}
          onPress={runExport}
        />
        {exportText ? (
          <>
            <Notice>{t('privacy.exportReady')}</Notice>
            <TextField
              label={t('privacy.exportText')}
              value={exportText}
              onChangeText={() => undefined}
              multiline
              editable
              autoCapitalize="none"
              autoCorrect={false}
            />
          </>
        ) : null}
        <AppText variant="caption" muted>
          {t('privacy.exportNote')}
        </AppText>
      </Card>
      <Card>
        <AppText variant="heading" accessibilityRole="header">
          {t('privacy.account')}
        </AppText>
        <Button
          variant="secondary"
          label={t('privacy.signOut')}
          onPress={async () => {
            await store.signOut();
            await refresh();
            router.replace('/');
          }}
        />
        {config.authMode === 'mock' ? (
          <Button
            variant="secondary"
            label={t('privacy.resetDev')}
            onPress={async () => {
              await store.resetDevData?.();
              await store.signOut();
              await refresh();
              router.replace('/');
            }}
          />
        ) : null}
      </Card>
    </Screen>
  );
}
