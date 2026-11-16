import { withAccount } from '@/account/gate';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  allergenLine,
  itemFromProduct,
  parseBarcode,
  userProduct,
  type ProductLookup,
  type ProductRecord,
  type ProductStore,
} from '@dancehall/shared';
import { useApp } from '@/data/AppProvider';
import { useDraft } from '@/food/draft';
import { createLayeredBarcodeProvider, offProductUrl } from '@/food/barcodeProvider';
import { readLookupConsent, writeLookupConsent } from '@/food/productStore';
import {
  deviceProductStore,
  deviceRaw,
  memoryProductsKey,
  myProductsKey,
} from '@/food/productStore';
import { parseDecimal } from '@/lib/format';
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
  | { kind: 'label' }
  | { kind: 'result'; result: ProductLookup };

/** The product the person is adding, with a portion they can change. Package data is labelled as such and every value stays editable after it is added. */
function FoundProduct({
  product,
  attribution,
  remote,
  cached,
  onAdd,
  onAgain,
  onForget,
}: {
  product: ProductRecord;
  attribution?: string;
  remote: boolean;
  cached?: boolean;
  onForget?: () => void;
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
      {cached ? <Notice>{t('barcode.cached')}</Notice> : null}
      {product.source === 'user_entered' ? <Notice>{t('barcode.mine')}</Notice> : null}
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
      {product.source === 'open_food_facts' && offProductUrl(product.barcode) ? (
        <Button
          variant="secondary"
          label={t('barcode.viewOff')}
          onPress={() =>
            void Linking.openURL(offProductUrl(product.barcode)!).catch(() => undefined)
          }
        />
      ) : null}
      <Button label={t('barcode.add')} onPress={() => onAdd(item)} />
      <Button variant="secondary" label={t('barcode.scanAgain')} onPress={onAgain} />
      {onForget && product.source === 'user_entered' ? (
        <Button variant="secondary" label={t('barcode.forget')} onPress={onForget} />
      ) : null}
    </DepthCard>
  );
}

/** Typing the package label for a barcode nothing knew. Validated exactly like database data; saved on this device (and used on the next scan) only if the person asks. */
function LabelForm({
  code,
  store,
  onSaved,
  onSkip,
}: {
  code: string;
  store: ProductStore;
  onSaved: (p: ProductRecord) => void;
  onSkip: () => void;
}) {
  const { spacing } = useTheme();
  const [v, setV] = useState({
    name: '',
    brand: '',
    serving: '',
    kcal: '',
    protein: '',
    carbs: '',
    fat: '',
  });
  const [save, setSave] = useState(true);
  const [problems, setProblems] = useState<string[]>([]);
  const set = (k: keyof typeof v) => (x: string) => setV((s) => ({ ...s, [k]: x }));
  const num = (s: string) => (s.trim() === '' ? undefined : (parseDecimal(s) ?? NaN));
  const submit = async () => {
    const r = userProduct({
      barcode: code,
      name: v.name,
      brand: v.brand,
      servingG: num(v.serving) ?? null,
      per100g: {
        kcal: num(v.kcal),
        proteinG: num(v.protein),
        carbsG: num(v.carbs),
        fatG: num(v.fat),
      },
    });
    if (!r.ok) return setProblems(r.problems);
    if (save) await store.put(r.product);
    onSaved(r.product);
  };
  return (
    <DepthCard>
      <AppText variant="heading" accessibilityRole="header">
        {t('barcode.labelTitle')}
      </AppText>
      <AppText variant="caption" muted>
        {t('barcode.labelHint')}
      </AppText>
      <TextField label={t('barcode.labelName')} value={v.name} onChangeText={set('name')} />
      <TextField label={t('barcode.labelBrand')} value={v.brand} onChangeText={set('brand')} />
      <TextField
        label={t('barcode.labelKcal')}
        value={v.kcal}
        onChangeText={set('kcal')}
        keyboardType="decimal-pad"
      />
      <TextField
        label={t('barcode.labelProtein')}
        value={v.protein}
        onChangeText={set('protein')}
        keyboardType="decimal-pad"
      />
      <TextField
        label={t('barcode.labelCarbs')}
        value={v.carbs}
        onChangeText={set('carbs')}
        keyboardType="decimal-pad"
      />
      <TextField
        label={t('barcode.labelFat')}
        value={v.fat}
        onChangeText={set('fat')}
        keyboardType="decimal-pad"
      />
      <TextField
        label={t('barcode.labelServing')}
        value={v.serving}
        onChangeText={set('serving')}
        keyboardType="decimal-pad"
      />
      {problems.map((p) => (
        <Notice key={p} tone="warning">
          {p}
        </Notice>
      ))}
      <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
        <Button
          variant={save ? 'primary' : 'secondary'}
          label={save ? t('barcode.saveOn') : t('barcode.saveOff')}
          onPress={() => setSave(!save)}
        />
        <Button label={t('barcode.labelUse')} onPress={() => void submit()} />
        <Button variant="secondary" label={t('barcode.labelSkip')} onPress={onSkip} />
      </View>
    </DepthCard>
  );
}

