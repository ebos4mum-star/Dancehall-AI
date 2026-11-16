// Builds the `account` Edge Function as a FLAT set of files (the deploy tool takes a file list, so every relative import must resolve inside it) and checks it:
//   node scripts/edge-bundle.mjs [outDir] [function]     writes .edge-bundle/ (git-ignored) and prints each file's size and SHA-256 (function: account (default) or community)
// It fails if a relative import does not resolve inside the bundle, an `npm:` import is not pinned to an exact version, or a secret-looking value is present.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export function buildBundle(out = '.edge-bundle', fn = 'account') {
  const gen = 'supabase/functions/_shared/generated';
  const files = new Map();
  files.set(
    'index.ts',
    readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8').replace(
      /\.\.\/_shared\/generated\//g,
      './',
    ),
  );
  // Only the generated files this function actually reaches through its imports go into its bundle.
  const available = new Set(readdirSync(gen).filter((x) => x.endsWith('.ts')));
  const queue = ['index.ts'];
  while (queue.length) {
    const src = files.get(queue.pop());
    for (const m of src.matchAll(/from '\.\/([^']+)'/g)) {
      if (!files.has(m[1]) && available.has(m[1])) {
        files.set(m[1], readFileSync(join(gen, m[1]), 'utf8'));
        queue.push(m[1]);
      }
    }
  }
  const problems = [];
  for (const [name, src] of files) {
    for (const m of src.matchAll(/from '([^']+)'/g)) {
      const spec = m[1];
      if (spec.startsWith('.')) {
        const target = spec.replace(/^\.\//, '');
        if (!files.has(target))
          problems.push(`${name}: relative import ${spec} is not in the bundle`);
      } else if (spec.startsWith('npm:')) {
        if (!/^npm:(@[^/@]+\/)?[^/@]+@\d+\.\d+\.\d+(\/|$)/.test(spec))
          problems.push(`${name}: ${spec} is not pinned to an exact version`);
      } else problems.push(`${name}: unexpected import ${spec}`);
    }
    if (
      /service_role|sb_secret_|eyJ[A-Za-z0-9_-]{20,}/.test(
        src.replace(/SUPABASE_SERVICE_ROLE_KEY/g, ''),
      )
    )
      problems.push(`${name}: contains a secret-looking value`);
  }
  if (!files.get('index.ts').includes('Deno.serve'))
    problems.push('index.ts has no Deno.serve entry point');
  if (problems.length) throw new Error(problems.join('\n'));
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const report = [];
  for (const [name, src] of files) {
    writeFileSync(join(out, name), src);
    report.push({
      name,
      bytes: Buffer.byteLength(src),
      sha256: createHash('sha256').update(src).digest('hex'),
    });
  }
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = buildBundle(process.argv[2], process.argv[3]);
  for (const r of report)
    console.log(`${r.name.padEnd(24)} ${String(r.bytes).padStart(7)} bytes  ${r.sha256}`);
  console.log('entrypoint: index.ts   verify_jwt: false (each action authorises itself)');
}
