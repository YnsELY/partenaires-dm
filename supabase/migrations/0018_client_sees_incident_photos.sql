-- Les Partenaires DM — Le client peut voir les photos de résolution
-- des signalements une fois que l'admin a validé.
--
-- L'ancienne policy `media_select_for_client` ne couvrait que les médias
-- liés à une intervention. Les médias uploadés par l'agent pour
-- résoudre un signalement (media.incident_id) restaient invisibles
-- côté client même quand l'admin avait validé.
--
-- On élargit la policy à deux chemins parallèles : intervention validée
-- OU signalement résolu/clôturé appartenant au client.

drop policy if exists "media_select_for_client" on public.media;
create policy "media_select_for_client"
  on public.media for select
  using (
    expires_at > now()
    and (
      -- Cas intervention : déjà validée + sur un site du client
      (
        is_validated = true
        and intervention_id in (
          select i.id from public.interventions i
          where i.status = 'validated'
            and i.site_id in (select public.client_site_ids())
        )
      )
      -- Cas signalement : incident reporté par le client + résolu/clôturé
      or (
        incident_id in (
          select inc.id from public.incidents inc
          where inc.reported_by = auth.uid()
            and inc.reporter_role = 'client'
            and inc.status in ('resolved', 'closed')
        )
      )
    )
  );
