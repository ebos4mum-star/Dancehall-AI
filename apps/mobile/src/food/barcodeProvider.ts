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
  config: Pick<AppConfig, 'barcodeProvider'> & { supportEmail?: string },
  // Wrapped so the global is never called with another object as `this` (browsers refuse that: "Illegal invocation").
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): ProductProvider {
  switch (config.barcodeProvider) {
    case 'local':
      return createCatalogProvider(SAMPLE_PRODUCTS);
    case 'open_food_facts':
      return createOpenFoodFactsProvider({
        fetchImpl,
        // Open Food Facts asks for AppName/Version (ContactEmail). The contact is the app's public support address (set by the owner); there is nothing about the person.
        userAgent: config.supportEmail
          ? `DanceHallFit/0.0 (${config.supportEmail})`
          : 'DanceHallFit/0.0 (barcode lookup)',
      });
    default:
      return OFF_PROVIDER;
  }
}

/** The configured database with the person's own products in front and, for a live database, an offline memory behind. */
export function createLayeredBarcodeProvider(
  config: Pick<AppConfig, 'barcodeProvider'> & { supportEmail?: string },
  stores: { mine: ProductStore; memory: ProductStore },
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): ProductProvider {
  return createLayeredProvider({
    mine: stores.mine,
    remote: createBarcodeProvider(config, fetchImpl),
    memory: config.barcodeProvider === 'open_food_facts' ? stores.memory : undefined,
  });
}

/** The product page where Open Food Facts asks to be credited with a link (and where mistakes can be corrected). */
export const offProductUrl = (code: string): string | null =>
  /^\d{8,14}$/.test(code) ? `https://world.openfoodfacts.org/product/${code}` : null;
