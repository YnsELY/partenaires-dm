-- Les Partenaires DM — Catalogue de prestations de nettoyage
-- Tables `catalog_categories` + `catalog_services` seedées depuis le
-- cahier des charges Enedis (Poste Source, version 2008-02-21). Le
-- catalogue alimente le picker côté admin lors de la création d'une
-- checklist de chantier. Les colonnes `frequency`, `frequency_count` et
-- `catalog_service_id` sont ajoutées à `checklist_tasks` pour persister
-- la cadence attendue (H/M/A) sur chaque tâche.

-- =========================================================
-- TABLES
-- =========================================================
create table if not exists public.catalog_categories (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.catalog_categories(id) on delete cascade,
  label text not null,
  frequency text check (frequency in ('H','M','A','OnDemand')),
  frequency_count int not null default 1,
  note text,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  unique (category_id, order_index)
);

create index if not exists catalog_services_category_idx
  on public.catalog_services (category_id);

-- =========================================================
-- Extension de checklist_tasks
-- =========================================================
alter table public.checklist_tasks
  add column if not exists frequency text
    check (frequency in ('H','M','A','OnDemand')),
  add column if not exists frequency_count int,
  add column if not exists catalog_service_id uuid
    references public.catalog_services(id) on delete set null;

-- =========================================================
-- RLS — lecture autorisée à tous les utilisateurs authentifiés.
-- Aucune policy d'écriture : le catalogue est géré par migration.
-- =========================================================
alter table public.catalog_categories enable row level security;
alter table public.catalog_services enable row level security;

drop policy if exists "catalog_categories_select_authenticated"
  on public.catalog_categories;
create policy "catalog_categories_select_authenticated"
  on public.catalog_categories for select
  to authenticated
  using (true);

drop policy if exists "catalog_services_select_authenticated"
  on public.catalog_services;
create policy "catalog_services_select_authenticated"
  on public.catalog_services for select
  to authenticated
  using (true);

-- =========================================================
-- SEED — Catégories
-- =========================================================
insert into public.catalog_categories (slug, name, order_index) values
  ('refectoire',       'Réfectoire / Coins détente', 1),
  ('circulation',      'Circulation / Hall / Accès', 2),
  ('escaliers',        'Escaliers',                  3),
  ('bureaux',          'Bureaux',                    4),
  ('vestiaires',       'Vestiaires',                 5),
  ('sanitaires',       'Sanitaires',                 6),
  ('emprise_chantier', 'Emprise chantier',           7),
  ('remise_en_etat',   'Remise en état',             8)
on conflict (slug) do nothing;

-- =========================================================
-- SEED — Services
-- Chaque bloc cible une catégorie via son slug. On utilise un
-- on conflict (category_id, order_index) do nothing pour rester
-- idempotent si la migration est ré-exécutée.
-- =========================================================

-- Réfectoire / Coins détente (12)
insert into public.catalog_services
  (category_id, order_index, frequency, frequency_count, note, label)
select c.id, v.order_index, v.frequency, v.frequency_count, v.note, v.label
from public.catalog_categories c
cross join (values
  (1,  'H', 1, null,         'Enlèvement des traces et talonnades sur les sols plastiques'),
  (2,  'H', 1, null,         'Balayage humide et lavage du sol'),
  (3,  'H', 1, null,         'Vidage et nettoyage des poubelles selon la procédure de tri-sélectif en place — Mise en place et fourniture d''un sac plastique à la dimension appropriée'),
  (4,  'H', 1, null,         'Dépoussiérage et nettoyage de l''ensemble du mobilier d''agencement : tables, chaises, ...'),
  (5,  'H', 1, null,         'Nettoyage des éviers et de la robinetterie'),
  (6,  'H', 1, null,         'Dépoussiérage et nettoyage de l''extérieur des réfrigérateurs et fontaines à eau (bacs de trop plein inclus)'),
  (7,  'H', 1, null,         'Détartrage des éviers, de la robinetterie et des fontaines à eau'),
  (8,  'H', 1, null,         'Dépoussiérage et/ou nettoyage des portes vitrées et pleines, interrupteurs, poignées de portes, encadrements de portes et autres surfaces de contact'),
  (9,  'H', 1, null,         'Détachage localisé, enlèvement des souillures et salissures sur les parois verticales : murs, cloisons, panneaux d''affichage, etc.'),
  (10, 'M', 1, null,         'Dépoussiérage et/ou nettoyage des radiateurs, tuyauteries, plinthes, prises, piètements de mobiliers et autres finitions basses, des huisseries de fenêtres et autres rebords, des dessus de portes et autres finitions hautes'),
  (11, 'A', 1, null,         'Dépoussiérage/nettoyage des bouches de ventilation (sans démontage)'),
  (12, 'OnDemand', 1, 'Si présence', 'Enlèvement des toiles d''araignées')
) as v(order_index, frequency, frequency_count, note, label)
where c.slug = 'refectoire'
on conflict (category_id, order_index) do nothing;

-- Circulation / Hall / Accès (9)
insert into public.catalog_services
  (category_id, order_index, frequency, frequency_count, note, label)
