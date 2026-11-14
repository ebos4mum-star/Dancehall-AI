// Generates the owner-operated Dashboard scripts for the migrations that are not yet applied to the development project.
// Each script is ONE transaction: identity + dependency + re-run guards, the EXACT repository migration text, then its history row.
// `node scripts/make-owner-apply.mjs` writes supabase/owner-apply/*.sql; `--check` verifies they are current (used by the tests).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'supabase', 'owner-apply');
export const STEPS = [
  {
    n: 1,
    name: 'household',
    file: '20261208000100_household.sql',
    needs: ['fit_challenges', 'habits'],
  },
  { n: 2, name: 'wellness', file: '20261209000100_wellness.sql', needs: ['household'] },
  {
    n: 3,
    name: 'household_join_limit',
    file: '20261211000100_household_join_limit.sql',
    needs: ['household', 'wellness'],
  },
  {
    n: 4,
    name: 'celebrations',
    file: '20261212000100_celebrations.sql',
    needs: ['household_join_limit'],
  },
];
export const PROJECT_REF = 'vvwjhbsyxetnktimgaxg';
export const sha = (s) => createHash('sha256').update(s).digest('hex');
const TAG = '$dhmig$';
const GUARD = '$guard$';

export function build(step) {
  const sql = readFileSync(join(root, 'supabase', 'migrations', step.file), 'utf8');
  if (sql.includes(TAG)) throw new Error('migration contains the quoting tag');
  const needs = step.needs.map((n) => `'${n}'`).join(', ');
  const body = sql.trimEnd();
  return `-- OWNER-APPLIED MIGRATION ${step.n} of ${STEPS.length}: ${step.name}
-- Repository file: supabase/migrations/${step.file}
-- SHA-256 of that file: ${sha(sql)}
-- Run ONLY in the Supabase Dashboard SQL Editor of project ${PROJECT_REF} (development). Do not run it twice: a guard stops a re-run.
-- Everything below is one transaction: if any statement fails, nothing is applied and nothing is recorded.
begin;

do ${GUARD}
begin
  -- Identity: this must be the DanceHall development database (its first migration is recorded under this exact version and name).
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261114150446' and name = 'identity_consent') then
    raise exception 'Wrong project: the DanceHall identity_consent migration is not recorded here. Nothing was applied.';
  end if;
  -- Not already applied.
  if exists (select 1 from supabase_migrations.schema_migrations where name = '${step.name}') then
    raise exception '${step.name} is already recorded as applied. Do not run this again. Nothing was changed.';
  end if;
  -- Order: everything this one depends on is already recorded.
  if (select count(*) from supabase_migrations.schema_migrations where name in (${needs})) <> ${step.needs.length} then
    raise exception 'Out of order: apply ${step.needs.join(', ')} first. Nothing was applied.';
  end if;
end
${GUARD};

-- ===== BEGIN exact repository migration: ${step.file} =====
${body}
-- ===== END exact repository migration =====

-- History, in the same format the migration tool records: apply-time version, the migration's name, and its text.
insert into supabase_migrations.schema_migrations (version, name, statements)
values (to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS'), '${step.name}', array[${TAG}${body}
${TAG}]);

commit;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  mkdirSync(out, { recursive: true });
  let bad = 0;
  for (const s of STEPS) {
    const p = join(out, `${String(s.n).padStart(2, '0')}_${s.name}.sql`);
    const want = build(s);
    if (check) {
      if (!existsSync(p) || readFileSync(p, 'utf8') !== want) {
        console.error(`out of date: ${p}`);
        bad++;
      }
    } else writeFileSync(p, want);
  }
  if (check) process.exit(bad ? 1 : 0);
  console.log(`wrote ${STEPS.length} scripts to supabase/owner-apply`);
}
