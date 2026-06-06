-- Les Partenaires DM — le client voit toutes les photos d'une intervention validée
--
-- Auparavant, la policy `media_select_for_client` exigeait `is_validated = true`
-- sur chaque ligne `media`. Ce flag est censé être posé par l'edge function
-- `validate-intervention` au moment où l'admin valide. En pratique, ça crée
-- une dépendance fragile : si l'update du flag échoue silencieusement, ou si
-- des médias plus anciens n'ont jamais reçu le flag, le client se retrouve
-- avec un rapport sans aucune photo (et le PDF aussi, puisque la fonction
-- generate-report appliquait le même filtre).
--
-- On simplifie : dès que l'intervention est dans le statut `validated`, le
-- client voit toutes ses photos. La sélection par l'admin n'a jamais été
-- exposée dans l'UI de validation (cf. validate-intervention/index.ts qui
-- valide TOUTES les photos d'office), donc on supprime simplement cette
-- condition redondante côté RLS.

drop policy if exists "media_select_for_client" on public.media;
create policy "media_select_for_client"
  on public.media for select
  using (
    expires_at > now()
    and (
      -- Cas intervention : intervention validée + sur un site du client.
      -- Plus de filtre is_validated : valider l'intervention rend toutes
      -- ses photos visibles.
      intervention_id in (
        select i.id from public.interventions i
        where i.status = 'validated'
          and i.site_id in (select public.client_site_ids())
      )
      -- Cas signalement : incident reporté par le client + résolu/clôturé
      or incident_id in (
        select inc.id from public.incidents inc
        where inc.reported_by = auth.uid()
          and inc.reporter_role = 'client'
          and inc.status in ('resolved', 'closed')
      )
    )
  );

-- Backfill : marque comme validées toutes les photos appartenant à une
-- intervention déjà validée. Inoffensif (le flag n'est plus utilisé pour
-- gating le client) mais reste utile pour d'éventuels consommateurs admin
-- qui voudraient distinguer "valide pour client" vs "interne".
update public.media m
set is_validated = true
from public.interventions i
where m.intervention_id = i.id
  and i.status = 'validated'
  and m.is_validated = false;
