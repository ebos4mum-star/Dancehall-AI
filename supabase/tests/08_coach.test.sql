do $$
declare
  a uuid; b uuid; st uuid; conv uuid; conv_b uuid; msg uuid; act uuid; plan uuid; item uuid; n bigint; r record;
begin
  a := test.make_user('ca@example.test'); b := test.make_user('cb@example.test'); st := test.make_user('flagstaff@example.test');
  insert into public.staff_roles (user_id, role) values (st, 'admin');

  -- ---------- conversations: consent, ownership, user-written messages only ----------
  perform test.as_user(a);
  perform test.throws($q$insert into public.ai_conversations (title) values ('x')$q$, 'row-level security');   -- no consent yet
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.ai_conversations (title) values ('Plan my week') returning id into conv;
  perform test.throws($q$insert into public.ai_conversations (title) values ('')$q$, 'check constraint');
  insert into public.ai_messages (conversation_id, role, content) values (conv, 'user', 'Plan my day') returning id into msg;
  perform test.throws(format($q$insert into public.ai_messages (conversation_id, role, content) values (%L, 'assistant', 'forged reply')$q$, conv), 'row-level security');
  perform test.throws(format($q$insert into public.ai_messages (conversation_id, role, content, used_personal_data) values (%L, 'user', 'x', true)$q$, conv), 'permission denied');
  perform test.throws(format($q$insert into public.ai_messages (conversation_id, role, content, because) values (%L, 'user', 'x', '["forged"]')$q$, conv), 'permission denied');
  perform test.throws(format($q$insert into public.ai_messages (conversation_id, role, content) values (%L, 'user', '')$q$, conv), 'check constraint');
  perform test.throws($q$update public.ai_messages set content = 'edited'$q$, 'permission denied');
  perform test.assert((select count(*) from public.ai_messages where conversation_id = conv) = 1, 'owner sees their own messages');

  -- the (simulated) server writes the assistant reply and a proposed action
  perform test.as_admin();
  insert into public.ai_messages (conversation_id, user_id, role, content, because, used_personal_data) values (conv, a, 'assistant', 'Here is a simple day.', '["Because you did 2 sessions"]', true) returning id into msg;
  insert into public.coach_actions (message_id, user_id, kind, summary, payload) values (msg, a, 'add_workout', 'Schedule Latin Rhythm', '{"workoutId":"qf10-latin-rhythm","plannedFor":"2026-06-17"}') returning id into act;
  insert into public.coach_actions (message_id, user_id, kind, summary, payload) values (msg, a, 'add_habit', 'Add a water habit', '{"title":"Water"}');

  -- people cannot create actions; they can only decide on them, once, and cannot change what was proposed
  perform test.as_user(a);
  perform test.throws(format($q$insert into public.coach_actions (message_id, user_id, kind, summary, payload) values (%L, %L, 'add_habit', 's', '{}')$q$, msg, a), 'permission denied');
  perform test.throws(format($q$update public.coach_actions set summary = 'edited' where id = %L$q$, act), 'permission denied');
  perform test.throws(format($q$update public.coach_actions set status = 'proposed' where id = %L$q$, act), 'row-level security');
  perform test.throws(format($q$update public.coach_actions set status = 'bogus' where id = %L$q$, act), 'row-level security|check constraint');
  update public.coach_actions set status = 'applied' where id = act;
  perform test.assert((select status = 'applied' and decided_at is not null from public.coach_actions where id = act), 'confirmation is recorded with a time');
  perform test.assert(test.rows_affected(format($q$update public.coach_actions set status = 'dismissed' where id = %L$q$, act)) = 0, 'a decided action cannot be changed');
  update public.coach_actions set status = 'dismissed' where message_id = msg and kind = 'add_habit';
  perform test.assert((select count(*) from public.coach_actions where status = 'dismissed') = 1, 'actions can be dismissed');

  -- a second layer: even a trusted writer cannot re-decide or alter an action (a trigger, independent of the policies)
  perform test.as_admin();
  perform test.throws(format($q$update public.coach_actions set status = 'dismissed' where id = %L$q$, act), 'coach_action_already_decided');
  perform test.throws(format($q$update public.coach_actions set summary = 'rewritten' where id = %L$q$, act), 'coach_action_immutable');
  perform test.as_user(a);

  -- isolation: B sees nothing of A's coaching
  perform test.as_user(b);
  perform test.assert((select count(*) from public.ai_conversations) = 0 and (select count(*) from public.ai_messages) = 0 and (select count(*) from public.coach_actions) = 0, 'B sees none of A''s conversations, messages or actions');
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  insert into public.ai_conversations (title) values ('B chat') returning id into conv_b;
  perform test.throws(format($q$insert into public.ai_messages (conversation_id, role, content) values (%L, 'user', 'into A''s chat')$q$, conv), 'row-level security');
  perform test.assert(test.rows_affected(format('delete from public.ai_conversations where id = %L', conv)) = 0, 'B cannot delete A''s conversation');
  perform test.assert(test.rows_affected(format($q$update public.coach_actions set status = 'applied' where id = %L$q$, act)) = 0, 'B cannot decide on A''s actions');

  -- staff, even admins with MFA, cannot read conversations
  perform test.as_user(st, 'aal2');
  perform test.assert((select count(*) from public.ai_conversations) = 0 and (select count(*) from public.ai_messages) = 0 and (select count(*) from public.coach_actions) = 0, 'staff cannot read coaching conversations');

  -- withdrawing health consent stops new messages but keeps history readable and deletable
  perform test.as_user(a);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', false);
  perform test.throws(format($q$insert into public.ai_messages (conversation_id, role, content) values (%L, 'user', 'x')$q$, conv), 'row-level security');
  perform test.assert((select count(*) from public.ai_messages) = 2, 'history stays readable');
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);
  perform test.as_admin();
