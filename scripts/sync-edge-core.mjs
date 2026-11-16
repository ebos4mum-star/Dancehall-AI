// Edge Functions run on Deno and cannot import from the pnpm workspace, so the account logic is COPIED from packages/shared into
// supabase/functions/_shared/generated/ with Deno-style import specifiers. The copy is generated, never hand-edited:
//   node scripts/sync-edge-core.mjs          rewrite the copies
//   node scripts/sync-edge-core.mjs --check  fail if a copy is stale (runs in `pnpm verify` and CI)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const FILES = [
  'account-core.ts',
  'security-questions.ts',
  'account-rpc-db.ts',
  'community.ts',
  'community-media.ts',
  'community-server.ts',
  'community-alerts.ts',
  'gamification.ts',
  'social-server.ts',
];
const OUT = 'supabase/functions/_shared/generated';
const noble = JSON.parse(readFileSync('node_modules/@noble/hashes/package.json', 'utf8')).version;

export function transform(name, src) {
  const body = src
    .replace(/from '@noble\/hashes\/([^']+)'/g, `from 'npm:@noble/hashes@${noble}/$1'`)
    .replace(/from '\.\/([^']+)'/g, (_m, p) => `from './${p}.ts'`);
  return `// GENERATED from packages/shared/src/${name} by scripts/sync-edge-core.mjs. Do not edit: change the source and run \`node scripts/sync-edge-core.mjs\`.\n${body}`;
}

const check = process.argv.includes('--check');
let stale = 0;
if (!check) mkdirSync(OUT, { recursive: true });
for (const f of FILES) {
  const want = transform(f, readFileSync(`packages/shared/src/${f}`, 'utf8'));
  const path = `${OUT}/${f}`;
  const have = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (have === want) continue;
  if (check) {
    console.error(`stale: ${path}`);
    stale++;
  } else writeFileSync(path, want);
}
if (check) {
  if (stale) {
    console.error('Edge Function copies are out of date. Run: node scripts/sync-edge-core.mjs');
    process.exit(1);
  }
  console.log('Edge Function shared copies are up to date.');
}
