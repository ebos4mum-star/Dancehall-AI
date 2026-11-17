// Assembles the reviewed staging migration set into a throwaway folder that the Supabase CLI can push, WITHOUT touching supabase/migrations or any hosted project:
//   STAGING_REF=<new project ref> STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT node scripts/staging/prepare-bundle.mjs .staging-bundle
// Order: every repository migration (as they are), then the proposed Community schema, the private photo bucket, and the account-deletion executor.
// Nothing is applied here. The output lists each file with its SHA-256 so what is pushed can be compared with what was reviewed.
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertStagingRef } from './guard.mjs';

export const EXTRA = [
  ['20261216000100_community.sql', 'supabase/proposed/community.up.sql'],
  ['20261216000200_community_storage.sql', 'supabase/proposed/community.storage.sql'],
  ['20261216000300_account_deletion_purge.sql', 'supabase/proposed/account_deletion_purge.up.sql'],
];

export function buildBundle(out, { ref, confirm, pins }) {
  assertStagingRef(ref, confirm, pins);
  rmSync(out, { recursive: true, force: true });
  const dir = join(out, 'supabase', 'migrations');
  mkdirSync(dir, { recursive: true });
  const manifest = [];
  const add = (name, src) => {
    const bytes = readFileSync(src);
    cpSync(src, join(dir, name));
    manifest.push({
      file: name,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      source: src,
    });
  };
  const repo = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of repo) add(f, join('supabase/migrations', f));
  for (const [name, src] of EXTRA) {
    if (repo.some((f) => f >= name))
      throw new Error(
        `a repository migration sorts at or after ${name}; renumber the staging additions`,
      );
    add(name, src);
  }
  writeFileSync(
    join(out, 'MANIFEST.json'),
    JSON.stringify({ target: 'staging', projectRef: ref, files: manifest }, null, 2) + '\n',
  );
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2] ?? '.staging-bundle';
  const m = buildBundle(out, {
    ref: process.env.STAGING_REF,
    confirm: process.env.STAGING_CONFIRM,
  });
  for (const f of m) console.log(`${f.file.padEnd(52)} ${f.sha256}`);
  console.log(
    `\nBundle written to ${out}/supabase/migrations (${m.length} files). Nothing was applied.`,
  );
}
