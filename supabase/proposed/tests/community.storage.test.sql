-- Runs against a minimal stand-in for the storage schema (the real one belongs to the platform).
do $$ begin
  perform test.assert((select not public from storage.buckets where id = 'community-media'), 'the media bucket is private');
  perform test.assert((select file_size_limit = 26214400 from storage.buckets where id = 'community-media'), 'the bucket enforces the video size limit');
  perform test.assert(not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and (qual ilike '%community-media%' or with_check ilike '%community-media%')), 'no client policy exists for the media bucket');
  perform test.assert(not ((select allowed_mime_types from storage.buckets where id = 'community-media') @> array['video/webm']), 'only the processed video types are allowed');
end $$;
