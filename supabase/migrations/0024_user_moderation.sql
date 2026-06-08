-- Les Partenaires DM — Système de modération (blocage / signalement utilisateurs)

-- =========================================================
-- BLOCKED USERS
-- =========================================================
create table if not exists public.blocked_users (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocked_users_blocker_idx on public.blocked_users (blocker_id);
create index if not exists blocked_users_blocked_idx on public.blocked_users (blocked_id);

alter table public.blocked_users enable row level security;

drop policy if exists "blocked_users_select_own" on public.blocked_users;
create policy "blocked_users_select_own"
  on public.blocked_users for select
  using (blocker_id = auth.uid());

drop policy if exists "blocked_users_insert_own" on public.blocked_users;
create policy "blocked_users_insert_own"
  on public.blocked_users for insert
  with check (blocker_id = auth.uid() and blocker_id <> blocked_id);

drop policy if exists "blocked_users_delete_own" on public.blocked_users;
create policy "blocked_users_delete_own"
  on public.blocked_users for delete
  using (blocker_id = auth.uid());

drop policy if exists "blocked_users_admin_select" on public.blocked_users;
create policy "blocked_users_admin_select"
  on public.blocked_users for select
  using (public.is_admin());

-- =========================================================
-- USER REPORTS
-- =========================================================
create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment', 'spam', 'inappropriate', 'other')),
  details text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'dismissed')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index if not exists user_reports_reporter_idx on public.user_reports (reporter_id);
create index if not exists user_reports_reported_idx on public.user_reports (reported_id);
create index if not exists user_reports_status_idx
  on public.user_reports (status, created_at desc);

alter table public.user_reports enable row level security;

drop policy if exists "user_reports_insert_own" on public.user_reports;
create policy "user_reports_insert_own"
  on public.user_reports for insert
  with check (reporter_id = auth.uid() and reporter_id <> reported_id);

drop policy if exists "user_reports_select_own" on public.user_reports;
create policy "user_reports_select_own"
  on public.user_reports for select
  using (reporter_id = auth.uid());

drop policy if exists "user_reports_admin_all" on public.user_reports;
create policy "user_reports_admin_all"
  on public.user_reports for all
  using (public.is_admin());
