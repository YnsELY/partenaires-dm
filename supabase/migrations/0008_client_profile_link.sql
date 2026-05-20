-- Les Partenaires DM — liaison directe profil utilisateur ↔ entreprise cliente
--
-- Ajoute `profiles.client_id` (FK nullable vers clients) qui rattache un
-- utilisateur (role='client') à une entreprise. À partir de là, l'utilisateur
-- voit automatiquement tous les sites de cette entreprise via le helper RLS,
-- sans qu'on ait à remplir manuellement `client_site_access` ligne par ligne.
--
-- `client_site_access` reste utile pour les cas d'accès granulaire
-- (utilisateur qui ne voit qu'un sous-ensemble de sites de l'entreprise).

-- =========================================================
-- Colonne profiles.client_id
-- =========================================================
alter table public.profiles
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists profiles_client_idx on public.profiles (client_id);

-- =========================================================
-- Helper : sites visibles par le client courant
--   = sites de son entreprise (profiles.client_id)
--   + sites où une ligne client_site_access existe
-- =========================================================
create or replace function public.client_site_ids()
returns setof uuid
language sql stable security definer set search_path = public
as $$
  select s.id
  from public.sites s
  join public.profiles p on p.id = auth.uid()
  where s.client_id = p.client_id
  union
  select site_id
  from public.client_site_access
  where client_profile_id = auth.uid();
$$;
