-- Les Partenaires DM — Le client peut voir ses interventions à venir
--
-- Jusqu'ici, la policy `interventions_select_for_client` limitait la
-- lecture aux interventions `validated`. Conséquence : le client ne
-- voyait pas les interventions planifiées ou en cours sur ses sites,
-- et donc ne pouvait jamais afficher les pastilles "INTERVENTION
-- PRÉVUE" / "INTERVENTION EN COURS" sur sa home.
--
-- On élargit la policy : le client lit toutes les interventions sur
-- ses sites, sauf celles `rejected` qui restent internes (échec admin
-- ↔ agent, pas censées être visibles côté client).

drop policy if exists "interventions_select_for_client" on public.interventions;
create policy "interventions_select_for_client"
  on public.interventions for select
  using (
    site_id in (select public.client_site_ids())
    and status <> 'rejected'
  );
