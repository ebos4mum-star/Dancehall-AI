# Community staging: setup steps for the owner

**Status:** instructions only. Nothing has been created, applied or deployed. Do **not** paste API keys, database passwords or service-role keys into chat: none of the steps below need them to leave your machine. The only value you send back is the staging project **reference** (20 letters).

## 0. Read-only identification of the existing Supabase projects (2026-11-16)

Nothing was changed. The connected organization is `dancehall-fit-ai-dev`, which holds both projects. It _looks like_ the DanceHall organization, but ownership is not confirmed, so the older warning in `docs/LIVE_INTEGRATION.md` and `docs/COMMUNITY_STAGING_READINESS.md` stays until you confirm.

| Project                        | Reference              | Region    | Created              | What I found (read-only)                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------ | ---------------------- | --------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "ebos4mum@gmail.com's Project" | `vvwjhbsyxetnktimgaxg` | us-east-2 | 2026-11-14 01:39 UTC | The documented development project. The repository names it in 8 files (`apps/mobile/src/data/live/liveGuard.ts`, `scripts/live-test-users.sh`, `supabase/hosted-history.json`, and the activation, verification and review docs) and records its migration history.                                                                                           |
| "DanceHall project."           | `bxhnrjulksganzydgrgm` | us-east-1 | 2026-11-14 15:16 UTC | **Empty and unreferenced.** No migrations, no tables in `public`, no Edge Functions (checked with metadata-only calls; no rows were read). **No reference to it in the repository**: not in the working tree, not in any branch or remote ref, not anywhere in git history (`git log --all -S`). No EAS or workflow file mentions any `*.supabase.co` address. |

What this does and does not show:

- It does **not** show that `bxhnrj…` is safe. An empty project could still be wired up elsewhere (an Expo/EAS environment variable, a hosting dashboard, another repository, a saved note) where I cannot look. It was created about 14 hours after the dev project, on the same day, which fits a duplicate or an experiment, but that is a guess.
- The two saved routines list a Supabase connection but their prompts do not name a project.
- **You can settle it in two minutes:** in the Supabase dashboard open `bxhnrj…` > Settings > API and look at the project URL, then search your Expo (EAS) project's environment variables, your hosting provider, and any other repository for that URL. If nothing uses it, you can decide yourself whether to pause or delete it. I will not.

Both references are now permanently refused by the staging scripts (`scripts/staging/guard.mjs`), so neither can be targeted by mistake.

## 1. Why a separate account

Supabase counts free projects per account (the owner or administrator across their organizations). `ebos4mum@gmail.com` is at the limit of 2, so a third free project cannot be made under it, and a new _organization_ under the same account would not help. A different Supabase account (a different sign-in identity that you control) has its own free allowance and is completely separate from the two existing projects: separate database, Auth users, keys, storage and billing. Check Supabase's current terms about holding more than one account before you rely on this (I could not read them from here).

## 2. Create the staging project (about 10 minutes, in a browser)

1. Sign out of Supabase. Sign up with a **different email address you control**, for example a dedicated address for this staging work. Keep it separate from `ebos4mum@gmail.com`.
2. Create an organization. Suggested name: `dancehall-staging`. Choose the **Free** plan.
3. Create a project:
   - Name: `dancehall-community-staging`
   - Region: **East US (North Virginia)** (`us-east-1`)
   - Plan: Free. If the dashboard shows any price, stop and tell me.
   - Database password: use the **Generate** button and save it in a password manager. Do not type it into chat, a ticket or a file in the repository.
4. Wait until the project shows as healthy.
5. In **Authentication > Sign In / Providers**: keep the Email provider enabled and turn **off** "Allow new users to sign up". In **Authentication > Sessions** (or Settings) set the JWT expiry to **900** seconds. In **Authentication > Multi-Factor**, confirm TOTP is enabled. If any of these is missing on the plan, tell me what the dashboard shows.
6. Copy the project **reference**: it is the 20-letter part of the dashboard address `https://supabase.com/dashboard/project/<reference>`.

**Send me only:** the reference, the region, the plan name, and a yes or no for each item in step 5. Nothing else.

## 3. What happens next (me)

When I have the reference I will:

- confirm it is not either known project and that it does not appear in the organization my connection can see (that absence is what proves it is a separate account);
- record it in `docs/COMMUNITY_STAGING_READINESS.md` (reference and configuration only);
- give you the exact commands for section 4 for your machine, because I cannot reach a project in an account my connection is not signed in to.

## 4. Applying it on your machine (after I confirm the reference)

Needs Node 22, pnpm, git, the Supabase CLI and a checkout of the branch that contains `scripts/staging/` (it is committed locally; it needs your approval to push, see section 6).

