-- Community patch 3 (safety consistency). NOT APPLIED anywhere by this change; needs explicit migration approval.
-- Replaces exactly one function, with an unchanged signature, return type and grants (create or replace keeps them):
--   app.community_screen   the self-harm phrase list now matches the coach's first-line screen ("I don't want to be here anymore", "no reason to live", "better off without me", "end it all", ...),
--                          and typographic apostrophes are read as plain ones. Nothing else changes.
-- No tables, columns, policies, settings, storage or data are touched. Depends on community.up.sql and patch 2 (or the current community.up.sql, which already includes both). Safe to run twice.
-- Rollback: run community.patch2_photo_immediate.sql again (it restores the previous community_screen).
begin;
create or replace function app.community_screen(p_text text, p_max int) returns jsonb language plpgsql immutable set search_path = '' as $$
declare
  t text := btrim(coalesce(p_text, ''));
  l text := replace(replace(lower(btrim(coalesce(p_text, ''))), '’', ''''), '‘', '''');
  squashed text := regexp_replace(lower(btrim(coalesce(p_text, ''))), '[[:space:]_-]', '', 'g');
  f text[] := '{}';
  w text;
begin
  if char_length(t) = 0 then return jsonb_build_object('decision', 'block', 'flags', jsonb_build_array('empty')); end if;
  if char_length(t) > p_max then return jsonb_build_object('decision', 'block', 'flags', jsonb_build_array('too_long')); end if;
  foreach w in array array['kill myself', 'suicide', 'end my life', 'self harm', 'self-harm', 'cut myself', 'want to die', 'don''t want to be here', 'do not want to be here', 'don''t want to live', 'do not want to live', 'no reason to live', 'wish i were dead', 'wish i was dead', 'better off dead', 'better off without me', 'end it all', 'take my own life'] loop
    if position(w in l) > 0 then return jsonb_build_object('decision', 'block', 'flags', jsonb_build_array('self_harm')); end if;
  end loop;
  foreach w in array array['thinspo', 'proana', 'pro_ana', 'promia', 'pro_mia', 'bonespo', 'meanspo', 'edtwt', 'anorexia tips', 'purge tips'] loop
    if position(regexp_replace(w, '[[:space:]_-]', '', 'g') in squashed) > 0 then return jsonb_build_object('decision', 'block', 'flags', jsonb_build_array('ed_content')); end if;
  end loop;
  if t ~* '[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z]{2,}' then f := f || array['email']; end if;
  if t ~* '(https?://|www\.)[^[:space:]]+|\y[a-z0-9-]+\.(com|net|org|io|co|me|app|link|ly|gg|xyz|info|biz|shop)\y' then f := f || array['link']; end if;
  if t ~* '([+]?[0-9][[:space:]().-]?){7,}' then f := f || array['phone']; end if;
  if t ~* '(^|[[:space:]])@[a-z0-9_]+' then f := f || array['mention']; end if;
  if t ~* '\y(dm me|message me|text me|whats ?app|telegram|snap ?chat|insta(gram)?|cash ?app|venmo|paypal|onlyfans|link in bio|follow me)\y' then f := f || array['contact_solicit']; end if;
  if cardinality(f) > 0 then return jsonb_build_object('decision', 'block', 'flags', to_jsonb(f)); end if;
  -- V1 decision: ordinary weight, calorie and health-number talk is allowed and never held. Dangerous health instructions, diet-drug promotion and harassment are rejected, never held; personal weight-loss stories are allowed. Mirrors screenText in TypeScript.
  if t ~* '\y(kill yourself|kys|go die|hope you die|fat (pig|cow|slob)|ugly (cow|pig)|you(''| a)?re (so )?(fat|disgusting|ugly)|nobody likes you)\y' then f := f || array['harassment']; end if;
  if t ~* '\y(cure[sd]?|detox|miracle|guaranteed|burn(s|ed)? fat fast|fat[- ]burner|diet pills?|weight loss (drug|jab|injection)|ozempic|wegovy|semaglutide|mounjaro|tirzepatide|laxatives?|starv[a-z]*|fasting for [0-9]+)\y' then f := f || array['health_claim']; end if;
  if cardinality(f) > 0 then return jsonb_build_object('decision', 'block', 'flags', to_jsonb(f)); end if;
  return jsonb_build_object('decision', 'allow', 'flags', '[]'::jsonb);
end $$;
commit;
