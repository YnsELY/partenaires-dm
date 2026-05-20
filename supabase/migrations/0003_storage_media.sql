-- Les Partenaires DM — bucket Storage `media` + policies pour les agents
-- L'arborescence des objets sera : agent/{auth.uid()}/{intervention_id}/{zone}/{type}-{ts}.jpg

insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- =========================================================
-- Lecture
-- =========================================================
drop policy if exists "media_storage_select_own" on storage.objects;
create policy "media_storage_select_own"
  on storage.objects for select
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'agent'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- =========================================================
-- Upload
-- =========================================================
drop policy if exists "media_storage_insert_own" on storage.objects;
create policy "media_storage_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'agent'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- =========================================================
-- Suppression (utile si l'agent re-prend une photo)
-- =========================================================
drop policy if exists "media_storage_delete_own" on storage.objects;
create policy "media_storage_delete_own"
  on storage.objects for delete
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = 'agent'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
