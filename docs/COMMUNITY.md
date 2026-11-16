# Community and Share My Achievement

Status: **built locally, off in production.** Nothing here is applied to a hosted project. The public feed must not be enabled until the launch checklist below is complete and the owner approves.

## What exists
- One chronological feed (`/community`); guests browse, members post, comment and Encourage. One Share Progress action, one Encourage reaction, flat comments.
- Post types: text, motivational story, milestone, optional before/after photos, short video (30 s).
- Public usernames only (3-20 chars, no real names, no digit/hex strings, reserved/brand/abusive/eating-disorder names refused). Member-only actions reuse the PIN-first account gate (`community_post`, `community_join`).
- Report, block (mutual and silent), delete own content, delete account removes everything.
- Share My Achievement: from workout completion and the achievements list. Shows a preview, minutes off by default, and needs an explicit "everyone can see this" confirmation. Never auto-posts. Health data is never in the payload (whitelist: title, style, optional minutes).
- Not built, by design: follows, DMs, hashtags, algorithmic feed, leaderboards, rich profiles.

## Safeguards (shared rules in `packages/shared/src/community.ts`, mirrored in SQL)
- Text screening: blocks self-harm, eating-disorder content, emails, links, phone numbers, mentions, contact solicitation; holds weight-loss claims, health numbers, health claims, shouting. Self-harm text shows support information.
- Photos and videos are always held for review. Reports: 3 distinct reporters, or one report for private information / self-harm, hide content at once.
- Daily limits for posts, comments, reactions, reports. Suspension by staff.
- Encourage counts are visible to the author only (no popularity signal).
- Public projections never contain account ids or synthetic auth emails.

## Server design (`supabase/proposed/community.up.sql`, NOT APPLIED)
Tables have RLS on with deny-all policies and no client grants. Every operation is an `app.community_*` function executable only by `service_role`; an Edge Function must verify the JWT and pass the user id. Guests browse through the same server path. Moderation functions require the `moderation.review` permission and aal2.
Verified on a throwaway local Postgres: `bash supabase/proposed/community-dry-run.sh` (privileges, TS/SQL rule parity, behaviour, moderation, rate limits, cascade deletion, existing RLS/definer guards, rollback, re-apply).

## Launch checklist (all open)
1. Write the Edge Function / server route in front of the SQL functions (JWT check, input size limits, abuse/rate limiting at the edge).
2. Storage bucket and policies for photos/videos; malware/image scanning; video transcoding.
3. Admin moderation UI (queue logic exists; UI does not) and named moderators with MFA.
4. Reviewed word lists (current ones are a starter set), Terms/Community Guidelines and privacy-notice legal review, minors policy.
5. Moderation response-time target and escalation path for self-harm reports.
6. Security review of the applied migration on a staging project; then owner approval to apply.
7. Set `EXPO_PUBLIC_COMMUNITY=1` only for a build that has passed 1-6. Production builds with the flag throw today.

## Decisions needed
Username permanence; whether authors see Encourage counts; photo/video launch timing (text-only first is possible); moderator staffing.
