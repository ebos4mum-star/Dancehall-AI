-- Community (proposed). Runs after community.up.sql on a throwaway database. Security first: nobody but the server can touch anything.
\set cases `cat supabase/tests/community-cases.json`
select set_config('test.cases', :'cases', false) is not null as loaded \gset

-- 1. Structure and privileges.
do $$
declare t text; f record;
begin
  perform test.as_admin();
  foreach t in array array['community_members', 'community_posts', 'community_media', 'community_comments', 'community_reactions', 'community_reports', 'community_blocks'] loop
    perform test.assert((select relrowsecurity from pg_class where oid = ('public.' || t)::regclass), t || ' has RLS enabled');
    perform test.assert(exists (select 1 from pg_policies where schemaname = 'public' and tablename = t), t || ' carries a policy');
    perform test.assert(not has_table_privilege('anon', 'public.' || t, 'select'), 'anon cannot read ' || t);
    perform test.assert(not has_table_privilege('authenticated', 'public.' || t, 'select'), 'signed-in users cannot read ' || t);
    perform test.assert(not has_table_privilege('authenticated', 'public.' || t, 'insert'), 'signed-in users cannot write ' || t);
    perform test.assert(not has_table_privilege('authenticated', 'public.' || t, 'update'), 'signed-in users cannot update ' || t);
    perform test.assert(not has_table_privilege('authenticated', 'public.' || t, 'delete'), 'signed-in users cannot delete ' || t);
  end loop;
  for f in select p.oid, p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app' and p.proname like 'community\_%' loop
    perform test.assert(not has_function_privilege('anon', f.oid, 'execute'), 'anon cannot execute app.' || f.proname);
    perform test.assert(not has_function_privilege('authenticated', f.oid, 'execute'), 'signed-in users cannot execute app.' || f.proname);
    perform test.assert(has_function_privilege('service_role', f.oid, 'execute'), 'the server can execute app.' || f.proname);
    perform test.assert(not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x where p.oid = f.oid and x.grantee = 0 and x.privilege_type = 'EXECUTE'),
                        'PUBLIC cannot execute app.' || f.proname);
    if f.prosecdef then perform test.assert(f.proconfig is not null and 'search_path=""' = any (f.proconfig), 'app.' || f.proname || ' pins an empty search_path'); end if;
  end loop;
  -- Nothing exposed in public: no community function lives there.
  perform test.assert(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname like 'community%'), 'no community function in the exposed schema');
end $$;

-- 2. Signed-in and anonymous clients really are refused.
do $$
declare a uuid;
begin
  perform test.as_admin();
  a := test.make_user('c-priv-a@example.test');
  perform test.as_user(a);
  perform test.throws($q$select * from public.community_posts$q$, 'permission denied');
  perform test.throws($q$insert into public.community_members (user_id, username) values (auth.uid(), 'sneaky_name')$q$, 'permission denied');
  perform test.throws($q$select app.community_feed(null, null, null, 10)$q$, 'permission denied');
  perform test.throws($q$select app.community_claim_username(auth.uid(), 'sneaky_name')$q$, 'permission denied');
  perform test.as_anon();
  perform test.throws($q$select * from public.community_comments$q$, 'permission denied');
  perform test.throws($q$select app.community_feed(null, null, null, 10)$q$, 'permission denied');
end $$;

-- 3. Rules agree with the TypeScript rules (shared cases).
do $$
declare doc jsonb := current_setting('test.cases')::jsonb; c jsonb; got jsonb; n int := 0;
begin
  perform test.as_admin();
  for c in select * from jsonb_array_elements(doc -> 'text') loop
    got := app.community_screen(c ->> 'text', (c ->> 'max')::int);
    if got ->> 'decision' <> c ->> 'decision' then raise exception 'screen "%": database said %, expected %', left(c ->> 'text', 40), got ->> 'decision', c ->> 'decision'; end if;
    if (select coalesce(jsonb_agg(f order by f), '[]') from jsonb_array_elements_text(got -> 'flags') f) <> (select coalesce(jsonb_agg(f order by f), '[]') from jsonb_array_elements_text(c -> 'flags') f) then
      raise exception 'screen "%": flags % vs %', left(c ->> 'text', 40), got -> 'flags', c -> 'flags';
    end if;
    n := n + 1;
  end loop;
  for c in select * from jsonb_array_elements(doc -> 'usernames') loop
    if (app.community_username_problem(c ->> 'name') is null) <> (c ->> 'ok')::boolean then raise exception 'username "%": database disagrees', c ->> 'name'; end if;
    n := n + 1;
  end loop;
  perform test.assert(n > 60, 'ran the shared cases');
