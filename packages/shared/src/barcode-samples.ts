import type { ProductRecord } from './barcode';

/**
 * SYNTHETIC sample products for development and tests only. The names say so, the numbers are invented, and the barcodes are made up (the 999 prefix is reserved for
 * coupons and internal use, not products). They exist to exercise found, incomplete and inconsistent products without a data provider. Never offered in a production build.
 */
export const SAMPLE_PRODUCTS: readonly ProductRecord[] = [
  {
    barcode: '9999000000015',
    name: 'Sample oat biscuits (synthetic)',
    servingG: 30,
    per100g: { kcal: 450, proteinG: 7, carbsG: 68, fatG: 16 },
    allergens: ['gluten', 'milk'],
    source: 'local_sample',
  },
  {
    barcode: '9999000000022',
    name: 'Sample plain yoghurt (synthetic)',
    servingG: 125,
    per100g: { kcal: 61, proteinG: 3.5, carbsG: 4.7, fatG: 3.3 },
    allergens: ['milk'],
    source: 'local_sample',
  },
  {
    barcode: '9999000000039',
    name: 'Sample bottled water (synthetic)',
    servingG: 250,
    per100g: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
    allergens: [],
    source: 'local_sample',
  },
  {
    barcode: '9999000000046',
    name: 'Sample snack bar, partial label (synthetic)',
    servingG: 40,
    per100g: { kcal: 400 },
    allergens: [],
    source: 'local_sample',
  },
  {
    barcode: '9999000000053',
    name: 'Sample mislabelled drink (synthetic)',
    servingG: 250,
    per100g: { kcal: 10, proteinG: 20, carbsG: 40, fatG: 30 },
    allergens: [],
    source: 'local_sample',
  },
];
