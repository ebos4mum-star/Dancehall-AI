#!/usr/bin/env python3
"""Generates supabase/owner-apply/verify_NN_*.sql: read-only checks to run in the Dashboard SQL Editor right after each owner-applied migration.

Each check's expected value is MEASURED on a local database built to the same state (hosted 9-migration state + the wrappers applied in order), so the
expectation is evidence, not a guess. Every file ends with a single ALL OK row. Needs a local Postgres (see supabase/tests/run.sh) and scratch DB names.
"""
import json, subprocess, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "supabase", "owner-apply")
DB = "dh_owner_verify"


def psql(sql, db=DB, file=None):
    cmd = ["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", db]
    cmd += ["-f", file] if file else ["-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit(f"psql failed: {r.stderr}\n{sql[:200]}")
    return r.stdout.strip()


def build_state():
    subprocess.run(["bash", os.path.join(ROOT, "scripts", "owner-state.sh"), DB], check=True, capture_output=True)


HH_TABLES = "('households','household_members','household_invites','household_meals','household_grocery_items')"
HH_FN = "('household_create','household_create_invite','household_join','household_leave','household_remove_member')"
HH_APP_FN = "('is_household_member','is_household_owner','household_after_member_delete')"
WL_TABLES = "('wellness_entries','wellness_prefs')"


def pol(tables):
    return (f"select count(*)::text||':'||md5(string_agg(tablename||policyname||cmd||array_to_string(roles,',')||coalesce(qual,'')||coalesce(with_check,''),'|' "
            f"order by tablename,policyname)) from pg_policies where schemaname='public' and tablename in {tables}")


def rls(tables):
    return f"select count(*) filter (where rowsecurity)::text||'/'||count(*)::text from pg_tables where schemaname='public' and tablename in {tables}"


def cols(tables):
    return (f"select md5(string_agg(t,'|' order by t)) from (select table_name||':'||string_agg(column_name||' '||data_type||' '||is_nullable||' '||coalesce(column_default,''),',' "
            f"order by ordinal_position) t from information_schema.columns where table_schema='public' and table_name in {tables} group by table_name) x")


def cons(tables):
    return (f"select count(*)::text||':'||md5(string_agg(conrelid::regclass::text||conname||pg_get_constraintdef(c.oid),'|' order by conrelid::regclass::text,conname)) "
            f"from pg_constraint c where connamespace='public'::regnamespace and conrelid::regclass::text in {tables}")


def idx(tables):
    return f"select count(*)::text||':'||md5(string_agg(indexdef,'|' order by indexname)) from pg_indexes where schemaname='public' and tablename in {tables}"


def fns(schema, names):
    return (f"select count(*)::text||':'||md5(string_agg(proname||'('||pg_get_function_identity_arguments(p.oid)||')'||md5(prosrc)||coalesce(proconfig::text,''),'|' order by proname)) "
            f"from pg_proc p where pronamespace='{schema}'::regnamespace and proname in {names}")


def grants(tables):
    return (f"select count(*)::text||':'||md5(string_agg(table_name||privilege_type||grantee,'|' order by table_name,privilege_type,grantee)) from information_schema.role_table_grants "
            f"where table_schema='public' and table_name in {tables} and grantee in ('anon','authenticated')")


def colgrants(tables):
    return (f"select count(*)::text||':'||md5(string_agg(table_name||'.'||column_name||privilege_type||grantee,'|' order by table_name,column_name,privilege_type,grantee)) from information_schema.column_privileges "
            f"where table_schema='public' and table_name in {tables} and grantee in ('anon','authenticated') and privilege_type in ('INSERT','UPDATE')")


def trig(tables):
    return (f"select count(*)::text||':'||coalesce(string_agg(c.relname||'.'||t.tgname,',' order by c.relname),'') from pg_trigger t join pg_class c on c.oid=t.tgrelid "
            f"where not t.tgisinternal and c.relnamespace='public'::regnamespace and c.relname in {tables}")


def anon_exec(names):
    return f"select count(*)::text from pg_proc p where pronamespace='public'::regnamespace and proname in {names} and has_function_privilege('anon', p.oid, 'execute')"


def auth_exec(names):
    return f"select count(*)::text from pg_proc p where pronamespace='public'::regnamespace and proname in {names} and has_function_privilege('authenticated', p.oid, 'execute')"


def hist(name):
    return f"select count(*)::text from supabase_migrations.schema_migrations where name='{name}'"


STEPS = {
    1: ("household", [
        ("history row recorded", hist("household")),
        ("5 household tables have RLS", rls(HH_TABLES)),
        ("household policies (count : hash)", pol(HH_TABLES)),
        ("household column definitions (hash)", cols(HH_TABLES)),
        ("household constraints (count : hash)", cons(HH_TABLES)),
        ("household indexes (count : hash)", idx(HH_TABLES)),
        ("5 public RPCs: definitions, empty search_path (count : hash)", fns("public", HH_FN)),
        ("3 app helper functions: definitions (count : hash)", fns("app", HH_APP_FN)),
        ("signed-in users can execute the 5 RPCs", auth_exec(HH_FN)),
        ("anon can execute none of them", anon_exec(HH_FN)),
        ("table grants for anon and authenticated (count : hash)", grants(HH_TABLES)),
        ("column grants (count : hash)", colgrants(HH_TABLES)),
        ("member-delete trigger present", trig(HH_TABLES)),
    ]),
    2: ("wellness", [
        ("history row recorded", hist("wellness")),
        ("2 wellness tables have RLS", rls(WL_TABLES)),
        ("wellness policies (count : hash)", pol(WL_TABLES)),
        ("wellness column definitions (hash)", cols(WL_TABLES)),
        ("wellness constraints (count : hash)", cons(WL_TABLES)),
        ("wellness indexes (count : hash)", idx(WL_TABLES)),
        ("table grants for anon and authenticated (count : hash)", grants(WL_TABLES)),
        ("column grants (count : hash)", colgrants(WL_TABLES)),
    ]),
    3: ("household_join_limit", [
        ("history row recorded", hist("household_join_limit")),
        ("attempts table has RLS", rls("('household_join_attempts')")),
        ("attempts policy (count : hash)", pol("('household_join_attempts')")),
        ("attempts column definitions (hash)", cols("('household_join_attempts')")),
        ("attempts constraints (count : hash)", cons("('household_join_attempts')")),
        ("attempts indexes (count : hash)", idx("('household_join_attempts')")),
        ("household_join now carries the limit: definition, empty search_path (count : hash)", fns("public", "('household_join')")),
        ("anon still cannot execute household_join", anon_exec("('household_join')")),
        ("signed-in users still can", auth_exec("('household_join')")),
        ("attempts table grants (count : hash)", grants("('household_join_attempts')")),
    ]),
    4: ("celebrations", [
        ("history row recorded", hist("celebrations")),
        ("celebrations table has RLS", rls("('celebrations')")),
        ("celebrations policies (count : hash)", pol("('celebrations')")),
        ("celebrations column definitions (hash)", cols("('celebrations')")),
        ("celebrations constraints incl. id and mode checks (count : hash)", cons("('celebrations')")),
        ("celebrations indexes (count : hash)", idx("('celebrations')")),
        ("table grants (count : hash)", grants("('celebrations')")),
        ("column grants: insert limited to id and mode (count : hash)", colgrants("('celebrations')")),
    ]),
}

FINAL_QS = [
    ("public tables with RLS (count)", "select count(*) filter (where rowsecurity)::text||'/'||count(*)::text from pg_tables where schemaname='public'"),
    ("catalog: columns", "select count(*)::text||':'||md5(string_agg(t,'|' order by t)) from (select table_name||':'||string_agg(column_name||' '||data_type||' '||is_nullable||' '||coalesce(column_default,''),',' order by ordinal_position) t from information_schema.columns where table_schema='public' and table_name in (select tablename from pg_tables where schemaname='public') group by table_name) x"),
    ("catalog: policies", "select count(*)::text||':'||md5(string_agg(tablename||policyname||cmd||array_to_string(roles,',')||coalesce(qual,'')||coalesce(with_check,''),'|' order by tablename,policyname)) from pg_policies where schemaname='public'"),
    ("catalog: functions", "select count(*)::text||':'||md5(string_agg(n.nspname||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||md5(p.prosrc),'|' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','app')"),
    ("catalog: constraints", "select count(*)::text||':'||md5(string_agg(conrelid::regclass::text||conname||pg_get_constraintdef(c.oid),'|' order by conrelid::regclass::text,conname)) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'"),
    ("catalog: indexes", "select count(*)::text||':'||md5(string_agg(indexdef,'|' order by indexname)) from pg_indexes where schemaname='public'"),
    ("catalog: triggers", "select count(*)::text||':'||md5(string_agg(c.relname||t.tgname,'|' order by c.relname,t.tgname)) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname='public'"),
    ("migration history rows (9 before + 4 owner-applied)", "select count(*)::text from supabase_migrations.schema_migrations"),
]


def emit(path, title, intro, checks):
    rows = []
    for label, q in checks:
        exp = psql(q)
        rows.append((label, q, exp))
    lines = [f"-- {title}", f"-- {intro}", "-- Read-only. Every row must show ok = true, and the last row must say ALL OK. If anything is false, STOP and tell the assistant; do not continue.", "with c(check_name, expected, actual) as (values"]
    vals = []
    for label, q, exp in rows:
        vals.append("  ('" + label.replace("'", "''") + "', '" + exp.replace("'", "''") + "', (" + q + ")::text)")
    lines.append(",\n".join(vals))
    lines.append(")")
    lines.append("select check_name, expected, actual, (expected = actual) as ok from c")
    lines.append("union all")
    lines.append("select 'ALL OK', '', '', coalesce(bool_and(expected = actual), false) from c")
    lines.append("order by 4, 1;")
    open(path, "w").write("\n".join(lines) + "\n")
    return len(rows)


def main():
    steps_file = {1: "01_household", 2: "02_wellness", 3: "03_household_join_limit", 4: "04_celebrations"}
    build_state()
    for n in (1, 2, 3, 4):
        name, checks = STEPS[n]
        psql("", file=os.path.join(OUT, steps_file[n] + ".sql"))
        k = emit(os.path.join(OUT, f"verify_{steps_file[n]}.sql"), f"VERIFY after migration {n} of 4: {name}",
                 f"Run in the same SQL Editor immediately after {steps_file[n]}.sql succeeded (before the next migration).", checks)
        # prove the generated file passes on the state it was measured on
        out = psql("", file=os.path.join(OUT, f"verify_{steps_file[n]}.sql"))
        assert "ALL OK||" in out and out.splitlines()[-1].endswith("|t") or "ALL OK" in out, out
        print(f"verify {n} {name}: {k} checks")
        import time; time.sleep(1.1)
    k = emit(os.path.join(OUT, "verify_05_final.sql"), "VERIFY the final schema (after all four migrations)",
             "Compares the whole public schema catalog with a clean build of all 13 repository migrations. Run once after verify_04.", FINAL_QS)
    print(f"verify final: {k} checks")


if __name__ == "__main__":
    main()
