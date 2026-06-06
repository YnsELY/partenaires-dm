-- Les Partenaires DM — Notifications push Expo
--
-- Stocke les Expo push tokens par utilisateur/appareil et journalise les
-- événements de notification envoyés via les Edge Functions.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  device_id text,
  platform text not null default 'unknown'
    check (platform in ('ios', 'android', 'web', 'unknown')),
  device_name text,
  app_version text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index if not exists push_tokens_user_active_idx
  on public.push_tokens (user_id, is_active);
create index if not exists push_tokens_token_idx
  on public.push_tokens (expo_push_token);

drop trigger if exists push_tokens_touch_updated_at on public.push_tokens;
create trigger push_tokens_touch_updated_at
  before update on public.push_tokens
  for each row execute function public.touch_updated_at();

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens_select_own" on public.push_tokens;
create policy "push_tokens_select_own"
  on public.push_tokens for select
  using (user_id = auth.uid());

drop policy if exists "push_tokens_insert_own" on public.push_tokens;
create policy "push_tokens_insert_own"
  on public.push_tokens for insert
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_update_own" on public.push_tokens;
create policy "push_tokens_update_own"
  on public.push_tokens for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "push_tokens_delete_own" on public.push_tokens;
create policy "push_tokens_delete_own"
  on public.push_tokens for delete
  using (user_id = auth.uid());

drop policy if exists "push_tokens_admin_select" on public.push_tokens;
create policy "push_tokens_admin_select"
  on public.push_tokens for select
  using (public.is_admin());

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  entity_type text,
  entity_id uuid,
  recipient_user_ids uuid[] not null default '{}',
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'created'
    check (status in ('created', 'sent', 'partial_error', 'no_tokens', 'error')),
  recipient_count int not null default 0,
  ticket_count int not null default 0,
  tickets jsonb,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_events_event_idx
  on public.notification_events (event_type, created_at desc);
create index if not exists notification_events_entity_idx
  on public.notification_events (entity_type, entity_id);

alter table public.notification_events enable row level security;

drop policy if exists "notification_events_admin_select" on public.notification_events;
create policy "notification_events_admin_select"
  on public.notification_events for select
  using (public.is_admin());
