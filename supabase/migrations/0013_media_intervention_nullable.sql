-- Les Partenaires DM — media.intervention_id devient nullable
--
-- Depuis la migration 0012, on peut attacher une photo à un incident
-- (incident_id) sans qu'il y ait forcément d'intervention liée (les
-- signalements clients faits depuis l'onglet Messages n'ont pas
-- toujours d'intervention_id renseigné).
--
-- On relâche donc la contrainte NOT NULL sur media.intervention_id
-- et on ajoute un check pour garantir qu'au moins l'un des deux
-- liens (intervention_id ou incident_id) est présent.

alter table public.media
  alter column intervention_id drop not null;

alter table public.media
  drop constraint if exists media_link_present;

alter table public.media
  add constraint media_link_present
  check (intervention_id is not null or incident_id is not null);
