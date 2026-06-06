-- Les Partenaires DM — champ "Détails" pour le rapport d'intervention
--
-- L'admin disposait déjà d'un `admin_summary` (résumé court visible en tête
-- du rapport). On ajoute `admin_details`, un champ texte libre destiné à des
-- précisions plus longues sur l'intervention (contexte, observations, etc.),
-- qui apparaîtra dans le PDF et côté client en complément du résumé.

alter table public.interventions
  add column if not exists admin_details text;