function BarcodeScreen() {
  const { config, session } = useApp();
  const { dispatch } = useDraft();
  const { colors, radius, spacing } = useTheme();
  const userId = session?.userId ?? 'guest';
  const stores = useMemo(
    () => ({
      mine: deviceProductStore(deviceRaw, myProductsKey(userId), 200),
      memory: deviceProductStore(deviceRaw, memoryProductsKey(userId), 100),
    }),
    [userId],
  );
  // Looking a barcode up sends it (and the phone's network address) to a third party, so the database is asked only after the person has said yes. Their own products and
  // the offline memory still work without it, and food can always be added by hand.
  const [consent, setConsent] = useState<boolean | null>(null);
  useEffect(() => {
    void readLookupConsent(deviceRaw, userId).then(setConsent);
  }, [userId]);
  const live = config.barcodeProvider === 'open_food_facts';
  const provider = useMemo(
    () =>
      createLayeredBarcodeProvider(
        live && consent !== true ? { ...config, barcodeProvider: 'off' } : config,
        stores,
      ),
    [config, stores, live, consent],
  );
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
      setScanned(parsed.code);
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
  const [scanned, setScanned] = useState<string | null>(null);

  if (live && consent === null)
    return (
      <Screen top={false}>
        <AppText muted>{t('common.loading')}</AppText>
      </Screen>
    );
  if (provider.id === 'off' && !live) {
    return (
      <Screen top={false}>
        <Notice>{t('barcode.off')}</Notice>
        <Button label={t('cam.manualInstead')} onPress={() => router.replace('/food/add')} />
      </Screen>
    );
  }

  if (live && consent === false) {
    return (
      <Screen top={false}>
        <DepthCard>
          <AppText variant="heading" accessibilityRole="header">
            {t('barcode.consentTitle')}
          </AppText>
          <AppText>{t('barcode.consentBody')}</AppText>
          <Button
            label={t('barcode.consentAllow')}
            onPress={() => {
              void writeLookupConsent(deviceRaw, userId, true);
              setConsent(true);
            }}
          />
          <Button
            variant="secondary"
            label={t('barcode.consentNo')}
            onPress={() => router.replace('/food/add')}
          />
        </DepthCard>
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
      {phase.kind === 'label' && scanned ? (
        <LabelForm
          code={scanned}
          store={stores.mine}
          onSaved={(p) => setPhase({ kind: 'result', result: { status: 'found', product: p } })}
          onSkip={again}
        />
      ) : null}
      {phase.kind === 'result' ? (
        phase.result.status === 'found' ? (
          <FoundProduct
            product={phase.result.product}
            attribution={provider.attribution}
            remote={
              provider.id === 'open_food_facts' &&
              phase.result.product.source === 'open_food_facts' &&
              !phase.result.cached
            }
            cached={phase.result.cached}
            onForget={() => {
              const code = (phase.result as { product: ProductRecord }).product.barcode;
              void stores.mine.remove(code).then(again);
            }}
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
                  : phase.result.reason === 'rate_limited'
                    ? t('barcode.busy')
                    : t('barcode.unavailable')}
              </Notice>
            )}
            {scanned && phase.result.status !== 'unavailable' ? (
              <Button
                label={t('barcode.enterYourself')}
                onPress={() => setPhase({ kind: 'label' })}
              />
            ) : null}
            <Button
              variant="secondary"
              label={t('barcode.manualInstead')}
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
