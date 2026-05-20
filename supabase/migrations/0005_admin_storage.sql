-- Les Partenaires DM — Storage policies pour le rôle Admin
-- Permet à l'admin de visualiser et supprimer les médias uploadés par les agents
-- avant publication client.

-- =========================================================
-- Lecture (admin voit tous les médias)
-- =========================================================
drop policy if exists "media_storage_select_admin" on storage.objects;
create policy "media_storage_select_admin"
  on storage.objects for select
  using (
    bucket_id = 'media'
    and public.is_admin()
  );

-- =========================================================
-- Suppression (admin peut supprimer une mauvaise photo)
-- =========================================================
drop policy if exists "media_storage_delete_admin" on storage.objects;
create policy "media_storage_delete_admin"
  on storage.objects for delete
  using (
    bucket_id = 'media'
    and public.is_admin()
  );
