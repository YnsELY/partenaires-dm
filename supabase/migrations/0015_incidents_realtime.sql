-- Les Partenaires DM — Active le realtime sur la table incidents
--
-- Sans cela, les changements de statut (ex: client qui clôture) ne
-- déclenchent aucun event chez les autres clients/admin/agents.
-- On en profite pour activer aussi `media` (utilisé pour les photos
-- de résolution) et `checklist_results` (cohérence avec ce qu'on
-- pourrait surveiller côté admin).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.incidents';
    exception
      when duplicate_object then null;
    end;
  end if;
end$$;

-- Replica identity full : on reçoit la row complète (avant + après)
-- dans les payloads realtime, indispensable pour les filtres sur des
-- colonnes mises à jour (status, assigned_agent_id, etc.).
alter table public.incidents replica identity full;
