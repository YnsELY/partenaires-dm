-- Les Partenaires DM — schéma initial (sous-ensemble Agent)
-- À appliquer dans cet ordre. Dépend de l'extension `pgcrypto` pour gen_random_uuid().

create extension if not exists pgcrypto;

-- =========================================================
-- PROFILES (lié à auth.users)
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'agent', 'client')),
  full_name text,
  phone text,
  email text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);

-- =========================================================
-- CLIENTS (entreprises)
-- =========================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  contract_type text,
  created_at timestamptz not null default now()
);

-- =========================================================
-- TEAMS
-- =========================================================
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  zone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  primary key (team_id, agent_id)
);

create index if not exists team_members_agent_idx on public.team_members (agent_id);

-- =========================================================
-- SITES (chantiers)
-- =========================================================
create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  address text,
  service_type text,
  description text,
  photo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists sites_client_idx on public.sites (client_id);

-- =========================================================
-- CHECKLIST_TASKS (modèles de tâches par site)
-- =========================================================
create table if not exists public.checklist_tasks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  label text not null,
  zone text,
  order_index int not null default 0
);

create index if not exists checklist_tasks_site_idx on public.checklist_tasks (site_id);

-- =========================================================
-- INTERVENTIONS
-- =========================================================
create table if not exists public.interventions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references public.sites(id) on delete cascade,
  agent_id uuid references public.profiles(id) on delete set null,
  team_id uuid references public.teams(id) on delete set null,
  scheduled_at timestamptz not null,
  started_at timestamptz,
  submitted_at timestamptz,
  validated_at timestamptz,
  status text not null default 'scheduled'
    check (status in ('scheduled','in_progress','pending_validation','validated','rejected')),
  agent_notes text,
  admin_summary text,
  global_result text check (global_result in ('ok','to_improve')),
  pdf_url text,
  created_at timestamptz not null default now()
);

create index if not exists interventions_agent_idx on public.interventions (agent_id);
create index if not exists interventions_team_idx on public.interventions (team_id);
create index if not exists interventions_site_idx on public.interventions (site_id);
create index if not exists interventions_scheduled_idx on public.interventions (scheduled_at);
create index if not exists interventions_status_idx on public.interventions (status);

-- =========================================================
-- CHECKLIST_RESULTS
-- =========================================================
create table if not exists public.checklist_results (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  task_id uuid not null references public.checklist_tasks(id) on delete cascade,
  is_done boolean not null default false,
  zone text,
  unique (intervention_id, task_id)
);

create index if not exists checklist_results_intervention_idx on public.checklist_results (intervention_id);

-- =========================================================
-- MEDIA
-- =========================================================
create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid not null references public.interventions(id) on delete cascade,
  url text not null,
  type text not null check (type in ('before','after','anomaly')),
  zone text,
  is_validated boolean not null default false,
  taken_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 days'),
  created_at timestamptz not null default now()
);

create index if not exists media_intervention_idx on public.media (intervention_id);
create index if not exists media_expires_idx on public.media (expires_at);

-- =========================================================
-- INCIDENTS
-- =========================================================
create table if not exists public.incidents (
  id uuid primary key default gen_random_uuid(),
  intervention_id uuid references public.interventions(id) on delete set null,
  site_id uuid not null references public.sites(id) on delete cascade,
  reported_by uuid not null references public.profiles(id) on delete cascade,
  reporter_role text not null check (reporter_role in ('agent','client')),
  zone text,
  description text,
  photo_url text,
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  admin_notes text,
  created_at timestamptz not null default now()
);

create index if not exists incidents_site_idx on public.incidents (site_id);
create index if not exists incidents_reporter_idx on public.incidents (reported_by);
