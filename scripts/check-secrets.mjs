// Scans tracked and untracked (non-ignored) files for secret-looking values. The repository is PUBLIC.
// Prints only file, line and rule name; never the matched value.
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { scanText } from './secret-patterns.mjs';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const BINARY = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|mp4|mov|pdf|lock)$/i;
const SELF = new Set(['scripts/secret-patterns.mjs', 'scripts/secret-patterns.test.mjs']);
const findings = [];
for (const f of files) {
  if (BINARY.test(f) || SELF.has(f) || f === 'pnpm-lock.yaml') continue;
  let st;
  try {
    st = statSync(f);
  } catch {
    continue;
  }
  if (!st.isFile() || st.size > 2_000_000) continue;
  const text = readFileSync(f, 'utf8');
  for (const hit of scanText(text, f)) findings.push({ file: f, ...hit });
}
// A committed .env file (other than .env.example) is itself a finding.
for (const f of files)
  if (/(^|\/)\.env(\.|$)/.test(f) && !/\.env\.example$/.test(f))
    findings.push({ file: f, line: 0, rule: 'env-file-tracked' });

if (findings.length) {
  console.error('Possible secrets found (values are not printed):');
  for (const x of findings) console.error(`  ${x.file}:${x.line}  ${x.rule}`);
  process.exit(1);
}
console.log(`Secret scan passed (${files.length} files checked).`);
