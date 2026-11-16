import { useAccount } from '@/account/AccountProvider';
import { GmSettingsCard } from '@/gamification/ui';
import { HealthSettingsCard } from '@/health/ui';
import { withAccount } from '@/account/gate';
import { Linking, Share, View } from 'react-native';
import { IconChoice, type IconName } from '@/ui/kit';
import { FoodHero } from '@/food/kit';
import { BigField } from '@/onboarding/kit';
import { SettingRow } from '@/ui/SettingRow';
import { router } from 'expo-router';
import { consentPurposeSchema, type ConsentPurpose } from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { cleanDisplayName } from '@/lib/displayName';
import { buildDataExport, exportToText } from '@/privacy/export';
import { t, type StringKey } from '@/i18n';
import { useTheme } from '@/theme/useTheme';
import { useEffect, useState } from 'react';
import {
  deviceProductStore,
  deviceRaw,
  myProductsKey,
  readLookupConsent,
  writeLookupConsent,
} from '@/food/productStore';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';

const LABELS: Record<ConsentPurpose, [StringKey, StringKey]> = {
  health_data_processing: ['privacy.healthData', 'privacy.healthDataBody'],
  ai_processing_of_food_photos: ['privacy.aiPhotos', 'privacy.aiPhotosBody'],
  ai_coach_personalization: ['privacy.aiCoach', 'privacy.aiCoachBody'],
  health_platform_sync: ['privacy.healthSync', 'privacy.healthSyncBody'],
  social_sharing: ['privacy.sharing', 'privacy.sharingBody'],
};

const CONSENT_ICON: Record<string, IconName> = {
  health_data_processing: 'heart',
  ai_processing_of_food_photos: 'camera',
  ai_coach_personalization: 'sparkles',
  health_platform_sync: 'watch',
  social_sharing: 'people',
};

function Privacy() {
  const { store, profile, config } = useApp();
  const account = useAccount();
  const { spacing } = useTheme();
  const { data, error } = useLoad((s) => s.getConsents());
  const [msg, setMsg] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [lookupOn, setLookupOn] = useState(false);
  const lookupUser = useApp().session?.userId ?? 'guest';
  useEffect(() => {
    void readLookupConsent(deviceRaw, lookupUser).then(setLookupOn);
  }, [lookupUser]);
  const [exportText, setExportText] = useState<string | null>(null);
  const runExport = async () => {
    setExporting(true);
    setMsg(null);
    try {
      const text = exportToText(
        await buildDataExport(store, new Date(), {
          myProducts: await deviceProductStore(deviceRaw, myProductsKey(lookupUser), 200).list(),
        }),
      );
      setExportText(text);
      // The system share sheet is a deliberate tap; where it is unavailable the text stays on screen to copy.
      await Share.share({ title: 'Locked In Fitness export', message: text }).catch(
        () => undefined,
      );
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

  const onCount = data ? consentPurposeSchema.options.filter((p) => data[p]).length : 0;
  const units = profile?.unitSystem ?? 'metric';
  return (
    <Screen>
      <FoodHero
        world="me"
        title={t('ban.privacy.title')}
        line={t('ban.privacy.line')}
        pulse="idle"
        stats={
          data
            ? [
                {
                  label: t('privacy.consents'),
                  value: `${onCount} / ${consentPurposeSchema.options.length}`,
                },
              ]
            : []
        }
      />
      {error ? <Notice tone="warning">{`${error} ${t('privacy.loadFailed')}`}</Notice> : null}
      {msg ? <Notice tone="warning">{msg}</Notice> : null}

      <GmSettingsCard />
      <HealthSettingsCard />

      <AppText variant="heading" accessibilityRole="header">
        {t('privacy.profileTitle')}
      </AppText>
      <Card>
        <BigField
          icon="person"
          label={t('privacy.displayName')}
          value={name ?? profile?.displayName ?? ''}
          onChangeText={setName}
          maxLength={40}
          autoComplete="name"
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
        <AppText variant="label">{t('privacy.units')}</AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {(['metric', 'imperial'] as const).map((u) => (
            <View key={u} style={{ flex: 1 }}>
              <IconChoice
                icon="resize"
                label={t(u === 'metric' ? 'common.metric' : 'common.imperial')}
                selected={units === u}
                onPress={() => guard(() => store.updateProfile({ unitSystem: u }))}
              />
            </View>
          ))}
        </View>
      </Card>

      <AppText variant="heading" accessibilityRole="header">
        {t('privacy.consents')}
      </AppText>
      {consentPurposeSchema.options.map((p) => {
        const [labelKey, bodyKey] = LABELS[p];
        return (
          <SettingRow
            key={p}
            icon={CONSENT_ICON[p] ?? 'lock-closed'}
            title={t(labelKey)}
            body={t(bodyKey)}
            value={data?.[p] ?? false}
            disabled={!data}
            onChange={(v) => guard(() => store.setConsent(p, v))}
          />
        );
      })}

      {config.barcodeProvider === 'open_food_facts' ? (
        <Card>
          <AppText variant="heading" accessibilityRole="header">
            {t('privacy.barcodeTitle')}
          </AppText>
          <AppText muted>{t('privacy.barcodeBody')}</AppText>
          <Button
            variant={lookupOn ? 'primary' : 'secondary'}
            label={lookupOn ? t('privacy.barcodeOn') : t('privacy.barcodeOff')}
            onPress={() => {
              const next = !lookupOn;
              setLookupOn(next);
              void writeLookupConsent(deviceRaw, lookupUser, next);
            }}
          />
        </Card>
      ) : null}
      <AppText variant="heading" accessibilityRole="header">
        {t('privacy.exportTitle')}
      </AppText>
      <Card>
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
        {config.privacyPolicyUrl ? (
          <Button
            variant="secondary"
            label={t('privacy.policyLink')}
            onPress={() => void Linking.openURL(config.privacyPolicyUrl!).catch(() => undefined)}
          />
        ) : null}
        {config.supportUrl ? (
          <Button
            variant="secondary"
            label={t('privacy.supportLink')}
            onPress={() => void Linking.openURL(config.supportUrl!).catch(() => undefined)}
          />
        ) : null}
        {store.requestAccountDeletion ? (
          <Button
            variant="secondary"
            label={t('coachset.deleteAccount')}
            onPress={() => router.push('/coach/settings')}
          />
        ) : null}
      </Card>

      <AppText variant="heading" accessibilityRole="header">
        {t('privacy.account')}
      </AppText>
      <Card>
        <Notice tone="warning">{t('sec.signOutWarn')}</Notice>
        <Button
          variant="secondary"
          label={t('privacy.signOut')}
          onPress={async () => {
            await account.signOutDevice();
            router.replace('/');
          }}
        />
        {config.authMode === 'mock' ? (
          <Button
            variant="secondary"
            label={t('privacy.resetDev')}
            onPress={async () => {
              await store.resetDevData?.();
              await account.signOutDevice();
              router.replace('/');
            }}
          />
        ) : null}
      </Card>
    </Screen>
  );
}

/** Needs an account: a guest is sent to create one and then brought back here. */
export default withAccount(Privacy, 'profile');
