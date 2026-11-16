-- Rollback of gamification.up.sql. The ledger is derived data (the engine can rebuild it from the person's records), so dropping it loses no source records.
drop function if exists public.gm_rpc(text, jsonb);
drop function if exists app.gm_league(uuid);
drop function if exists app.gm_set_league(uuid, boolean);
drop function if exists app.gm_state(uuid);
drop function if exists app.gm_record(uuid, jsonb);
drop function if exists app.gm_inputs(uuid);
drop table if exists public.gm_league_optin;
drop table if exists public.gm_ledger;
