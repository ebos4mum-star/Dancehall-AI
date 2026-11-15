// Generates supabase/seed.sql from the shared JSON sources of the SYNTHETIC development data (reference foods, sample workouts).
// `node scripts/gen-seed.mjs --check` fails if the committed seed is out of date. The rules about what may be seeded live in scripts/seed-lib.mjs.
// `--allow-new-styles` accepts the Dancehall, reggae and chair-dance styles; use it only after the owner has approved and applied the M3 v2 style migration.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { DB_STYLES, DB_STYLES_V2, buildSeedSql } from './seed-lib.mjs';

const data = JSON.parse(readFileSync('packages/shared/src/food-data.json', 'utf8'));
const wk = JSON.parse(readFileSync('packages/shared/src/workout-data.json', 'utf8'));
const styles = process.argv.includes('--allow-new-styles') ? DB_STYLES_V2 : DB_STYLES;
let sql;
try {
  sql = buildSeedSql(data, wk, styles);
} catch (e) {
  console.error(String(e.message));
  process.exit(1);
}
if (process.argv.includes('--check')) {
  if (!existsSync('supabase/seed.sql') || readFileSync('supabase/seed.sql', 'utf8') !== sql) {
    console.error('supabase/seed.sql is out of date. Run: node scripts/gen-seed.mjs');
    process.exit(1);
  }
  console.log(`Seed is up to date (${data.foods.length} foods, ${wk.workouts.length} workouts).`);
} else {
  writeFileSync('supabase/seed.sql', sql);
  console.log(
    `Wrote supabase/seed.sql (${data.foods.length} foods, ${wk.workouts.length} workouts).`,
  );
}
