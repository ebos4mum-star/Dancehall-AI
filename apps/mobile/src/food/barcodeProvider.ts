import {
  OFF_PROVIDER,
  SAMPLE_PRODUCTS,
  createCatalogProvider,
  createOpenFoodFactsProvider,
  createLayeredProvider,
  type ProductProvider,
  type ProductStore,
} from '@dancehall/shared';
import type { AppConfig } from '@/lib/env';

/**
 * The product database for barcode scans, chosen by the build configuration. The default sends nothing anywhere: `off` in production, the offline SYNTHETIC samples
 * in development and review builds. Open Food Facts is used only when the owner has switched it on.
 */
export function createBarcodeProvider(
  config: Pick<AppConfig, 'barcodeProvider'>,
  fetchImpl: typeof fetch = fetch,
): ProductProvider {
  switch (config.barcodeProvider) {
    case 'local':
      return createCatalogProvider(SAMPLE_PRODUCTS);
    case 'open_food_facts':
      return createOpenFoodFactsProvider({
        fetchImpl,
        // Identifies the app to Open Food Facts, as they ask. Contains no personal details.
        userAgent: 'DanceHallFit/0.0 (barcode lookup)',
      });
    default:
      return OFF_PROVIDER;
  }
}

/** The configured database with the person's own products in front and, for a live database, an offline memory behind. */
export function createLayeredBarcodeProvider(
  config: Pick<AppConfig, 'barcodeProvider'>,
  stores: { mine: ProductStore; memory: ProductStore },
  fetchImpl: typeof fetch = fetch,
): ProductProvider {
  return createLayeredProvider({
    mine: stores.mine,
    remote: createBarcodeProvider(config, fetchImpl),
    memory: config.barcodeProvider === 'open_food_facts' ? stores.memory : undefined,
  });
}
