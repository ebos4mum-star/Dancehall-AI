#!/usr/bin/env node
/*
 * Stages foods from the USDA FoodData Central "SR Legacy" CSV release. Usage:
 *   curl -L -o sr.zip https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip && unzip sr.zip
 *   node scripts/import-fdc-sr.mjs <dir containing the CSV files>
 *
 * Every nutrient value and serving weight is READ from those files; the manifest (scripts/food-import-manifest.json) supplies only identifiers, names, tags and aliases.
 * A food whose energy, protein, carbohydrate or fat is missing from the source is skipped and reported (a missing value is never filled in). Output: packages/shared/src/food-staged.json.
 * Staged foods are NOT reviewed: they carry no dietitian or cultural review, never enter the bundled catalogue, and appear only in development and review builds.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: node scripts/import-fdc-sr.mjs <directory with the SR Legacy CSV files>');
  process.exit(2);
}
const root = resolve(import.meta.dirname, '..');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}
const load = (f) => parseCsv(readFileSync(join(dir, f), 'utf8'));

const manifest = JSON.parse(readFileSync(join(root, 'scripts/food-import-manifest.json'), 'utf8'));
const foods = new Map(load('food.csv').map((r) => [r.fdc_id, r]));
const nutrients = new Map(load('nutrient.csv').map((r) => [r.id, r]));
const byFood = new Map();
for (const r of load('food_nutrient.csv')) {
  const n = nutrients.get(r.nutrient_id);
  if (!n) continue;
  if (!byFood.has(r.fdc_id)) byFood.set(r.fdc_id, new Map());
  byFood.get(r.fdc_id).set(n.nutrient_nbr, Number(r.amount));
}
const units = new Map(load('measure_unit.csv').map((r) => [r.id, r.name]));
const portions = new Map();
for (const r of load('food_portion.csv')) {
  if (!portions.has(r.fdc_id)) portions.set(r.fdc_id, []);
  portions.get(r.fdc_id).push(r);
}

const today = new Date().toISOString().slice(0, 10);
const out = [];
const skipped = [];
for (const m of manifest.foods) {
  const src = foods.get(String(m.fdcId));
  const nut = byFood.get(String(m.fdcId));
  if (!src || !nut) {
    skipped.push(`${m.id}: FDC ${m.fdcId} not found in the release`);
    continue;
  }
  // Nutrient numbers: 208 energy (kcal), 203 protein, 205 carbohydrate (by difference), 204 total fat, 291 fibre.
  const [kcal, proteinG, carbsG, fatG] = [208, 203, 205, 204].map((k) => nut.get(String(k)));
  if ([kcal, proteinG, carbsG, fatG].some((v) => v === undefined || Number.isNaN(v))) {
    skipped.push(`${m.id}: FDC ${m.fdcId} has no value for energy, protein, carbohydrate or fat`);
    continue;
  }
  const fiber = nut.get('291');
  // Serving: a household portion published for this food, chosen by the manifest's hint, else the first published portion with a weight, else 100 g.
  const list = (portions.get(String(m.fdcId)) ?? [])
    .filter((p) => Number(p.gram_weight) > 0)
    .sort((a, b) => Number(a.seq_num) - Number(b.seq_num));
  const text = (p) =>
    [
      p.amount,
      units.get(p.measure_unit_id) && units.get(p.measure_unit_id) !== 'undetermined'
        ? units.get(p.measure_unit_id)
        : '',
      p.portion_description,
      p.modifier,
    ]
      .filter((s) => s && String(s).trim() !== '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  const hinted = m.portion
    ? list.find((p) => text(p).toLowerCase().includes(m.portion))
    : undefined;
  const pick = hinted ?? list[0];
  const serving = pick
    ? { servingG: Number(pick.gram_weight), servingLabel: text(pick) } // gram_weight is the weight of the stated amount (for example 0.5 cup)
    : { servingG: 100, servingLabel: '100 g' };
  out.push({
    id: m.id,
    name: m.name,
    category: m.category,
    regionTags: m.regionTags,
    per100g: {
      kcal,
      proteinG,
      carbsG,
      fatG,
      ...(fiber !== undefined && !Number.isNaN(fiber) ? { fiberG: fiber } : {}),
    },
    servingG: Math.round(serving.servingG * 10) / 10,
    servingLabel: serving.servingLabel,
    costTier: m.costTier,
    aliases: m.aliases,
    staged: {
      sourceId: 'usda_fdc',
      sourceFoodId: `FDC ${m.fdcId}: ${src.description}`,
      sourceVersion: `USDA FoodData Central, SR Legacy (April 2018 release, published ${src.publication_date})`,
      retrievedOn: today,
      attribution:
        'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov (SR Legacy). Values are per 100 g as published.',
      licenceNote:
        'USDA states that FoodData Central data are in the public domain (CC0 1.0). A reviewer must still confirm this and record the confirmation before the food is published.',
    },
  });
}
const doc = {
  _notice:
    'STAGED, UNREVIEWED food data. Every nutrient value and serving weight was read from the USDA FoodData Central SR Legacy release by scripts/import-fdc-sr.mjs; none was typed in or estimated. No registered dietitian has reviewed these foods and no cultural reviewer has confirmed their region tags or aliases, so they are never bundled, never seeded and appear only in development and review builds. Foods missing from the source (for example ackee) are not included.',
  source: 'USDA FoodData Central, SR Legacy, April 2018 release',
  foods: out,
};
writeFileSync(
  join(root, 'packages/shared/src/food-staged.json'),
  JSON.stringify(doc, null, 2) + '\n',
);
console.log(`Staged ${out.length} foods from ${manifest.foods.length} requested.`);
for (const s of skipped) console.log(`  skipped: ${s}`);
