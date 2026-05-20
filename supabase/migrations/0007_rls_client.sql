-- Les Partenaires DM — Row Level Security pour le rôle Client
-- Le client ne voit que :
-- - les sites listés dans client_site_access
-- - les interventions VALIDÉES sur ces sites (status='validated')
-- - les médias is_validated=true ET non expirés (expires_at > now())
-- - ses propres incidents et évaluations

-- =========================================================
-- profiles : déjà géré (SELECT/UPDATE own dans 0002_rls_agent)
-- =========================================================

-- =========================================================
-- client_site_access (lecture seule pour le client)
-- =========================================================
alter table public.client_site_access enable row level security;

drop policy if exists "client_site_access_select_own" on public.client_site_access;
create policy "client_site_access_select_own"
  on public.client_site_access for select
  using (client_profile_id = auth.uid());

drop policy if exists "client_site_access_admin_all" on public.client_site_access;
create policy "client_site_access_admin_all"
  on public.client_site_access for all
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================
-- clients (le profil client voit son entreprise)
-- =========================================================
drop policy if exists "clients_select_for_client" on public.clients;
create policy "clients_select_for_client"
  on public.clients for select
  using (
    exists (
      select 1
      from public.sites s
      join public.client_site_access csa on csa.site_id = s.id
      where s.client_id = clients.id
        and csa.client_profile_id = auth.uid()
    )
  );

-- =========================================================
-- sites (le client voit ses sites accessibles)
-- =========================================================
drop policy if exists "sites_select_for_client" on public.sites;
create policy "sites_select_for_client"
  on public.sites for select
  using (id in (select public.client_site_ids()));

-- =========================================================
-- checklist_tasks (le client voit les tâches/zones de ses sites,
-- utile pour le picker de zones du formulaire incident)
-- =========================================================
drop policy if exists "checklist_tasks_select_for_client" on public.checklist_tasks;
create policy "checklist_tasks_select_for_client"
  on public.checklist_tasks for select
  using (site_id in (select public.client_site_ids()));

-- =========================================================
-- interventions (uniquement les VALIDÉES sur ses sites)
-- =========================================================
drop policy if exists "interventions_select_for_client" on public.interventions;
create policy "interventions_select_for_client"
  on public.interventions for select
  using (
    status = 'validated'
    and site_id in (select public.client_site_ids())
  );

-- =========================================================
-- media (uniquement validées et non expirées)
-- =========================================================
drop policy if exists "media_select_for_client" on public.media;
create policy "media_select_for_client"
  on public.media for select
  using (
    is_validated = true
    and expires_at > now()
    and intervention_id in (
      select i.id from public.interventions i
      where i.status = 'validated'
        and i.site_id in (select public.client_site_ids())
    )
  );

-- =========================================================
-- incidents (le client INSERT ses incidents, SELECT ses propres lignes)
-- =========================================================
drop policy if exists "incidents_select_for_client" on public.incidents;
create policy "incidents_select_for_client"
  on public.incidents for select
  using (reported_by = auth.uid() and reporter_role = 'client');

drop policy if exists "incidents_insert_client" on public.incidents;
create policy "incidents_insert_client"
  on public.incidents for insert
  with check (
    reported_by = auth.uid()
    and reporter_role = 'client'
    and site_id in (select public.client_site_ids())
  );

-- =========================================================
-- evaluations (le client INSERT/UPDATE/SELECT ses propres avis)
-- =========================================================
alter table public.evaluations enable row level security;

drop policy if exists "evaluations_select_own" on public.evaluations;
create policy "evaluations_select_own"
  on public.evaluations for select
  using (client_profile_id = auth.uid());

drop policy if exists "evaluations_insert_own" on public.evaluations;
create policy "evaluations_insert_own"
  on public.evaluations for insert
  with check (
    client_profile_id = auth.uid()
    and intervention_id in (
      select i.id from public.interventions i
      where i.status = 'validated'
        and i.site_id in (select public.client_site_ids())
    )
  );

drop policy if exists "evaluations_update_own" on public.evaluations;
create policy "evaluations_update_own"
  on public.evaluations for update
  using (client_profile_id = auth.uid())
  with check (client_profile_id = auth.uid());

-- L'admin peut tout lire (les commentaires lui sont réservés)
drop policy if exists "evaluations_admin_select" on public.evaluations;
create policy "evaluations_admin_select"
  on public.evaluations for select
  using (public.is_admin());
