-- Les Partenaires DM — Row Level Security pour le flux Agent
-- Cette migration active RLS sur toutes les tables et pose les policies
-- minimales nécessaires à l'agent. Les policies admin/client viendront
-- dans une migration ultérieure.

-- =========================================================
-- Helper : appartenance à une équipe
-- =========================================================
create or replace function public.agent_team_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select team_id from public.team_members where agent_id = auth.uid();
$$;

-- =========================================================
-- profiles
-- =========================================================
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- =========================================================
-- clients
-- =========================================================
alter table public.clients enable row level security;

drop policy if exists "clients_select_for_agents_with_intervention" on public.clients;
create policy "clients_select_for_agents_with_intervention"
  on public.clients for select
  using (
    exists (
      select 1
      from public.sites s
      join public.interventions i on i.site_id = s.id
      where s.client_id = clients.id
        and (i.agent_id = auth.uid() or i.team_id in (select public.agent_team_ids()))
    )
  );

-- =========================================================
-- teams + team_members
-- =========================================================
alter table public.teams enable row level security;

drop policy if exists "teams_select_member" on public.teams;
create policy "teams_select_member"
  on public.teams for select
  using (id in (select public.agent_team_ids()));

alter table public.team_members enable row level security;

drop policy if exists "team_members_select_self" on public.team_members;
create policy "team_members_select_self"
  on public.team_members for select
  using (agent_id = auth.uid());

-- =========================================================
-- sites
-- =========================================================
alter table public.sites enable row level security;

drop policy if exists "sites_select_assigned_agent" on public.sites;
create policy "sites_select_assigned_agent"
  on public.sites for select
  using (
    exists (
      select 1 from public.interventions i
      where i.site_id = sites.id
        and (i.agent_id = auth.uid() or i.team_id in (select public.agent_team_ids()))
    )
  );

-- =========================================================
-- checklist_tasks
-- =========================================================
alter table public.checklist_tasks enable row level security;

drop policy if exists "checklist_tasks_select_for_assigned_sites" on public.checklist_tasks;
create policy "checklist_tasks_select_for_assigned_sites"
  on public.checklist_tasks for select
  using (
    site_id in (
      select i.site_id from public.interventions i
      where i.agent_id = auth.uid() or i.team_id in (select public.agent_team_ids())
    )
  );

-- =========================================================
-- interventions
-- =========================================================
alter table public.interventions enable row level security;

drop policy if exists "interventions_select_own_or_team" on public.interventions;
create policy "interventions_select_own_or_team"
  on public.interventions for select
  using (
    agent_id = auth.uid()
    or team_id in (select public.agent_team_ids())
  );

drop policy if exists "interventions_update_own" on public.interventions;
create policy "interventions_update_own"
  on public.interventions for update
  using (agent_id = auth.uid())
  with check (
    agent_id = auth.uid()
    -- l'agent ne peut pas marquer lui-même validated/rejected (admin uniquement plus tard)
    and status in ('scheduled','in_progress','pending_validation')
  );

-- =========================================================
-- checklist_results
-- =========================================================
alter table public.checklist_results enable row level security;

drop policy if exists "checklist_results_select_own" on public.checklist_results;
create policy "checklist_results_select_own"
  on public.checklist_results for select
  using (
    exists (
      select 1 from public.interventions i
      where i.id = checklist_results.intervention_id
        and i.agent_id = auth.uid()
    )
  );

drop policy if exists "checklist_results_insert_own" on public.checklist_results;
create policy "checklist_results_insert_own"
  on public.checklist_results for insert
  with check (
    exists (
      select 1 from public.interventions i
      where i.id = checklist_results.intervention_id
        and i.agent_id = auth.uid()
    )
  );

drop policy if exists "checklist_results_update_own" on public.checklist_results;
create policy "checklist_results_update_own"
  on public.checklist_results for update
  using (
    exists (
      select 1 from public.interventions i
      where i.id = checklist_results.intervention_id
        and i.agent_id = auth.uid()
    )
  );

drop policy if exists "checklist_results_delete_own" on public.checklist_results;
create policy "checklist_results_delete_own"
  on public.checklist_results for delete
  using (
    exists (
      select 1 from public.interventions i
      where i.id = checklist_results.intervention_id
        and i.agent_id = auth.uid()
    )
  );

-- =========================================================
-- media
-- =========================================================
alter table public.media enable row level security;

drop policy if exists "media_select_own" on public.media;
create policy "media_select_own"
  on public.media for select
  using (
    exists (
      select 1 from public.interventions i
      where i.id = media.intervention_id
        and i.agent_id = auth.uid()
    )
  );

drop policy if exists "media_insert_own" on public.media;
create policy "media_insert_own"
  on public.media for insert
  with check (
    exists (
      select 1 from public.interventions i
      where i.id = media.intervention_id
        and i.agent_id = auth.uid()
    )
  );

drop policy if exists "media_delete_own" on public.media;
create policy "media_delete_own"
  on public.media for delete
  using (
    exists (
      select 1 from public.interventions i
      where i.id = media.intervention_id
        and i.agent_id = auth.uid()
    )
  );

-- =========================================================
-- incidents
-- =========================================================
alter table public.incidents enable row level security;

drop policy if exists "incidents_select_own" on public.incidents;
create policy "incidents_select_own"
  on public.incidents for select
  using (reported_by = auth.uid());

drop policy if exists "incidents_insert_agent" on public.incidents;
create policy "incidents_insert_agent"
  on public.incidents for insert
  with check (
    reported_by = auth.uid()
    and reporter_role = 'agent'
  );