select c.id, v.order_index, v.frequency, v.frequency_count, v.note, v.label
from public.catalog_categories c
cross join (values
  (1, 'H', 1, null,         'Enlèvement des traces et talonnades sur les sols et bas de parois'),
  (2, 'H', 1, null,         'Enlèvement des chewing-gums et autres collants au sol'),
  (3, 'H', 1, null,         'Balayage humide et lavage des sols dur'),
  (4, 'H', 1, null,         'Vidage et nettoyage des poubelles selon la procédure de tri-sélectif en place — Mise en place et fourniture d''un sac plastique à la dimension appropriée'),
  (5, 'H', 1, null,         'Dépoussiérage et/ou nettoyage des portes vitrées et pleines, interrupteurs, poignées de portes, encadrements de portes et autres surfaces de contact'),
  (6, 'M', 1, null,         'Détachage localisé, enlèvement des souillures et salissures sur les parois verticales : murs, cloisons, panneaux d''affichage, vitrines murales etc.'),
  (7, 'M', 1, null,         'Dépoussiérage et/ou nettoyage des radiateurs, tuyauteries, plinthes, prises, piètements de mobiliers et autres finitions basses, des huisseries de fenêtres et autres rebords, des dessus de portes et autres finitions hautes'),
  (8, 'A', 1, null,         'Dépoussiérage/nettoyage des bouches de ventilation (sans démontage)'),
  (9, 'OnDemand', 1, 'Si présence', 'Enlèvement des toiles d''araignées')
) as v(order_index, frequency, frequency_count, note, label)
where c.slug = 'circulation'
on conflict (category_id, order_index) do nothing;

-- Escaliers (7)
insert into public.catalog_services
  (category_id, order_index, frequency, frequency_count, note, label)
select c.id, v.order_index, v.frequency, v.frequency_count, v.note, v.label
from public.catalog_categories c
cross join (values
  (1, 'H', 1, null,         'Enlèvement des traces et talonnades sur les sols plastiques'),
  (2, 'H', 1, null,         'Enlèvement des chewing-gums et autres collants au sol'),
  (3, 'H', 1, null,         'Balayage humide et lavage du sol dur'),
  (4, 'H', 1, null,         'Vidage et nettoyage des poubelles selon la procédure de tri-sélectif en place — Mise en place et fourniture d''un sac plastique à la dimension appropriée'),
  (5, 'H', 1, null,         'Détachage localisé, enlèvement des souillures et salissures sur les parois verticales : murs, cloisons, panneaux d''affichage, etc.'),
  (6, 'M', 1, null,         'Dépoussiérage et/ou nettoyage des plinthes et autres finitions basses, des huisseries de fenêtres et autres rebords, des dessus de portes et autres finitions hautes'),
  (7, 'OnDemand', 1, 'Si présence', 'Enlèvement des toiles d''araignées')
) as v(order_index, frequency, frequency_count, note, label)
where c.slug = 'escaliers'
on conflict (category_id, order_index) do nothing;

-- Bureaux (11)
insert into public.catalog_services
  (category_id, order_index, frequency, frequency_count, note, label)
select c.id, v.order_index, v.frequency, v.frequency_count, v.note, v.label
from public.catalog_categories c
cross join (values
  (1,  'H', 1, null,                                       'Enlèvement des traces et talonnades sur les sols et bas de parois'),
  (2,  'H', 1, null,                                       'Enlèvement des chewing-gums et autres collants au sol'),
  (3,  'H', 1, null,                                       'Balayage humide et lavage des sols dur'),
  (4,  'H', 1, 'Détachage localisé sur incident',          'Aspiration de recherche des sols textiles'),
  (5,  'H', 1, 'Vidage le même jour pour le papier et les DIB', 'Vidage et nettoyage des poubelles selon la procédure de tri-sélectif en place — Mise en place et fourniture d''un sac plastique à la dimension appropriée'),
  (6,  'H', 1, null,                                       'Nettoyage du mobilier d''agencement, plan de travail, tables, armoires, étagères, classeurs, fauteuil, chaises, bureaux et lampes de bureau (liste non exhaustive)'),
  (7,  'H', 1, null,                                       'Dépoussiérage et/ou nettoyage des portes vitrées et pleines, interrupteurs, poignées de portes, encadrements de portes et autres surfaces de contact'),
  (8,  'M', 1, null,                                       'Détachage localisé, enlèvement des souillures et salissures sur les parois verticales : murs, cloisons, panneaux d''affichage, vitrines murales etc.'),
  (9,  'M', 1, null,                                       'Dépoussiérage et/ou nettoyage des radiateurs, tuyauteries, plinthes, prises, piètements de mobiliers et autres finitions basses, des huisseries de fenêtres et autres rebords, des dessus de portes, des dessus de meubles hauts et autres finitions hautes'),
  (10, 'A', 1, null,                                       'Dépoussiérage/nettoyage des bouches de ventilation (sans démontage)'),
  (11, 'OnDemand', 1, 'Si présence',                       'Enlèvement des toiles d''araignées')
) as v(order_index, frequency, frequency_count, note, label)
where c.slug = 'bureaux'
on conflict (category_id, order_index) do nothing;

