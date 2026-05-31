-- ============================================================
-- MIGRATION 004: Question Images and Storage
-- VibeQuiz — Allow hosts to attach images to questions
-- ============================================================

-- 1. Add image_url column to public.questions table
alter table public.questions add column if not exists image_url text;

-- 2. Insert storage bucket for question images
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'question-images',
  'question-images',
  true,
  5242880, -- 5MB limit
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

-- 3. Storage bucket security policies (SELECT, INSERT, UPDATE, DELETE)
drop policy if exists "Public Read Access" on storage.objects;
drop policy if exists "Authenticated Insert Access" on storage.objects;
drop policy if exists "Authenticated Update Access" on storage.objects;
drop policy if exists "Authenticated Delete Access" on storage.objects;

create policy "Public Read Access"
  on storage.objects for select
  to anon, authenticated
  using ( bucket_id = 'question-images' );

create policy "Authenticated Insert Access"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'question-images' );

create policy "Authenticated Update Access"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'question-images' )
  with check ( bucket_id = 'question-images' );

create policy "Authenticated Delete Access"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'question-images' );
