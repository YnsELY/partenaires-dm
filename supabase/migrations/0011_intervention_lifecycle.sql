-- Les Partenaires DM — Cycle de vie complet d'une intervention
-- 1) Ajoute admin_notes (pour le motif de rejet)
-- 2) Ajoute intervention_id (nullable) à checklist_tasks pour permettre
--    un snapshot per-intervention modifiable par l'admin
-- 3) Backfill : copie les tâches templates des chantiers en lignes
--    per-intervention pour toutes les interventions existantes, et
--    redirige les checklist_results vers les nouvelles copies
-- 4) Crée le bucket reports (PDF générés)
-- 5) Ajoute la policy RLS qui autorise le client à lire checklist_results
--    de ses interventions

-- =========================================================
-- 1) admin_notes sur interventions
-- =========================================================
alter table public.interventions
  add column if not exists admin_notes text;

-- =========================================================
-- 2) intervention_id sur checklist_tasks
-- intervention_id IS NULL  → template du site (existant)
-- intervention_id IS NOT NULL → copie pour cette intervention, éditable
-- =========================================================
alter table public.checklist_tasks
  add column if not exists intervention_id uuid
    references public.interventions(id) on delete cascade;

create index if not exists checklist_tasks_intervention_idx
  on public.checklist_tasks (intervention_id);

-- =========================================================
-- 3) Backfill idempotent
-- Pour chaque intervention sans tâches per-intervention encore,
-- on copie les tâches templates du chantier et on redirige les
-- checklist_results (mapping par order_index + label + zone).
-- =========================================================
do $$
declare iv record;
begin
  for iv in
    select id, site_id from public.interventions
    where not exists (
      select 1 from public.checklist_tasks
      where intervention_id = interventions.id
    )
  loop
    with src as (
      select id, label, zone, order_index, frequency, frequency_count, catalog_service_id
      from public.checklist_tasks
      where site_id = iv.site_id and intervention_id is null
    ),
    inserted as (
      insert into public.checklist_tasks
        (site_id, intervention_id, label, zone, order_index,
         frequency, frequency_count, catalog_service_id)
      select iv.site_id, iv.id, label, zone, order_index,
             frequency, frequency_count, catalog_service_id
      from src
      returning id, order_index, label, zone
    ),
    mapping as (
      select s.id as old_id, i.id as new_id
      from src s
      join inserted i
        on i.order_index = s.order_index
       and i.label = s.label
       and coalesce(i.zone, '') = coalesce(s.zone, '')
    )
    update public.checklist_results r
       set task_id = m.new_id
       from mapping m
      where r.intervention_id = iv.id
        and r.task_id = m.old_id;
  end loop;
end$$;

-- =========================================================
-- 4) Storage bucket pour les PDF de rapport
-- =========================================================
insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do nothing;

-- Policy storage : l'admin lit/écrit tout
drop policy if exists "reports_admin_all" on storage.objects;
create policy "reports_admin_all"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'reports' and public.is_admin())
  with check (bucket_id = 'reports' and public.is_admin());

-- Policy storage : l'agent assigné peut lire les PDF de ses interventions
-- (path format : "<intervention_id>/report.pdf")
drop policy if exists "reports_agent_read" on storage.objects;
create policy "reports_agent_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'reports'
    and exists (
      select 1 from public.interventions i
      where i.id::text = split_part(storage.objects.name, '/', 1)
        and i.agent_id = auth.uid()
    )
  );

-- Policy storage : le client peut lire les PDF de ses interventions validées
drop policy if exists "reports_client_read" on storage.objects;
create policy "reports_client_read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'reports'
    and exists (
      select 1 from public.interventions i
      where i.id::text = split_part(storage.objects.name, '/', 1)
        and i.status = 'validated'
        and i.site_id in (select public.client_site_ids())
    )
  );

-- =========================================================
-- 5) Policy : client peut lire les checklist_results
--    de ses interventions validées
-- =========================================================
drop policy if exists "checklist_results_select_for_client" on public.checklist_results;
create policy "checklist_results_select_for_client"
  on public.checklist_results for select
  using (
    intervention_id in (
      select i.id from public.interventions i
      where i.status = 'validated'
        and i.site_id in (select public.client_site_ids())
    )
  );

-- Pendant qu'on y est : autoriser le client à lire les checklist_tasks
-- per-intervention (les templates étaient déjà couverts par
-- checklist_tasks_select_for_client via site_id).
-- La policy existante utilise site_id in (client_site_ids()) — donc une
-- tâche per-intervention reste lisible tant que son site_id pointe sur
-- un site accessible. Rien à ajouter ici.
