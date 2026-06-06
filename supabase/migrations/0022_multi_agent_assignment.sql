-- Les Partenaires DM — Affectation multi-agents
-- Permet de rattacher plusieurs agents à un même chantier (site_agents) et à
-- une même intervention (intervention_agents). Tous les agents rattachés à une
-- intervention partagent les mêmes droits que l'agent principal (ajout de
-- photos, checklist, notes, soumission...).
--
-- Modèle :
--   * interventions.agent_id reste l'agent "principal" (rétro-compat, PDF,
--     notifications historiques). On le conserve.
--   * intervention_agents = autorité d'accès (1 ligne par agent rattaché).
--   * site_agents = agents par défaut d'un chantier (pré-remplissage côté admin).
--
-- Les helpers sont en SECURITY DEFINER pour contourner la RLS interne et éviter
-- toute récursion de policy (même schéma que public.agent_team_ids()).

-- =========================================================
-- Tables de jonction
-- =========================================================
create table if not exists public.intervention_agents (
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (intervention_id, agent_id)
);

create index if not exists intervention_agents_agent_idx
  on public.intervention_agents (agent_id);

create table if not exists public.site_agents (
  site_id uuid not null references public.sites(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (site_id, agent_id)
);

create index if not exists site_agents_agent_idx
  on public.site_agents (agent_id);

-- =========================================================
-- Backfill : l'agent principal existant devient membre de la jonction
-- =========================================================
insert into public.intervention_agents (intervention_id, agent_id)
select id, agent_id
from public.interventions
where agent_id is not null
on conflict do nothing;

-- =========================================================
-- Helpers d'accès (SECURITY DEFINER)
-- =========================================================

-- Vrai si l'agent courant peut accéder à l'intervention `iv`
-- (agent principal, membre d'équipe, ou rattaché via intervention_agents).
create or replace function public.agent_can_access_intervention(iv uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.interventions i
    where i.id = iv
      and (
        i.agent_id = auth.uid()
        or i.team_id in (select public.agent_team_ids())
        or exists (
          select 1 from public.intervention_agents ia
          where ia.intervention_id = i.id
            and ia.agent_id = auth.uid()
        )
      )
  );
$$;

-- Ids des interventions accessibles à l'agent courant.
create or replace function public.agent_intervention_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select i.id from public.interventions i
  where i.agent_id = auth.uid()
     or i.team_id in (select public.agent_team_ids())
     or exists (
       select 1 from public.intervention_agents ia
       where ia.intervention_id = i.id
         and ia.agent_id = auth.uid()
     );
$$;

-- Ids des chantiers accessibles à l'agent courant (via une intervention
-- accessible OU via site_agents).
create or replace function public.agent_site_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select s.id from public.sites s
  where exists (
    select 1 from public.interventions i
    where i.site_id = s.id
      and (
        i.agent_id = auth.uid()
        or i.team_id in (select public.agent_team_ids())
        or exists (
          select 1 from public.intervention_agents ia
          where ia.intervention_id = i.id
            and ia.agent_id = auth.uid()
        )
      )
  )
  or exists (
    select 1 from public.site_agents sa
    where sa.site_id = s.id
      and sa.agent_id = auth.uid()
  );
$$;

-- =========================================================
-- RLS — élargissement des policies agent existantes
-- =========================================================

-- clients : visibles si rattachés à un chantier accessible
drop policy if exists "clients_select_for_agents_with_intervention" on public.clients;
create policy "clients_select_for_agents_with_intervention"
  on public.clients for select
  using (
    id in (
      select s.client_id from public.sites s
      where s.id in (select public.agent_site_ids())
    )
  );

-- sites : visibles si accessibles (intervention ou site_agents)
drop policy if exists "sites_select_assigned_agent" on public.sites;
create policy "sites_select_assigned_agent"
  on public.sites for select
  using (id in (select public.agent_site_ids()));

-- checklist_tasks : visibles pour les chantiers accessibles
drop policy if exists "checklist_tasks_select_for_assigned_sites" on public.checklist_tasks;
create policy "checklist_tasks_select_for_assigned_sites"
  on public.checklist_tasks for select
  using (site_id in (select public.agent_site_ids()));

-- interventions : SELECT élargi à la jonction
drop policy if exists "interventions_select_own_or_team" on public.interventions;
create policy "interventions_select_own_or_team"
  on public.interventions for select
  using (id in (select public.agent_intervention_ids()));

-- interventions : UPDATE par tout agent rattaché (l'agent ne peut toujours pas
-- s'auto-valider/refuser).
drop policy if exists "interventions_update_own" on public.interventions;
create policy "interventions_update_own"
  on public.interventions for update
  using (public.agent_can_access_intervention(id))
  with check (
    public.agent_can_access_intervention(id)
    and status in ('scheduled','in_progress','pending_validation')
  );

-- checklist_results : tout agent rattaché
drop policy if exists "checklist_results_select_own" on public.checklist_results;
create policy "checklist_results_select_own"
  on public.checklist_results for select
  using (public.agent_can_access_intervention(intervention_id));

drop policy if exists "checklist_results_insert_own" on public.checklist_results;
create policy "checklist_results_insert_own"
  on public.checklist_results for insert
  with check (public.agent_can_access_intervention(intervention_id));

drop policy if exists "checklist_results_update_own" on public.checklist_results;
create policy "checklist_results_update_own"
  on public.checklist_results for update
  using (public.agent_can_access_intervention(intervention_id));

drop policy if exists "checklist_results_delete_own" on public.checklist_results;
create policy "checklist_results_delete_own"
  on public.checklist_results for delete
  using (public.agent_can_access_intervention(intervention_id));

-- media : tout agent rattaché
drop policy if exists "media_select_own" on public.media;
create policy "media_select_own"
  on public.media for select
  using (public.agent_can_access_intervention(intervention_id));

drop policy if exists "media_insert_own" on public.media;
create policy "media_insert_own"
  on public.media for insert
  with check (public.agent_can_access_intervention(intervention_id));

drop policy if exists "media_delete_own" on public.media;
create policy "media_delete_own"
  on public.media for delete
  using (public.agent_can_access_intervention(intervention_id));

-- =========================================================
-- RLS sur les tables de jonction
-- =========================================================
alter table public.intervention_agents enable row level security;

drop policy if exists "intervention_agents_admin_all" on public.intervention_agents;
create policy "intervention_agents_admin_all"
  on public.intervention_agents for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "intervention_agents_select_self" on public.intervention_agents;
create policy "intervention_agents_select_self"
  on public.intervention_agents for select
  using (agent_id = auth.uid());

alter table public.site_agents enable row level security;

drop policy if exists "site_agents_admin_all" on public.site_agents;
create policy "site_agents_admin_all"
  on public.site_agents for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "site_agents_select_self" on public.site_agents;
create policy "site_agents_select_self"
  on public.site_agents for select
  using (agent_id = auth.uid());

-- =========================================================
-- Realtime : un agent ajouté/retiré d'une intervention doit voir sa liste
-- se mettre à jour sans rechargement manuel.
-- =========================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.intervention_agents';
    exception
      when duplicate_object then null;
    end;
  end if;
end$$;

alter table public.intervention_agents replica identity full;