end $$;

-- 4. Behaviour.
do $$
declare a uuid; b uuid; c uuid; d uuid; m uuid; r jsonb; pa uuid; pb uuid; pm uuid; n int; cols text[];
begin
  perform test.as_admin();
  a := test.make_user('c-a@example.test'); b := test.make_user('c-b@example.test'); c := test.make_user('c-c@example.test'); d := test.make_user('c-d@example.test'); m := test.make_user('c-mod@example.test');
  insert into public.staff_roles (user_id, role) values (m, 'moderator');
  perform set_config('role', 'service_role', false);

  -- usernames
  perform test.assert(app.community_claim_username(a, 'Ama_Dances') = 'ama_dances', 'a username is stored lowercase');
  perform test.throws(format($q$select app.community_claim_username(%L, 'AMA_DANCES')$q$, b), 'taken');
  perform test.throws(format($q$select app.community_claim_username(%L, 'again_name')$q$, a), 'already_set');
  perform test.throws(format($q$select app.community_claim_username(%L, 'admin')$q$, b), 'invalid_username');
  perform app.community_claim_username(b, 'kofi_moves'); perform app.community_claim_username(c, 'efua_fit');

  -- posting needs confirmation, a username, and respects the rules
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'Hi', null, null, false)$q$, a), 'not_confirmed');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'Hi', null, null, null)$q$, a), 'not_confirmed');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'Hi', null, null, true)$q$, d), 'needs_username');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'call me 0201234567', null, null, true)$q$, a), 'blocked');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', '', null, null, true)$q$, a), 'blocked');
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'hi', '{"kind":"workout","title":"x"}'::jsonb, null, true)$q$, a), 'invalid_milestone');
  perform test.throws(format($q$select app.community_create_post(%L, 'milestone', 'hi', null, null, true)$q$, a), 'invalid_milestone');
  perform test.throws(format($q$select app.community_create_post(%L, 'photo', 'hi', null, null, true)$q$, a), 'invalid_media');
  r := app.community_create_post(a, 'text', 'First class done!', null, null, true); pa := (r ->> 'id')::uuid;
  perform test.assert(r ->> 'status' = 'published', 'ordinary text publishes');
  r := app.community_create_post(b, 'text', 'Kitchen dancing counts.', null, null, true); pb := (r ->> 'id')::uuid;

  -- a milestone keeps only whitelisted keys; health data in the payload never reaches the table
  r := app.community_create_post(a, 'milestone', 'Finished a workout: Groove', '{"kind":"workout","title":"Groove","style":"reggae","minutes":20,"weightKg":71.2,"kcal":400,"email":"x@y.z"}'::jsonb, null, true);
  perform test.assert((select (milestone ?& array['kind','title','style','minutes']) and not (milestone ? 'weightKg') and not (milestone ? 'kcal') and not (milestone ? 'email') from public.community_posts where id = (r ->> 'id')::uuid), 'milestone whitelist is enforced');
  perform test.assert(r ->> 'status' = 'published', 'a milestone publishes');

  -- risky text is held, media is always held
  r := app.community_create_post(b, 'text', 'I lost 12 kg in 3 weeks', null, null, true);
  perform test.assert(r ->> 'status' = 'held', 'a weight-loss claim is held for review');
  r := app.community_create_post(b, 'photo', 'My journey', null, '[{"kind":"photo","role":"before","path":"u/a.jpg","mime":"image/jpeg","bytes":1000},{"kind":"photo","role":"after","path":"u/b.jpg","mime":"image/jpeg","bytes":1000}]'::jsonb, true);
  perform test.assert(r ->> 'status' = 'held', 'a photo post is held');
  perform test.throws(format($q$select app.community_create_post(%L, 'photo', 'x', null, '[{"kind":"photo","role":"before","path":"a.jpg","mime":"image/jpeg","bytes":1000}]'::jsonb, true)$q$, b), 'invalid_media');
  perform test.throws(format($q$select app.community_create_post(%L, 'photo', 'x', null, '[{"kind":"photo","role":"single","path":"../etc/passwd","mime":"image/jpeg","bytes":1000}]'::jsonb, true)$q$, b), 'violates check|invalid');
  perform test.throws(format($q$select app.community_create_post(%L, 'video', 'x', null, '[{"kind":"video","role":"single","path":"a.mp4","mime":"video/mp4","bytes":1000,"durationS":99}]'::jsonb, true)$q$, b), 'violates check');
  perform test.throws(format($q$select app.community_create_post(%L, 'video', 'x', null, '[{"kind":"video","role":"single","path":"a.exe","mime":"application/x-msdownload","bytes":1000,"durationS":9}]'::jsonb, true)$q$, b), 'violates check');
  r := app.community_create_post(b, 'video', '', null, '[{"kind":"video","role":"single","path":"u/v.mp4","mime":"video/mp4","bytes":2000,"durationS":12}]'::jsonb, true);
  perform test.assert(r ->> 'status' = 'held', 'a video post is held');

  -- the feed: guests see published only; the author sees held; nothing identifies a person except the username
  select count(*) into n from app.community_feed(null, null, null, 30);
  perform test.assert(n = 3, format('a guest sees the 3 published posts (got %s)', n));
  select count(*) into n from app.community_feed(b, null, null, 30);
  perform test.assert(n = 6, format('the author also sees their own held posts (got %s)', n));
  perform test.assert(not exists (select 1 from jsonb_each(to_jsonb((select f from app.community_feed(null, null, null, 1) f))) e where e.key ~* '(user|author_id|email)'), 'the feed row has no user id or email column');
  perform test.assert((select bool_and(author ~ '^[a-z][a-z0-9_]{2,19}$') from app.community_feed(null, null, null, 30)), 'authors are public usernames');
  perform test.assert(not exists (select 1 from app.community_feed(null, null, null, 30) f where f.encouraged_count is not null), 'readers never get a count');
  perform test.assert((select bool_and(created_at <= prev) from (select created_at, lag(created_at) over (order by rn) as prev0, coalesce(lag(created_at) over (order by rn), 'infinity'::timestamptz) as prev from (select f.*, row_number() over () rn from app.community_feed(null, null, null, 30) f) x) y), 'the feed is newest first');
  perform test.assert((select count(*) = 2 from app.community_feed(null, null, null, 2)) and (select count(*) = 1 from app.community_feed(null, (select created_at from app.community_feed(null, null, null, 2) offset 1), (select id from app.community_feed(null, null, null, 2) offset 1), 30)), 'the cursor pages without gaps');

  -- comments
  r := app.community_add_comment(b, pa, 'Well done!');
  perform test.assert(r ->> 'status' = 'published', 'a kind comment publishes');
  perform test.throws(format($q$select app.community_add_comment(%L, %L, 'mail me a@b.com')$q$, b, pa), 'blocked');
  r := app.community_add_comment(c, pa, 'I lost 9 kg with this');
  perform test.assert(r ->> 'status' = 'hidden', 'a risky comment is hidden for review');
  perform test.assert((select count(*) = 1 from app.community_comments(null, pa)), 'a guest sees only the published comment');
  perform test.assert((select count(*) = 2 from app.community_comments(c, pa)), 'the commenter also sees their own hidden one');
  perform test.throws(format($q$select app.community_add_comment(%L, %L, 'hi')$q$, d, pa), 'needs_username');
  perform test.throws(format($q$select app.community_delete_comment(%L, (select id from public.community_comments where author_id = %L limit 1))$q$, c, b), 'not_found');
  perform app.community_delete_comment(a, (select id from public.community_comments where author_id = b limit 1)); -- the post's author may delete it
  perform test.assert((select count(*) = 0 from public.community_comments where author_id = b), 'the post author deleted the comment');

  -- one Encourage: idempotent, not on your own post, a count only for the author
  perform test.assert(app.community_set_encourage(b, pa, true), 'encourage on');
  perform test.assert(app.community_set_encourage(b, pa, true), 'encourage is idempotent');
  perform test.assert((select count(*) = 1 from public.community_reactions where post_id = pa), 'one reaction row');
  perform test.throws(format($q$select app.community_set_encourage(%L, %L, true)$q$, a, pa), 'own_post');
  perform test.assert(app.community_set_encourage(d, pa, true), 'a member without a username may encourage');
  perform test.assert((select encouraged_count = 2 from app.community_feed(a, null, null, 30) where id = pa), 'the author sees how many');
  perform test.assert((select encouraged_count is null from app.community_feed(b, null, null, 30) where id = pa), 'others do not');
  perform test.assert((select encouraged_by_me from app.community_feed(b, null, null, 30) where id = pa), 'a reader knows they encouraged');

  -- blocking: mutual and silent
  perform app.community_block(a, 'kofi_moves');
  perform test.assert(not exists (select 1 from app.community_feed(a, null, null, 30) f where f.author = 'kofi_moves'), 'the blocker no longer sees the blocked member');
  perform test.assert(not exists (select 1 from app.community_feed(b, null, null, 30) f where f.author = 'ama_dances'), 'the blocked member no longer sees the blocker');
  perform test.assert(exists (select 1 from app.community_feed(c, null, null, 30) f where f.author = 'ama_dances') and exists (select 1 from app.community_feed(c, null, null, 30) f where f.author = 'kofi_moves'), 'everyone else is unaffected');
  perform test.throws(format($q$select app.community_add_comment(%L, %L, 'hello')$q$, b, pa), 'not_found');
  perform test.throws(format($q$select app.community_block(%L, 'ama_dances')$q$, a), 'self');
  perform test.throws(format($q$select app.community_block(%L, 'nobody_here')$q$, a), 'not_found');
  perform test.assert((select array_agg(x) = array['kofi_moves'] from app.community_blocked(a) x), 'the blocker can list who they blocked');
  perform test.assert((select count(*) = 0 from app.community_blocked(b)), 'the blocked member cannot see that they were blocked');
  perform app.community_unblock(a, 'kofi_moves');
  perform test.assert(exists (select 1 from app.community_feed(b, null, null, 30) f where f.author = 'ama_dances'), 'unblocking restores visibility');

  -- reporting: three different people, or one serious report, hide content; the reporter is never exposed
  perform test.throws(format($q$select app.community_report(%L, 'post', %L, 'spam', null)$q$, a, pa), 'own_content');
  perform app.community_report(b, 'post', pa, 'spam', null); perform app.community_report(b, 'post', pa, 'spam', null);
  perform test.assert((select status = 'published' from public.community_posts where id = pa), 'one person reporting twice does not hide a post');
  perform app.community_report(c, 'post', pa, 'harassment', null);
  perform app.community_report(d, 'post', pa, 'other', null);
  perform test.assert((select status = 'hidden' from public.community_posts where id = pa), 'three different reporters hide it');
  perform test.assert(not exists (select 1 from app.community_feed(null, null, null, 30) f where f.id = pa), 'a hidden post leaves the public feed');
  perform test.assert(exists (select 1 from app.community_feed(a, null, null, 30) f where f.id = pa and f.status = 'hidden'), 'its author still sees it, labelled');
  perform app.community_report(c, 'post', pb, 'self_harm', null);
  perform test.assert((select status = 'hidden' and flags @> array['self_harm'] from public.community_posts where id = pb), 'a self-harm report hides at once and flags it');

  -- moderation: only a moderator with a second factor
  perform test.throws(format($q$select * from app.community_moderation_queue(%L, true)$q$, a), 'forbidden');
  perform test.throws(format($q$select * from app.community_moderation_queue(%L, false)$q$, m), 'forbidden');
  perform test.throws(format($q$select app.community_moderate(%L, true, 'post', %L, 'approve')$q$, a, pa), 'forbidden');
  perform test.throws(format($q$select app.community_suspend(%L, false, 'ama_dances', true)$q$, m), 'forbidden');
  select count(*) into n from app.community_moderation_queue(m, true);
  perform test.assert(n >= 4, format('the queue lists held and hidden items (got %s)', n));
  perform test.assert((select (q.flags && array['self_harm']) from app.community_moderation_queue(m, true) q limit 1), 'urgent items come first');
  perform test.assert(not exists (select 1 from jsonb_each(to_jsonb((select q from app.community_moderation_queue(m, true) q limit 1))) e where e.key ~* '(user|author_id|email|account)'), 'the queue shows no user id or email');
  perform app.community_moderate(m, true, 'post', pa, 'approve');
  perform test.assert((select status = 'published' from public.community_posts where id = pa) and not exists (select 1 from public.community_reports where target_id = pa), 'approve republishes and clears the reports');
  perform app.community_moderate(m, true, 'post', pb, 'remove');
  perform test.assert(not exists (select 1 from app.community_feed(b, null, null, 30) f where f.id = pb), 'removed is gone even for its author');
  perform test.throws(format($q$select app.community_moderate(%L, true, 'post', %L, 'banish')$q$, m, pa), 'invalid_action');
  perform app.community_suspend(m, true, 'efua_fit', true);
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'again', null, null, true)$q$, c), 'suspended');
  perform test.throws(format($q$select app.community_add_comment(%L, %L, 'hi')$q$, c, pa), 'suspended');
  perform test.throws(format($q$select app.community_set_encourage(%L, %L, true)$q$, c, pb), 'suspended|not_found');

  -- deleting your own post removes its comments, reactions and media
  perform app.community_delete_post(b, (select id from public.community_posts where author_id = b and type = 'photo' limit 1));
  perform test.assert(not exists (select 1 from public.community_media where storage_path = 'u/a.jpg'), 'media rows go with the post');
  perform test.throws(format($q$select app.community_delete_post(%L, %L)$q$, b, pa), 'not_found');
