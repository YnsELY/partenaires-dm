-- Les Partenaires DM — Affectation d'un signalement à un agent
--
-- Quand l'admin met un incident "en cours", il peut désormais l'assigner
-- à un agent (potentiellement différent de l'agent original de
-- l'intervention). L'agent assigné voit le signalement, peut uploader
-- des photos de résolution et marquer comme résolu.

-- =========================================================
-- 1) Colonnes sur incidents
-- =========================================================
alter table public.incidents
  add column if not exists assigned_agent_id uuid
    references public.profiles(id) on delete set null,
  add column if not exists agent_resolution_notes text;

create index if not exists incidents_assigned_agent_idx
  on public.incidents (assigned_agent_id);

-- =========================================================
-- 2) Colonne incident_id sur media (photos de résolution)
-- =========================================================
alter table public.media
  add column if not exists incident_id uuid
    references public.incidents(id) on delete set null;

create index if not exists media_incident_idx on public.media (incident_id);

-- =========================================================
-- 3) RLS — l'agent assigné peut lire/mettre à jour l'incident
-- =========================================================
drop policy if exists "incidents_select_assigned_agent" on public.incidents;
create policy "incidents_select_assigned_agent"
  on public.incidents for select
  using (assigned_agent_id = auth.uid());

drop policy if exists "incidents_update_assigned_agent" on public.incidents;
create policy "incidents_update_assigned_agent"
  on public.incidents for update
  using (assigned_agent_id = auth.uid())
  with check (assigned_agent_id = auth.uid());

-- =========================================================
-- 4) RLS — l'agent assigné peut lire l'intervention/site/checklist liés
--    (utile pour afficher le contexte dans son écran)
-- =========================================================
drop policy if exists "interventions_select_for_incident_agent" on public.interventions;
create policy "interventions_select_for_incident_agent"
  on public.interventions for select
  using (
    id in (
      select intervention_id from public.incidents
      where assigned_agent_id = auth.uid()
        and intervention_id is not null
    )
  );

drop policy if exists "sites_select_for_incident_agent" on public.sites;
create policy "sites_select_for_incident_agent"
  on public.sites for select
  using (
    id in (
      select site_id from public.incidents
      where assigned_agent_id = auth.uid()
    )
  );

-- =========================================================
-- 5) RLS — l'agent assigné peut INSERT des photos liées à l'incident
--    et SELECT toutes les photos de cet incident
-- =========================================================
drop policy if exists "media_insert_incident_agent" on public.media;
create policy "media_insert_incident_agent"
  on public.media for insert
  with check (
    incident_id is not null
    and incident_id in (
      select id from public.incidents
      where assigned_agent_id = auth.uid()
    )
  );

drop policy if exists "media_select_incident_agent" on public.media;
create policy "media_select_incident_agent"
  on public.media for select
  using (
    incident_id in (
      select id from public.incidents
      where assigned_agent_id = auth.uid()
    )
  );

drop policy if exists "media_delete_incident_agent" on public.media;
create policy "media_delete_incident_agent"
  on public.media for delete
  using (
    incident_id in (
      select id from public.incidents
      where assigned_agent_id = auth.uid()
    )
  );