```bash
# 1. Put the reference in your shell. The guard refuses the two existing projects.
export STAGING_REF=<your 20-letter staging reference>
export STAGING_CONFIRM=I-AM-USING-THE-STAGING-PROJECT

# 2. Assemble the reviewed migration set in a throwaway folder (nothing is applied; prints a checksum per file).
node scripts/staging/prepare-bundle.mjs .staging-bundle

# 3. Link ONLY that folder to the staging project (it asks for the database password; type it into the CLI, never into chat).
cd .staging-bundle
supabase init
supabase login        # the staging account
supabase link --project-ref "$STAGING_REF"
supabase projects list   # confirm the linked project is the staging one

# 4. Preview, then apply.
supabase db push --include-all --dry-run
supabase db push --include-all
```

Never run `supabase link` or `db push` from the repository root: it could point at another project. The bundle folder exists so the CLI can only see the staging files.

**Check access before anything is deployed** (stop immediately if any line says FAIL):

```bash
cd ..    # back to the repository root
export STAGING_PUBLISHABLE_KEY=<the PUBLISHABLE key, from Project Settings > API Keys>   # public by design; never a secret key
node scripts/staging/check-access.mjs db
```

Also run these in the SQL editor and send me the results (they contain no secrets):

```sql
-- every public table has row-level security (expect no rows)
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- the door: anon false, authenticated false, service_role true
select has_function_privilege('anon','public.community_rpc(text,jsonb)','execute') as anon,
       has_function_privilege('authenticated','public.community_rpc(text,jsonb)','execute') as authenticated,
       has_function_privilege('service_role','public.community_rpc(text,jsonb)','execute') as service_role;
-- no community function is executable by clients (expect 0)
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname in ('app','public') and (p.proname like 'community\_%' and p.proname <> 'community_rpc' or p.proname = 'purge_due_account_deletions')
   and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'));
-- defaults: open, video off, comments off
select mode, video_enabled, comments_enabled from public.community_settings;
-- photo bucket: private, 8 MB, images only
select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'community-media';
```

## 5. Secrets and the function (still in Read only)

Generate each value in your own terminal and **save it in your password manager before using it**:

```bash
export ACCOUNT_PEPPER="$(openssl rand -base64 48)";            echo "$ACCOUNT_PEPPER"
export MAINTENANCE_KEY="$(openssl rand -hex 32)";              echo "$MAINTENANCE_KEY"
export COMMUNITY_PEPPER="$(openssl rand -base64 48)";          echo "$COMMUNITY_PEPPER"
export COMMUNITY_MAINTENANCE_KEY="$(openssl rand -hex 32)";    echo "$COMMUNITY_MAINTENANCE_KEY"
# (save the four lines above, then clear your terminal history)

cd .staging-bundle
supabase secrets set ACCOUNT_PEPPER="$ACCOUNT_PEPPER" MAINTENANCE_KEY="$MAINTENANCE_KEY" \
  COMMUNITY_PEPPER="$COMMUNITY_PEPPER" COMMUNITY_MAINTENANCE_KEY="$COMMUNITY_MAINTENANCE_KEY" \
  COMMUNITY_FLOOR_MODE=read_only --project-ref "$STAGING_REF"
supabase functions deploy account   --no-verify-jwt --project-ref "$STAGING_REF"
supabase functions deploy community --no-verify-jwt --project-ref "$STAGING_REF"
cd ..
node scripts/staging/check-access.mjs function
```

Leave **unset**: `COMMUNITY_COMMENTS`, `COMMUNITY_ALERTS` and every `COMMUNITY_ALERT_*` variable, `COMMUNITY_DEBUG`. Comments, video and email alerts stay off.

Then I continue with the rest of `docs/COMMUNITY_STAGING_READINESS.md` section 10 (members, moderator accounts with authenticator MFA, photo upload, moderation, deletion, memory), using synthetic accounts only. Because I cannot sign in to your staging account, you will run each step and paste the non-secret result, or give me a read-only way to inspect it that you control.

## 6. Approvals I still need from you

1. Confirm ownership of `dancehall-fit-ai-dev` (so the old warning can be corrected), and the outcome of your check on `bxhnrj…`.
2. Permission to **push** the local branch `claude/app-store-readiness` (it holds the staging scripts, the App Store checklist and the account-deletion proposal). Without a push you cannot get the scripts onto your machine except by another route you choose.
3. The staging reference, once you have made the project.
4. Whether to apply the account-deletion executor to staging (it is in the bundle by default; remove the last line of `EXTRA` in `scripts/staging/prepare-bundle.mjs` to omit it).
