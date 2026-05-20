-- Les Partenaires DM — Row Level Security pour le rôle Admin
-- Ajoute les policies admin sur toutes les tables. L'admin a SELECT global,
-- INSERT/UPDATE/DELETE selon les besoins métier.

-- =========================================================
-- Helper : auth.uid() est un admin ?
-- =========================================================
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- =========================================================
-- profiles
-- =========================================================
drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- (INSERT profiles est géré par les edge functions signup-with-role et
--  admin-create-agent qui utilisent SERVICE_ROLE_KEY, pas besoin de policy.)

-- =========================================================
-- clients
-- =========================================================
drop policy if exists "clients_admin_all" on public.clients;
create policy "clients_admin_all"
  on public.clients for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================
-- teams + team_members
-- =========================================================
drop policy if exists "teams_admin_all" on public.teams;
create policy "teams_admin_all"
  on public.teams for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "team_members_admin_all" on public.team_members;
create policy "team_members_admin_all"
  on public.team_members for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================
-- sites
-- =========================================================
drop policy if exists "sites_admin_all" on public.sites;
create policy "sites_admin_all"
  on public.sites for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================
-- checklist_tasks
-- =========================================================
drop policy if exists "checklist_tasks_admin_all" on public.checklist_tasks;
create policy "checklist_tasks_admin_all"
  on public.checklist_tasks for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================
-- interventions
-- =========================================================
drop policy if exists "interventions_admin_select" on public.interventions;
create policy "interventions_admin_select"
  on public.interventions for select
  using (public.is_admin());

drop policy if exists "interventions_admin_insert" on public.interventions;
create policy "interventions_admin_insert"
  on public.interventions for insert
  with check (public.is_admin());

drop policy if exists "interventions_admin_update" on public.interventions;
create policy "interventions_admin_update"
  on public.interventions for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "interventions_admin_delete" on public.interventions;
create policy "interventions_admin_delete"
  on public.interventions for delete
  using (public.is_admin());

-- =========================================================
-- checklist_results (admin lecture seule, l'agent reste l'auteur)
-- =========================================================
drop policy if exists "checklist_results_admin_select" on public.checklist_results;
create policy "checklist_results_admin_select"
  on public.checklist_results for select
  using (public.is_admin());

-- =========================================================
-- media (admin SELECT all + UPDATE is_validated + DELETE)
-- =========================================================
drop policy if exists "media_admin_select" on public.media;
create policy "media_admin_select"
  on public.media for select
  using (public.is_admin());

drop policy if exists "media_admin_update" on public.media;
create policy "media_admin_update"
  on public.media for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "media_admin_delete" on public.media;
create policy "media_admin_delete"
  on public.media for delete
  using (public.is_admin());

-- =========================================================
-- incidents (admin SELECT all + UPDATE)
-- =========================================================
drop policy if exists "incidents_admin_select" on public.incidents;
create policy "incidents_admin_select"
  on public.incidents for select
  using (public.is_admin());

drop policy if exists "incidents_admin_update" on public.incidents;
create policy "incidents_admin_update"
  on public.incidents for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "incidents_admin_insert" on public.incidents;
create policy "incidents_admin_insert"
  on public.incidents for insert
  with check (public.is_admin());

drop policy if exists "incidents_admin_delete" on public.incidents;
create policy "incidents_admin_delete"
  on public.incidents for delete
  using (public.is_admin());
