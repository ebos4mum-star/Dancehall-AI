import { withAccount } from '@/account/gate';
import { useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  allergenLine,
  itemFromProduct,
  parseBarcode,
  type ProductLookup,
  type ProductRecord,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useDraft } from '@/food/draft';
import { createBarcodeProvider } from '@/food/barcodeProvider';
import { PortionStepper, kcalText, macroText } from '@/food/ui';
import { useNumbersHidden } from '@/wellness/hooks';
import { t } from '@/i18n';
import { AppText } from '@/ui/AppText';
import { Button } from '@/ui/Button';
import { DepthCard } from '@/ui/Depth';
import { Notice } from '@/ui/Banner';
import { Screen } from '@/ui/Screen';
import { TextField } from '@/ui/TextField';
import { haptics } from '@/ui/haptics';
import { useTheme } from '@/theme/useTheme';
import { brand } from '@/theme/tokens';

type Phase =
  | { kind: 'scan' }
  | { kind: 'looking' }
  | { kind: 'invalid' }
  | { kind: 'result'; result: ProductLookup };

/** The product the person is adding, with a portion they can change. Package data is labelled as such and every value stays editable after it is added. */
function FoundProduct({
  product,
  attribution,
  remote,
  onAdd,
  onAgain,
}: {
  product: ProductRecord;
  attribution?: string;
  remote: boolean;
  onAdd: (item: NonNullable<ReturnType<typeof itemFromProduct>>) => void;
  onAgain: () => void;
}) {
  const hideNumbers = useNumbersHidden();
  const { spacing } = useTheme();
  const [grams, setGrams] = useState(Math.round(product.servingG ?? 100));
  const item = useMemo(() => itemFromProduct(product, grams), [product, grams]);
  const allergens = allergenLine(product);
  if (!item) return null;
  return (
    <DepthCard>
      <AppText variant="heading" accessibilityRole="header">
        {item.name}
      </AppText>
      {product.source === 'local_sample' ? (
        <Notice tone="warning">{t('barcode.sample')}</Notice>
      ) : null}
      <AppText variant="label">{t('barcode.portion')}</AppText>
      <PortionStepper grams={grams} onChange={setGrams} foodId={null} />
      {hideNumbers ? null : (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">{kcalText(item)}</AppText>
          <AppText variant="caption" muted>
            {macroText(item)}
          </AppText>
        </View>
      )}
      {allergens ? <Notice tone="warning">{allergens}</Notice> : null}
      <AppText variant="caption" muted>
        {t('barcode.packageData')}
      </AppText>
      {remote ? (
        <AppText variant="caption" muted>
          {t('barcode.remote')}
        </AppText>
      ) : null}
      {attribution ? (
        <AppText variant="caption" muted>
          {attribution}
        </AppText>
      ) : null}
      <Button label={t('barcode.add')} onPress={() => onAdd(item)} />
      <Button variant="secondary" label={t('barcode.scanAgain')} onPress={onAgain} />
    </DepthCard>
  );
}

