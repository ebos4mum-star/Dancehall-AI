// The AI gateway lives in packages/ai (TypeScript, tested). Edge Functions run on Deno and cannot import from the pnpm workspace, so, like the account logic, it is COPIED into
// supabase/functions/_shared/generated/ as one self-contained file with Deno-style import specifiers. The copy is generated, never hand-edited:
//   node scripts/build-ai-function.mjs           rewrite supabase/functions/_shared/generated/ai-gateway.ts
//   node scripts/build-ai-function.mjs --check   fail if the copy is stale (runs in `pnpm check:edge` and CI)
// The bundle imports only `zod` (pinned to the installed version); the Supabase client is passed in by supabase/functions/ai/index.ts.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const OUT = 'supabase/functions/_shared/generated/ai-gateway.ts';
// The version zod resolves to FROM packages/ai (its own dependency), pinned exactly in the Deno import.
const zod = JSON.parse(
  readFileSync(
    createRequire(new URL('../packages/ai/package.json', import.meta.url)).resolve(
      'zod/package.json',
    ),
    'utf8',
  ),
).version;

export async function bundle() {
  const r = await build({
    entryPoints: ['packages/ai/src/edge.ts'],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    external: ['zod', '@supabase/supabase-js'],
    legalComments: 'none',
    write: false,
    logLevel: 'warning',
  });
  const body = r.outputFiles[0].text
    // esbuild writes double quotes; the generated files use the repository's single-quote style and the bundle checker reads single quotes.
    .replace(/from "zod"/g, `from 'npm:zod@${zod}'`);
  const bare = [...body.matchAll(/(?:from|import)\s+"([^"]+)"/g)].map((m) => m[1]);
  const left = [...body.matchAll(/from '([^']+)'/g)]
    .map((m) => m[1])
    .filter((s) => !s.startsWith('npm:'));
  if (bare.length || left.length)
    throw new Error(`the AI bundle has an unexpected import: ${[...bare, ...left].join(', ')}`);
  return `// GENERATED from packages/ai/src/edge.ts by scripts/build-ai-function.mjs. Do not edit: change the source and run \`node scripts/build-ai-function.mjs\`.\n${body}`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const want = await bundle();
  const have = existsSync(OUT) ? readFileSync(OUT, 'utf8') : null;
  if (process.argv.includes('--check')) {
    if (have === want) console.log('The AI gateway copy is up to date.');
    else {
      console.error(
        `stale: ${OUT}\nThe AI gateway copy is out of date. Run: node scripts/build-ai-function.mjs`,
      );
      process.exit(1);
    }
  } else if (have !== want) {
    writeFileSync(OUT, want);
    console.log(`wrote ${OUT} (${want.length} bytes)`);
  } else console.log('unchanged');
}
