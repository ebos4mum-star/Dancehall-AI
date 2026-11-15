import { withAccount } from '@/account/gate';
import { useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useApp } from '@/data/AppProvider';
import { errorMessage, useLoad } from '@/data/hooks';
import { newKey, useDraft } from '@/food/draft';
import { discardPhoto, preparePhoto, readPhotoForUpload, seedFrom } from '@/food/photo';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { haptics } from '@/ui/haptics';
import { useTheme } from '@/theme/useTheme';
import { Ionicons } from '@expo/vector-icons';
import { PulseStage } from '@/pulse/PulseStage';
import { IconBadge } from '@/ui/kit';
import { brand } from '@/theme/tokens';

let sampleCounter = 0;

function CameraScreen() {
  const { store, config } = useApp();
  const { dispatch } = useDraft();
  const { colors, radius, spacing } = useTheme();
  const { data: consents, reload } = useLoad((s) => s.getConsents());
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [camFailed, setCamFailed] = useState(false);

  const supported = typeof store.analyzeMealPhoto === 'function';
  const allowed = consents?.ai_processing_of_food_photos === true;

  /** The whole pipeline: shrink the photo, analyze it, and delete every local copy no matter what happens. */
  const analyze = async (photo: { uri: string; width: number; height: number } | null) => {
    setBusy(true);
    setErr(null);
    let resized: { uri: string } | null = null;
    try {
      let seed: number;
      let upload: Awaited<ReturnType<typeof readPhotoForUpload>> | undefined;
      if (photo) {
        resized = await preparePhoto(photo.uri, photo.width, photo.height);
        seed = seedFrom(`${photo.uri}${Date.now()}`);
        // Only a real (Supabase) store uploads the bytes; the development mock never needs them.
        if (store.mode === 'supabase') upload = await readPhotoForUpload(resized.uri);
      } else {
        seed = sampleCounter++;
      }
      const res = await store.analyzeMealPhoto!({ seed, photo: upload });
      dispatch({
        type: 'start',
        draft: {
          items: res.items.map((i) => ({ ...i, key: newKey() })),
          source: 'photo',
          photoAnalysisId: res.analysisId,
          provider: res.provider,
          notes: res.notes,
        },
      });
      haptics.success();
      router.replace('/food/review');
    } catch (e) {
      haptics.warning();
      setErr(errorMessage(e));
    } finally {
      await discardPhoto(photo?.uri);
      await discardPhoto(resized?.uri);
      setBusy(false);
    }
  };

  const capture = async () => {
    haptics.capture();
    try {
      const pic = await cam.current?.takePictureAsync({ quality: 0.8, exif: false });
      if (pic) await analyze({ uri: pic.uri, width: pic.width, height: pic.height });
    } catch {
      setCamFailed(true);
      setErr(t('cam.unavailable'));
    }
  };
  const pick = async () => {
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        exif: false,
        allowsEditing: false,
      });
      const a = r.canceled ? null : r.assets[0];
      if (a) await analyze({ uri: a.uri, width: a.width, height: a.height });
    } catch (e) {
      setErr(errorMessage(e));
    }
  };

  if (!supported) {
    return (
      <Screen top={false}>
        <Notice>{t('cam.notReady')}</Notice>
        <Button label={t('cam.manualInstead')} onPress={() => router.replace('/food/add')} />
      </Screen>
    );
  }

  if (!allowed) {
    return (
      <Screen top={false}>
        <DepthCard>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <IconBadge
              name="shield-checkmark"
              size={44}
              fill={colors.primary}
              color={colors.onPrimary}
            />
            <AppText variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
              {t('cam.consentTitle')}
            </AppText>
          </View>
          <AppText muted>{t('cam.consentBody')}</AppText>
          <AppText variant="caption" muted>
            {t('cam.privacy')}
          </AppText>
          <Button
            label={t('cam.allow')}
            onPress={async () => {
              try {
                await store.setConsent('ai_processing_of_food_photos', true);
                reload();
              } catch (e) {
                setErr(errorMessage(e));
              }
            }}
          />
          <Button
            variant="secondary"
            label={t('cam.manualInstead')}
            onPress={() => router.replace('/food/add')}
          />
        </DepthCard>
        {err ? <Notice tone="warning">{err}</Notice> : null}
      </Screen>
    );
  }

  const cameraReady = perm?.granted && !camFailed && Platform.OS !== 'web';
  return (
    <Screen
      top={false}
      banner={{
        world: 'food',
        title: t('ban.camera.title'),
        line: t('ban.camera.line'),
        pulse: 'idle',
      }}
    >
      <View
        style={{
          height: 300,
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: brand.plum,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {cameraReady ? (
          <CameraView
            ref={cam}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            facing="back"
            onMountError={() => setCamFailed(true)}
            accessibilityLabel="Camera preview"
          />
        ) : (
          <View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.lg }}>
            <PulseStage state="idle" size={96} />
            <AppText style={{ color: brand.ivory, textAlign: 'center' }}>
              {perm && !perm.granted && perm.canAskAgain && Platform.OS !== 'web'
                ? t('cam.permission')
                : t('cam.unavailable')}
            </AppText>
            {perm && !perm.granted && perm.canAskAgain && Platform.OS !== 'web' ? (
              <Button label={t('cam.grant')} onPress={() => void requestPerm()} />
            ) : null}
          </View>
        )}
        {/* viewfinder corners */}
        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
          <View
            key={c}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 34,
              height: 34,
              top: c[0] === 't' ? 14 : undefined,
              bottom: c[0] === 'b' ? 14 : undefined,
              left: c[1] === 'l' ? 14 : undefined,
              right: c[1] === 'r' ? 14 : undefined,
              borderColor: brand.lime,
              borderTopWidth: c[0] === 't' ? 4 : 0,
              borderBottomWidth: c[0] === 'b' ? 4 : 0,
              borderLeftWidth: c[1] === 'l' ? 4 : 0,
              borderRightWidth: c[1] === 'r' ? 4 : 0,
              borderRadius: 8,
            }}
          />
        ))}
        {config.authMode === 'mock' ? (
          <View
            accessible
            accessibilityLabel={t('cam.mockBanner')}
            style={{
              position: 'absolute',
              top: 12,
              alignSelf: 'center',
              flexDirection: 'row',
              gap: 6,
              alignItems: 'center',
              backgroundColor: brand.coral,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.md,
              paddingVertical: 4,
            }}
          >
            <Ionicons name="flask" size={14} color={brand.plum} />
            <AppText variant="caption" style={{ color: brand.plum, fontWeight: '700' }}>
              {t('cam.simulatedBadge')}
            </AppText>
          </View>
        ) : null}
      </View>
      {config.authMode === 'mock' ? <Notice tone="warning">{t('cam.mockBanner')}</Notice> : null}
      <View style={{ gap: spacing.sm }}>
        {cameraReady ? (
          <Button
            label={busy ? t('cam.working') : t('cam.capture')}
            disabled={busy}
            onPress={capture}
          />
        ) : null}
        {config.barcodeProvider !== 'off' ? (
          <Button
            variant="secondary"
            label={t('cam.scanInstead')}
            onPress={() => router.replace('/food/barcode')}
          />
        ) : null}
        <Button
          variant={cameraReady ? 'secondary' : 'primary'}
          label={t('cam.pick')}
          disabled={busy}
          onPress={pick}
        />
        {config.authMode === 'mock' ? (
          <Button
            variant="secondary"
            label={busy ? t('cam.working') : t('cam.sample')}
            disabled={busy}
            onPress={() => analyze(null)}
          />
        ) : null}
        <Button
          variant="secondary"
          label={t('cam.manualInstead')}
          disabled={busy}
          onPress={() => router.replace('/food/add')}
        />
      </View>
      {err ? <Notice tone="warning">{err}</Notice> : null}
      <AppText variant="caption" muted>
        {t('cam.privacy')}
      </AppText>
    </Screen>
  );
}

/** Needs an account: a guest is sent to create one and then brought back here. */
export default withAccount(CameraScreen, 'log_food');