-- Vestiaires (10)
insert into public.catalog_services
  (category_id, order_index, frequency, frequency_count, note, label)
select c.id, v.order_index, v.frequency, v.frequency_count, v.note, v.label
from public.catalog_categories c
cross join (values
  (1,  'H', 1, null,         'Mise en place et fourniture des consommables sanitaires'),
  (2,  'H', 1, null,         'Balayage humide et lavage des sols dur'),
  (3,  'H', 1, null,         'Vidage et nettoyage des poubelles selon la procédure de tri-sélectif en place — Mise en place et fourniture d''un sac plastique à la dimension appropriée'),
  (4,  'H', 1, null,         'Nettoyage et désinfection des installations sanitaires et douches'),
  (5,  'H', 1, null,         'Détartrage des installations sanitaires et douches'),
  (6,  'H', 1, null,         'Dépoussiérage et nettoyage du mobilier d''agencement : bancs, chaises, etc.'),
  (7,  'H', 1, null,         'Dépoussiérage et/ou nettoyage des portes vitrées et pleines, interrupteurs, poignées de portes, encadrements de portes et autres surfaces de contact'),
  (8,  'M', 1, null,         'Dépoussiérage et/ou nettoyage des radiateurs, tuyauteries, plinthes, prises, piètements de mobiliers et autres finitions basses, des huisseries de fenêtres et autres rebords, des dessus de portes, des dessus d''armoires et autres finitions hautes'),
  (9,  'A', 4, null,         'Dépoussiérage/nettoyage des bouches de ventilation (sans démontage)'),
  (10, 'OnDemand', 1, 'Si présence', 'Enlèvement des toiles d''araignées')
) as v(order_index, frequency, frequency_count, note, label)
where c.slug = 'vestiaires'
on conflict (category_id, order_index) do nothing;

-- Sanitaires (14)
insert into public.catalog_services
  (category_id, order_index, frequency, frequency_count, note, label)
select c.id, v.order_index, v.frequency, v.frequency_count, v.note, v.label
from public.catalog_categories c
cross join (values
  (1,  'H', 1, null,         'Mise en place et fourniture des consommables sanitaires'),
  (2,  'H', 1, null,         'Astiquage de la robinetterie'),
  (3,  'H', 1, null,         'Nettoyage des miroirs'),
  (4,  'H', 1, null,         'Nettoyage et désinfection des installations sanitaires'),
  (5,  'H', 1, null,         'Détartrage des installations sanitaires'),
  (6,  'H', 1, null,         'Essuyage et nettoyage des distributeurs de consommables'),
  (7,  'H', 1, null,         'Enlèvement des salissures et/ou souillures sur les faïences, portes, cloisons, murs, interrupteurs, miroirs…'),
  (8,  'H', 1, null,         'Vidage et nettoyage des poubelles selon la procédure de tri-sélectif en place — Mise en place et fourniture d''un sac plastique à la dimension appropriée'),
  (9,  'H', 1, null,         'Balayage des sols lisses'),
  (10, 'H', 1, null,         'Lavage et brossage des sols lisses avec produit désodorisant'),
  (11, 'A', 3, null,         'Nettoyage des faïences murales, murs et cloisons'),
  (12, 'M', 1, null,         'Dépoussiérage/nettoyage des radiateurs, tuyauteries, plinthes et autres finitions basses, huisseries de fenêtres et autres rebords'),
  (13, 'M', 1, null,         'Dépoussiérage des bandeaux luminaires et bouches d''aération'),
  (14, 'OnDemand', 1, 'Si présence', 'Enlèvement des toiles d''araignées')
) as v(order_index, frequency, frequency_count, note, label)
where c.slug = 'sanitaires'
on conflict (category_id, order_index) do nothing;

-- Emprise chantier (3)
insert into public.catalog_services
  (category_id, order_index, frequency, frequency_count, note, label)
select c.id, v.order_index, v.frequency, v.frequency_count, v.note, v.label
from public.catalog_categories c
cross join (values
  (1, 'H', 1, null, 'Enlèvement des déchets, détritus et feuilles présents sur les sols des abords'),
  (2, 'M', 2, null, 'Balayage et lavage du sol dur'),
  (3, 'H', 1, null, 'Vidage et nettoyage des poubelles et cendriers selon la procédure de tri-sélectif en place — Mise en place et fourniture d''un sac plastique à la dimension appropriée')
) as v(order_index, frequency, frequency_count, note, label)
where c.slug = 'emprise_chantier'
on conflict (category_id, order_index) do nothing;

-- Remise en état (2)
insert into public.catalog_services
  (category_id, order_index, frequency, frequency_count, note, label)
select c.id, v.order_index, v.frequency, v.frequency_count, v.note, v.label
from public.catalog_categories c
cross join (values
  (1, 'A', 1, null, 'Remise en état et protection des sols plastiques, parquets et assimilés'),
  (2, 'A', 1, null, 'Nettoyage approfondi des sols des circulations - hall - accès')
) as v(order_index, frequency, frequency_count, note, label)
where c.slug = 'remise_en_etat'
on conflict (category_id, order_index) do nothing;
