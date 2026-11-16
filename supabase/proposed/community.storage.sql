-- PROPOSED, NOT APPLIED. Private storage for Community photos and videos (Supabase Storage).
-- The bucket is private and NO storage policy is created for anon or authenticated: with row security on storage.objects, no policy means no client access.
-- The server (service role) alone creates signed upload URLs, reads files to verify and clean them, and creates short-lived signed view URLs for published posts and moderators.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('community-media', 'community-media', false, 26214400,
        array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
