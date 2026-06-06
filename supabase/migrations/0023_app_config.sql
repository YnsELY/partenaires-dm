-- Les Partenaires DM — Configuration applicative & force-update
--
-- Table `app_config` à ligne unique : contient la version minimale supportée
-- de l'app. Si la version installée est inférieure, l'app affiche un écran
-- bloquant invitant à mettre à jour (voir components/ForceUpdateGate.tsx).
--
-- Lecture publique (le contrôle doit fonctionner même avant connexion),
-- écriture réservée à l'admin. L'admin met à jour `min_supported_version`
-- directement en base lors de la publication d'une nouvelle version requise.

create table if not exists public.app_config (
  id boolean primary key default true,
  -- Version minimale (semver "x.y.z") que l'app doit avoir pour fonctionner.
  min_supported_version text not null default '1.0.0',
  -- Liens vers les stores (renseignés une fois l'app publiée).
  ios_app_url text,
  android_app_url text,
  -- Message personnalisé optionnel affiché dans le pop-up bloquant.
  update_message text,
  updated_at timestamptz not null default now(),
  -- Force une seule ligne (id = true).
  constraint app_config_singleton check (id)
);

-- Ligne unique par défaut (ne bloque personne tant que la version min reste à 1.0.0).
insert into public.app_config (id, android_app_url)
values (true, 'https://play.google.com/store/apps/details?id=com.partenairesmultiservices.app')
on conflict (id) do nothing;

drop trigger if exists app_config_touch_updated_at on public.app_config;
create trigger app_config_touch_updated_at
  before update on public.app_config
  for each row execute function public.touch_updated_at();

alter table public.app_config enable row level security;

-- Lecture publique (anon + authenticated) : le gate doit pouvoir lire la config
-- même sur l'écran de connexion, avant toute authentification.
drop policy if exists "app_config_select_all" on public.app_config;
create policy "app_config_select_all"
  on public.app_config for select
  using (true);

-- Seul l'admin peut modifier la version minimale et les liens stores.
drop policy if exists "app_config_admin_update" on public.app_config;
create policy "app_config_admin_update"
  on public.app_config for update
  using (public.is_admin())
  with check (public.is_admin());
