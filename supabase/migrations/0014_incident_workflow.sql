-- Les Partenaires DM — Workflow complet des signalements
--
-- Nouveau cycle de vie :
--   open                  → client vient de signaler
--   assigned              → admin a assigné un agent
--   in_progress           → agent a démarré le traitement
--   pending_validation    → agent a envoyé sa résolution, admin doit valider
--   resolved              → admin a validé
--   closed                → client a confirmé et clôturé

-- =========================================================
-- 1) Étendre l'enum status
-- =========================================================
alter table public.incidents
  drop constraint if exists incidents_status_check;

alter table public.incidents
  add constraint incidents_status_check
  check (status in ('open','assigned','in_progress','pending_validation','resolved','closed'));

-- =========================================================
-- 2) Timestamp de clôture par le client
-- =========================================================
alter table public.incidents
  add column if not exists closed_at timestamptz;

-- =========================================================
-- 3) RLS — le client peut passer son incident de 'resolved' à 'closed'
-- =========================================================
drop policy if exists "incidents_close_by_reporter" on public.incidents;
create policy "incidents_close_by_reporter"
  on public.incidents for update
  using (
    reported_by = auth.uid()
    and reporter_role = 'client'
    and status = 'resolved'
  )
  with check (
    reported_by = auth.uid()
    and reporter_role = 'client'
    and status = 'closed'
  );
