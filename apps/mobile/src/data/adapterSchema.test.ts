/**
 * Static contract between the Supabase adapters and the migrations: every table the adapters touch exists with RLS enabled, and every plain
 * column they SELECT (or filter, order or write by name) exists on that table. A renamed or missing column fails here, not on a phone.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..', '..');
const migrations = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(root, 'supabase', 'migrations', f), 'utf8'))
  .join('\n');
const SOURCES = [
  'apps/mobile/src/data/supabaseStore.ts',
  'apps/mobile/src/data/supabaseCoach.ts',
  'packages/ai/src/server/supabase-repo.ts',
].map((p) => [p, readFileSync(join(root, p), 'utf8')] as const);

function splitTop(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}
function columnsOf(table: string): Set<string> | null {
  const start = migrations.indexOf(`create table public.${table} (`);
  if (start < 0) return null;
  let depth = 0;
  let end = start;
  for (let i = migrations.indexOf('(', start); i < migrations.length; i++) {
    if (migrations[i] === '(') depth++;
    if (migrations[i] === ')' && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = migrations.slice(migrations.indexOf('(', start) + 1, end).replace(/--.*$/gm, '');
  const cols = new Set<string>();
  for (const item of splitTop(body)) {
    const first = item.replace(/--.*$/gm, '').trim().split(/\s+/)[0]!.replace(/"/g, '');
    if (first && !/^(constraint|primary|unique|check|foreign|exclude)$/i.test(first))
      cols.add(first);
  }
  for (const m of migrations.matchAll(
    new RegExp(`alter table public\\.${table}\\s+add column (?:if not exists )?(\\w+)`, 'gi'),
  ))
    cols.add(m[1]!);
  return cols;
}

interface Use {
  file: string;
  table: string;
  columns: string[];
}
function uses(): Use[] {
  const found: Use[] = [];
  for (const [file, src] of SOURCES) {
    const re = /\.from\('([a-z_]+)'\)/g;
    const marks = [...src.matchAll(re)];
    marks.forEach((m, i) => {
      const chunk = src.slice(m.index!, marks[i + 1]?.index ?? m.index! + 600).slice(0, 700);
      const columns: string[] = [];
      const sel = /\.select\(\s*'([^']*)'/.exec(chunk)?.[1];
      if (sel)
        for (const part of splitTop(sel)) {
          const p = part.trim();
          if (!p || p === '*' || p.includes('(') || p.includes('!') || p.includes(':')) continue;
          columns.push(p);
        }
      for (const f of chunk.matchAll(/\.(?:eq|gte|lte|lt|gt|order|is|neq)\(\s*'([a-z_]+)'/g))
        columns.push(f[1]!);
      for (const w of chunk.matchAll(/\.(?:insert|update|upsert)\(\s*\{([^}]*)\}/g))
        for (const k of w[1]!.matchAll(/(?:^|[,{\s])([a-z_]+)\s*:/g)) columns.push(k[1]!);
      found.push({ file, table: m[1]!, columns });
    });
  }
  return found;
}

describe('Supabase adapters match the migrations', () => {
  const all = uses();
  it('finds the adapter queries (guards against the scan silently matching nothing)', () => {
    expect(all.length).toBeGreaterThan(80);
    expect(new Set(all.map((u) => u.table)).size).toBeGreaterThan(25);
  });
  it('every table the adapters touch exists and has row-level security enabled', () => {
    for (const table of new Set(all.map((u) => u.table))) {
      expect(columnsOf(table), `table ${table} exists`).not.toBeNull();
      expect(
        migrations.includes(`alter table public.${table} enable row level security`),
        `RLS on ${table}`,
      ).toBe(true);
    }
  });
  it('every named column exists on its table', () => {
    const missing: string[] = [];
    for (const u of all) {
      const cols = columnsOf(u.table);
      if (!cols) continue;
      for (const c of new Set(u.columns))
        if (!cols.has(c)) missing.push(`${u.file}: ${u.table}.${c}`);
    }
    expect(missing).toEqual([]);
  });
  it('every RPC the adapters call exists as a public function, executable by the right role', () => {
    const missing: string[] = [];
    let n = 0;
    for (const [file, src] of SOURCES)
      for (const m of src.matchAll(/\.rpc\(\s*'([a-z_]+)'/g)) {
        n++;
        const fn = m[1]!;
        if (!new RegExp(`create (?:or replace )?function public\\.${fn}\\b`, 'i').test(migrations))
          missing.push(`${file}: ${fn}`);
        else if (
          !new RegExp(`grant execute on function[^;]*public\\.${fn}\\b[^;]*to`, 'i').test(
            migrations,
          )
        )
          missing.push(`${file}: ${fn} has no execute grant`);
      }
    expect(n).toBeGreaterThan(0);
    expect(missing).toEqual([]);
  });
});
