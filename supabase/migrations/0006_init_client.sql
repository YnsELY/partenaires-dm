-- Les Partenaires DM — schéma additionnel pour le rôle Client
-- Ajoute la table de liaison `client_site_access` (M:N profil client ↔ sites)
-- et la table `evaluations` (notes laissées par les clients).

-- =========================================================
-- CLIENT_SITE_ACCESS — quels profils client peuvent voir quels sites
-- =========================================================
create table if not exists public.client_site_access (
  client_profile_id uuid not null references public.profiles(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_profile_id, site_id)
);

create index if not exists client_site_access_profile_idx
  on public.client_site_access (client_profile_id);
create index if not exists client_site_access_site_idx
  on public.client_site_access (site_id);

-- =========================================================
-- EVALUATIONS — avis des clients sur une intervention validée
-- =========================================================
create table if not exists public.evaluations (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  client_profile_id uuid not null references public.profiles(id) on delete cascade,
  rating int check (rating between 1 and 5),
  satisfaction text check (satisfaction in ('satisfied','to_improve')),
  comment text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (intervention_id, client_profile_id)
);

create index if not exists evaluations_intervention_idx
  on public.evaluations (intervention_id);
create index if not exists evaluations_client_idx
  on public.evaluations (client_profile_id);

-- Trigger pour mettre à jour `updated_at` automatiquement
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists evaluations_touch_updated_at on public.evaluations;
create trigger evaluations_touch_updated_at
  before update on public.evaluations
  for each row execute function public.touch_updated_at();

-- =========================================================
-- Helper : sites accessibles à l'utilisateur courant (en tant que client)
-- =========================================================
create or replace function public.client_site_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select site_id from public.client_site_access where client_profile_id = auth.uid();
$$;
