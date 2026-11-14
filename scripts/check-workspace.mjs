// Workspace/package consistency checks: required structure, internal dependency declarations, pinned toolchain.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const errors = [];
const LOCAL_RULES_FILE = 'scripts/forbidden-references.local.txt';
const LOCAL_FORBIDDEN = existsSync(LOCAL_RULES_FILE)
  ? readFileSync(LOCAL_RULES_FILE, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
      .map((l) => new RegExp(l, 'i'))
  : [];
const fail = (m) => errors.push(m);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

for (const p of [
  'apps/mobile',
  'apps/admin',
  'packages/shared',
  'packages/ai',
  'supabase/migrations',
  'supabase/tests',
  'supabase/functions',
  'evals',
  'docs',
  'scripts',
  '.github/workflows',
])
  if (!existsSync(p)) fail(`missing required path: ${p}`);

const REQUIRED_DOCS = [
  'MASTER_SPEC',
  'IMPLEMENTATION_ROADMAP',
  'ARCHITECTURE',
  'DECISIONS',
  'SECURITY_PRIVACY',
  'AI_COST_CONTROLS',
  'NUTRITION_SAFETY',
  'FITNESS_SAFETY',
  'CONTENT_LICENSING',
  'GLOBAL_READINESS',
];
for (const d of REQUIRED_DOCS) if (!existsSync(`docs/${d}.md`)) fail(`missing doc: docs/${d}.md`);

const pkgs = new Map();
for (const dir of ['apps', 'packages']) {
  for (const name of readdirSync(dir)) {
    const f = join(dir, name, 'package.json');
    if (existsSync(f)) pkgs.set(readJson(f).name, { dir: join(dir, name), json: readJson(f) });
  }
}
for (const [name, { dir, json }] of pkgs) {
  if (json.private !== true) fail(`${name}: must be private`);
  if (!name.startsWith('@dancehall/'))
    fail(`${name}: workspace packages use the @dancehall/ scope`);
  for (const field of ['dependencies', 'devDependencies']) {
    for (const [dep, range] of Object.entries(json[field] ?? {})) {
      if (dep.startsWith('@dancehall/')) {
        if (!pkgs.has(dep)) fail(`${name}: depends on unknown workspace package ${dep}`);
        if (range !== 'workspace:*') fail(`${name}: ${dep} must use workspace:*`);
      }
      if (!dep.startsWith('@dancehall/') && LOCAL_FORBIDDEN.some((re) => re.test(dep)))
        fail(`${name}: forbidden dependency on another product (${dep})`);
    }
  }
  if (!existsSync(join(dir, 'tsconfig.json'))) fail(`${name}: missing tsconfig.json`);
}

const root = readJson('package.json');
if (!/^pnpm@\d/.test(root.packageManager ?? '')) fail('root package.json must pin packageManager');
if (!existsSync('.nvmrc')) fail('missing .nvmrc');
if (!existsSync('.env.example')) fail('missing .env.example');
if (!existsSync('pnpm-lock.yaml')) fail('missing pnpm-lock.yaml (run pnpm install)');

// Separation from other products. This repository is PUBLIC, so it must not name another product's infrastructure.
// 1) Generic rule (enforced in CI): the only Supabase hostname allowed is the documented placeholder; a real-looking
//    20-letter project reference fails the check.
// 2) Local rule: product names and project identifiers to keep out are listed one regex per line in the git-ignored file
//    scripts/forbidden-references.local.txt, so the list itself never ships. Run `pnpm check:workspace` locally to apply it.
const SUPABASE_PROJECT_HOST = /\b[a-z]{20}\.supabase\.(?:co|com|in)\b|\bdb\.[a-z]{20}\.supabase\./;
const SELF = new Set(['scripts/check-workspace.mjs']);
import { execFileSync } from 'node:child_process';
for (const f of execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean)) {
  if (SELF.has(f) || /\.(png|jpe?g|lock|yaml)$/.test(f)) continue;
  if (f === 'pnpm-lock.yaml' || !existsSync(f)) continue;
  const text = readFileSync(f, 'utf8');
  if (SUPABASE_PROJECT_HOST.test(text))
    fail(
      `${f}: contains a Supabase project hostname (use a placeholder; real project references stay out of this public repo)`,
    );
  for (const re of LOCAL_FORBIDDEN)
    if (re.test(text)) fail(`${f}: references another product (local forbidden-references rule)`);
}

if (errors.length) {
  console.error('Workspace check failed:\n' + errors.map((e) => `  - ${e}`).join('\n'));
  process.exit(1);
}
console.log(
  `Workspace check passed (${pkgs.size} packages, ${REQUIRED_DOCS.length} required docs).`,
);
