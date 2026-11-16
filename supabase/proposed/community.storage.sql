-- PROPOSED, NOT APPLIED. Private storage for Community photos and videos (Supabase Storage).
-- While video is disabled the bucket accepts only photos, at most 8 MB, so an oversized or video upload is refused by the platform before any of our code runs.
-- When video is approved, a migration raises the limit to 25 MB and adds the video types.
-- The bucket is private and NO storage policy is created for anon or authenticated: with row security on storage.objects, no policy means no client access.
-- The server (service role) alone creates signed upload URLs, reads files to verify and clean them, and creates short-lived signed view URLs for published posts and moderators.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media', 'community-media', false, 8388608,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