end $$;

-- Block 2: retention, usage metering, atomic budget and quota, kill switches, daily plans and weekly reviews.
do $$
declare
  a uuid := (select id from auth.users where email = 'ca@example.test');
  b uuid := (select id from auth.users where email = 'cb@example.test');
  st uuid := (select id from auth.users where email = 'flagstaff@example.test');
  gone uuid; conv2 uuid; m2 uuid; plan uuid; item uuid; n bigint; ok boolean; before_events bigint;
begin
  -- ---------- retention and deletion ----------
  perform test.as_admin();
  insert into public.ai_conversations (user_id, title, updated_at) values (a, 'Old chat', now() - interval '100 days');
  insert into public.ai_conversations (user_id, title) values (a, 'Disposable') returning id into conv2;
  insert into public.ai_messages (conversation_id, user_id, role, content) values (conv2, a, 'assistant', 'hello') returning id into m2;
  insert into public.coach_actions (message_id, user_id, kind, summary, payload) values (m2, a, 'add_habit', 's', '{"title":"x"}');
  perform test.as_user(a);
  perform test.throws($q$select public.coach_purge_old(90)$q$, 'permission denied');
  perform test.assert(test.rows_affected(format($q$delete from public.ai_conversations where id = %L$q$, conv2)) = 1, 'owners can delete a conversation');
  perform test.assert((select count(*) from public.ai_messages where conversation_id = conv2) = 0, 'deleting a conversation removes its messages');
  perform test.as_admin();
  perform test.assert((select count(*) from public.coach_actions where message_id = m2) = 0, 'and its proposed actions');
  perform set_config('role', 'service_role', false);
  n := public.coach_purge_old(90);
  perform test.as_admin();
  perform test.assert(n = 1 and not exists (select 1 from public.ai_conversations where title = 'Old chat') and exists (select 1 from public.ai_conversations where title = 'Plan my week'), 'the retention job removes only conversations past the window');

  -- ---------- usage events: server-written, append-only, owner-readable ----------
  insert into public.ai_usage_events (user_id, feature, model, input_tokens, output_tokens, cost_usd, outcome) values
    (a, 'concierge_chat', 'mock-small', 500, 150, 0.00125, 'ok'), (a, 'concierge_chat', 'none', 0, 0, 0, 'safety_redirect'), (a, 'weekly_review', 'mock-small', 400, 120, 0.001, 'ok');
  perform test.as_user(a);
  perform test.assert((select count(*) from public.ai_usage_events) = 3, 'a person can read their own usage');
  perform test.throws($q$insert into public.ai_usage_events (user_id, feature, model, outcome) values (gen_random_uuid(), 'concierge_chat', 'x', 'ok')$q$, 'permission denied');
  perform test.throws($q$update public.ai_usage_events set cost_usd = 0$q$, 'permission denied');
  perform test.throws($q$delete from public.ai_usage_events$q$, 'permission denied');
  perform test.as_user(b);
  perform test.assert((select count(*) from public.ai_usage_events) = 0, 'B cannot read A''s usage');
  perform test.as_user(st, 'aal2');
  perform test.assert((select count(*) from public.ai_usage_events) = 0, 'staff cannot read individual usage');
  perform test.as_admin();
  perform test.throws($q$update public.ai_usage_events set cost_usd = 0$q$, 'ai_usage_events_is_append_only');
  perform test.throws($q$delete from public.ai_usage_events$q$, 'ai_usage_events_is_append_only');
  perform test.throws($q$update public.ai_usage_events set outcome = 'ok', user_id = null$q$, 'ai_usage_events_is_append_only');
  -- deleting a person detaches their usage rows (cost accounting stays) without breaking the append-only rule
  gone := test.make_user('gone@example.test');
  insert into public.ai_usage_events (user_id, feature, model, cost_usd, outcome) values (gone, 'food_photo', 'mock-large', 0.01, 'ok');
  select count(*) into before_events from public.ai_usage_events;
  delete from public.profiles where id = gone;
  perform test.assert((select count(*) from public.ai_usage_events) = before_events and exists (select 1 from public.ai_usage_events where user_id is null and cost_usd = 0.01), 'account deletion detaches usage rows and keeps the cost record');

  -- ---------- budget and quota functions: service role only, correct sequential behavior ----------
  perform test.as_user(a);
  perform test.throws($q$select public.ai_budget_reserve('2098-01', 1, 10)$q$, 'permission denied');
  perform test.throws($q$select public.ai_quota_consume(gen_random_uuid(), '2098-01', 'concierge_chat', 5)$q$, 'permission denied');
  perform test.throws($q$select * from public.ai_budget$q$, 'permission denied');
  perform test.as_admin();
  perform set_config('role', 'service_role', false);
  perform test.assert(public.ai_budget_reserve('2098-01', 6, 10), 'first reservation fits');
  perform test.assert(not public.ai_budget_reserve('2098-01', 5, 10), 'a reservation that would cross the ceiling is refused');
  perform test.assert(public.ai_budget_reserve('2098-01', 4, 10), 'exactly reaching the ceiling is allowed');
  perform test.assert(not public.ai_budget_reserve('2098-01', 0.01, 10), 'nothing more once the ceiling is reached');
  perform test.assert(not public.ai_budget_reserve('2098-01', -1, 10), 'negative reservations are refused');
  perform test.assert((select settled = 2.5 from public.ai_budget_settle('2098-01', 6, 2.5)), 'settling records the real cost');
  perform test.assert(public.ai_budget_reserve('2098-01', 3.5, 10) and not public.ai_budget_reserve('2098-01', 0.01, 10), 'released reservation space can be reused, up to the ceiling');
  perform test.assert(public.ai_budget_reserve('2098-02', 1, 10), 'each month has its own budget');
  perform test.assert(public.ai_quota_consume(a, '2098-01', 'concierge_chat', 2) and public.ai_quota_consume(a, '2098-01', 'concierge_chat', 2) and not public.ai_quota_consume(a, '2098-01', 'concierge_chat', 2), 'quota stops at the limit');
  perform public.ai_quota_refund(a, '2098-01', 'concierge_chat');
  perform test.assert(public.ai_quota_consume(a, '2098-01', 'concierge_chat', 2), 'a refund frees one use');
  perform test.assert(public.ai_quota_consume(a, '2098-02', 'concierge_chat', 2) and public.ai_quota_consume(b, '2098-01', 'concierge_chat', 2), 'quotas are per month and per person');
  perform test.as_admin();
  perform test.as_user(a);
  perform test.assert((select count(*) from public.ai_user_usage) = 2, 'people can read their own quota counters (and only theirs)');
  perform test.throws($q$insert into public.ai_user_usage (user_id, month, feature, count) values (gen_random_uuid(), '2098-03', 'x', 0)$q$, 'permission denied');
  perform test.throws($q$update public.ai_user_usage set count = 0$q$, 'permission denied');
  perform test.as_user(b);
  perform test.assert((select count(*) from public.ai_user_usage where user_id = a) = 0, 'B cannot read A''s counters');

  -- ---------- kill switches ----------
  perform test.as_user(b);
  perform test.assert((select count(*) from public.feature_flags where key like 'ai.kill%') = 4 and not (select bool_or(enabled) from public.feature_flags), 'everyone can read the flags; every kill switch starts off');
  perform test.assert(test.rows_affected($q$update public.feature_flags set enabled = true$q$) = 0, 'normal users cannot flip a flag');
  perform test.throws($q$insert into public.feature_flags (key) values ('ai.new')$q$, 'permission denied');
  perform test.as_user(st, 'aal1');
  perform test.assert(test.rows_affected($q$update public.feature_flags set enabled = true where key = 'ai.kill_all'$q$) = 0, 'staff without MFA cannot flip a flag');
  perform test.as_user(st, 'aal2');
  update public.feature_flags set enabled = true, note = 'Incident test' where key = 'ai.kill_all';
  perform test.assert((select enabled and updated_by = st from public.feature_flags where key = 'ai.kill_all'), 'staff with MFA can flip it and it records who');
  update public.feature_flags set enabled = false where key = 'ai.kill_all';
  perform test.assert(exists (select 1 from public.audit_log where action = 'UPDATE feature_flags' and row_id = 'ai.kill_all' and actor = st), 'flag changes are audited with the actor');
  perform test.throws($q$update public.feature_flags set key = 'x' where key = 'ai.kill_all'$q$, 'permission denied');
  perform test.as_admin();
  perform test.assert(public.audit_verify() is null, 'the audit chain still verifies');

  -- ---------- daily plans ----------
  perform test.as_user(a);
  insert into public.daily_plans (plan_date, mode) values (current_date, 'busy') returning id into plan;
  perform test.throws($q$insert into public.daily_plans (plan_date) values (current_date)$q$, 'duplicate key|unique');
  perform test.throws($q$insert into public.daily_plans (plan_date, mode) values (current_date + 1, 'fasting')$q$, 'check constraint');
  insert into public.daily_plan_items (plan_id, position, kind, title, detail, why, ref) values (plan, 0, 'workout', 'Amapiano Groove 10', '10 minutes', 'Short on time', '{"workoutId":"qf10-amapiano-groove"}');
  insert into public.daily_plan_items (plan_id, position, kind, title, detail, why) values (plan, 1, 'habit', 'Drink a glass of water', 'Tick it off', 'Small habits add up') returning id into item;
  perform test.throws(format($q$insert into public.daily_plan_items (plan_id, position, kind, title) values (%L, 2, 'bogus', 'x')$q$, plan), 'check constraint');
  update public.daily_plan_items set done_at = now() where id = item;
  perform test.assert((select done_at is not null from public.daily_plan_items where id = item), 'items can be ticked off');
  update public.daily_plan_items set done_at = null where id = item;
  perform test.throws(format($q$update public.daily_plan_items set title = 'edited' where id = %L$q$, item), 'permission denied');
  update public.daily_plans set mode = 'travel' where id = plan;
  perform test.as_user(b);
  perform test.assert((select count(*) from public.daily_plans) = 0 and (select count(*) from public.daily_plan_items) = 0, 'B cannot see A''s plans');
  perform test.throws(format($q$insert into public.daily_plan_items (plan_id, position, kind, title) values (%L, 5, 'habit', 'x')$q$, plan), 'row-level security');
  perform test.as_user(a);
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', false);
  perform test.throws($q$insert into public.daily_plans (plan_date) values (current_date + 5)$q$, 'row-level security');
  insert into public.consents (purpose, policy_version, granted) values ('health_data_processing', 'v0', true);

  -- ---------- weekly reviews ----------
  perform test.throws($q$insert into public.weekly_reviews (week_start, content) values ('2026-06-15', '{}')$q$, 'row-level security');   -- no personalization consent
  insert into public.consents (purpose, policy_version, granted) values ('ai_coach_personalization', 'v0', true);
  insert into public.weekly_reviews (week_start, content) values ('2026-06-15', '{"highlights":["You moved on 2 days."],"nonScaleWins":[],"suggestions":[],"tone":"encouraging"}');
  perform test.throws($q$insert into public.weekly_reviews (week_start, content) values ('2026-06-16', '{}')$q$, 'check constraint');   -- not a Monday
  perform test.throws($q$insert into public.weekly_reviews (week_start, content) values ('2026-06-15', '{}')$q$, 'duplicate key|unique');
  perform test.throws($q$insert into public.weekly_reviews (week_start, content) values ('2026-06-22', '[]')$q$, 'check constraint');
  perform test.throws($q$update public.weekly_reviews set content = '{}'$q$, 'permission denied');
  perform test.as_user(b);
  perform test.assert((select count(*) from public.weekly_reviews) = 0, 'B cannot read A''s reviews');
  perform test.as_user(a);
  insert into public.consents (purpose, policy_version, granted) values ('ai_coach_personalization', 'v0', false);
  perform test.throws($q$insert into public.weekly_reviews (week_start, content) values ('2026-06-29', '{}')$q$, 'row-level security');
  perform test.assert((select count(*) from public.weekly_reviews) = 1, 'withdrawing personalization keeps past reviews readable (and deletable)');
  perform test.as_admin();
end $$;