end $$;

-- 5. Rate limits.
do $$
declare a uuid; i int; r jsonb;
begin
  perform test.as_admin();
  a := test.make_user('c-rate@example.test');
  perform set_config('role', 'service_role', false);
  perform app.community_claim_username(a, 'rate_tester');
  for i in 1..5 loop perform app.community_create_post(a, 'text', 'post ' || i, null, null, true); end loop;
  perform test.throws(format($q$select app.community_create_post(%L, 'text', 'one more', null, null, true)$q$, a), 'rate_limited');
end $$;

-- 6. Deleting an account removes everything the person made or did.
do $$
declare a uuid; b uuid; p uuid; q uuid; n int;
begin
  perform test.as_admin();
  a := test.make_user('c-del-a@example.test'); b := test.make_user('c-del-b@example.test');
  perform set_config('role', 'service_role', false);
  perform app.community_claim_username(a, 'leaving_soon'); perform app.community_claim_username(b, 'staying_on');
  p := (app.community_create_post(a, 'text', 'bye', null, null, true) ->> 'id')::uuid;
  q := (app.community_create_post(b, 'text', 'hi', null, null, true) ->> 'id')::uuid;
  perform app.community_add_comment(a, q, 'nice'); perform app.community_add_comment(b, p, 'ok'); perform app.community_set_encourage(a, q, true); perform app.community_block(a, 'staying_on');
  perform set_config('role', 'none', false);
  delete from auth.users where id = a;
  perform test.assert(not exists (select 1 from public.community_members where user_id = a), 'the member is gone');
  perform test.assert(not exists (select 1 from public.community_posts where author_id = a) and not exists (select 1 from public.community_comments where author_id = a), 'their posts and comments are gone');
  perform test.assert(not exists (select 1 from public.community_comments where post_id = p), 'comments on their posts are gone');
  perform test.assert(not exists (select 1 from public.community_reactions where user_id = a) and not exists (select 1 from public.community_blocks where blocker_id = a), 'their reactions and blocks are gone');
  perform test.assert(exists (select 1 from public.community_posts where id = q), 'other people’s content is untouched');
end $$;