function BarcodeScreen() {
  const { config } = useApp();
  const { dispatch } = useDraft();
  const { colors, radius, spacing } = useTheme();
  const provider = useMemo(() => createBarcodeProvider(config), [config]);
  const [perm, requestPerm] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: 'scan' });
  const [typed, setTyped] = useState('');
  const [camFailed, setCamFailed] = useState(false);
  const busy = useRef(false);

  const lookup = async (raw: string) => {
    // One lookup at a time: the camera reports the same code many times a second.
    if (busy.current) return;
    busy.current = true;
    try {
      const parsed = parseBarcode(raw);
      if (!parsed) {
        haptics.warning();
        setPhase({ kind: 'invalid' });
        return;
      }
      setPhase({ kind: 'looking' });
      const result = await provider.lookup(parsed.code);
      if (result.status === 'found') haptics.success();
      else haptics.warning();
      setPhase({ kind: 'result', result });
    } finally {
      busy.current = false;
    }
  };
  const again = () => {
    setTyped('');
    setPhase({ kind: 'scan' });
  };

  if (provider.id === 'off') {
    return (
      <Screen top={false}>
        <Notice>{t('barcode.off')}</Notice>
        <Button label={t('cam.manualInstead')} onPress={() => router.replace('/food/add')} />
      </Screen>
    );
  }

  const cameraReady = perm?.granted && !camFailed && Platform.OS !== 'web';
  const scanning = phase.kind === 'scan' || phase.kind === 'invalid';
  return (
    <Screen
      top={false}
      banner={{
        world: 'food',
        title: t('ban.barcode.title'),
        line: t('ban.barcode.line'),
        pulse: 'idle',
      }}
    >
      {scanning ? (
        <>
          <View
            style={{
              height: 220,
              borderRadius: radius.lg,
              overflow: 'hidden',
              backgroundColor: brand.plum,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {cameraReady ? (
              <CameraView
                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a'] }}
                onBarcodeScanned={(e) => void lookup(e.data)}
                onMountError={() => setCamFailed(true)}
                accessibilityLabel="Camera preview"
              />
            ) : (
              <View style={{ alignItems: 'center', gap: spacing.sm, padding: spacing.lg }}>
                <AppText style={{ color: brand.ivory, textAlign: 'center' }}>
                  {perm && !perm.granted && perm.canAskAgain && Platform.OS !== 'web'
                    ? t('cam.permission')
                    : t('barcode.noCamera')}
                </AppText>
                {perm && !perm.granted && perm.canAskAgain && Platform.OS !== 'web' ? (
                  <Button label={t('cam.grant')} onPress={() => void requestPerm()} />
                ) : null}
              </View>
            )}
          </View>
          {cameraReady ? (
            <AppText variant="caption" muted>
              {t('barcode.hint')}
            </AppText>
          ) : null}
          <TextField
            label={t('barcode.manualLabel')}
            value={typed}
            onChangeText={setTyped}
            keyboardType="number-pad"
            autoCapitalize="none"
          />
          <Button
            label={t('barcode.lookup')}
            disabled={typed.trim() === ''}
            onPress={() => void lookup(typed)}
          />
          {phase.kind === 'invalid' ? <Notice tone="warning">{t('barcode.invalid')}</Notice> : null}
          <Button
            variant="secondary"
            label={t('cam.manualInstead')}
            onPress={() => router.replace('/food/add')}
          />
        </>
      ) : null}
      {phase.kind === 'looking' ? (
        <DepthCard>
          <AppText accessibilityLiveRegion="polite" style={{ color: colors.text }}>
            {t('barcode.looking')}
          </AppText>
        </DepthCard>
      ) : null}
      {phase.kind === 'result' ? (
        phase.result.status === 'found' ? (
          <FoundProduct
            product={phase.result.product}
            attribution={provider.attribution}
            remote={provider.id === 'open_food_facts'}
            onAdd={(item) => {
              dispatch({ type: 'add', item });
              router.replace('/food/review');
            }}
            onAgain={again}
          />
        ) : (
          <DepthCard>
            {phase.result.status === 'incomplete' ? (
              <>
                <AppText variant="heading" accessibilityRole="header">
                  {t('barcode.incompleteTitle')}
                </AppText>
                {phase.result.problems.map((p) => (
                  <AppText key={p} variant="caption" muted>
                    {p}
                  </AppText>
                ))}
              </>
            ) : (
              <Notice tone="warning">
                {phase.result.status === 'not_found'
                  ? t('barcode.notFound')
                  : t('barcode.unavailable')}
              </Notice>
            )}
            <Button
              label={t('barcode.enterYourself')}
              onPress={() => router.replace('/food/add')}
            />
            {phase.result.status === 'unavailable' ? (
              <Button variant="secondary" label={t('barcode.retry')} onPress={again} />
            ) : (
              <Button variant="secondary" label={t('barcode.scanAgain')} onPress={again} />
            )}
          </DepthCard>
        )
      ) : null}
    </Screen>
  );
}

export default withAccount(BarcodeScreen, 'log_food');
