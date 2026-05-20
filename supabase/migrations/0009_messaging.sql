-- Les Partenaires DM — Messagerie admin <-> agent
-- Crée les tables `conversations` et `messages`, leurs policies RLS,
-- et les ajoute à la publication realtime de Supabase pour la mise à jour
-- temps réel côté front (websockets).

-- =========================================================
-- CONVERSATIONS
-- =========================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  agent_id uuid not null references public.profiles(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  created_at timestamptz not null default now(),
  unique (admin_id, agent_id)
);

create index if not exists conversations_admin_idx on public.conversations (admin_id);
create index if not exists conversations_agent_idx on public.conversations (agent_id);
create index if not exists conversations_last_message_idx
  on public.conversations (last_message_at desc);

-- =========================================================
-- MESSAGES
-- =========================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) > 0),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx
  on public.messages (conversation_id, created_at desc);
create index if not exists messages_sender_idx on public.messages (sender_id);

-- =========================================================
-- Helper : auth.uid() est participant à la conversation ?
-- =========================================================
create or replace function public.is_conversation_participant(conv_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = conv_id
      and (c.admin_id = auth.uid() or c.agent_id = auth.uid())
  );
$$;

-- =========================================================
-- Trigger : tient à jour last_message_at + preview à chaque message
-- =========================================================
create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.conversations
    set last_message_at = new.created_at,
        last_message_preview = left(new.body, 140)
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_bump_conversation_on_message on public.messages;
create trigger trg_bump_conversation_on_message
  after insert on public.messages
  for each row execute function public.bump_conversation_on_message();

-- =========================================================
-- RLS — conversations
-- =========================================================
alter table public.conversations enable row level security;

drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
  on public.conversations for select
  using (admin_id = auth.uid() or agent_id = auth.uid());

-- Un admin peut créer une conversation avec n'importe quel agent.
drop policy if exists "conversations_insert_admin" on public.conversations;
create policy "conversations_insert_admin"
  on public.conversations for insert
  with check (
    public.is_admin()
    and admin_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = agent_id and p.role = 'agent'
    )
  );

-- Un agent peut initier une conversation avec un admin (cas optionnel).
drop policy if exists "conversations_insert_agent" on public.conversations;
create policy "conversations_insert_agent"
  on public.conversations for insert
  with check (
    agent_id = auth.uid()
    and exists (
      select 1 from public.profiles p
      where p.id = admin_id and p.role = 'admin'
    )
  );

-- =========================================================
-- RLS — messages
-- =========================================================
alter table public.messages enable row level security;

drop policy if exists "messages_select_participant" on public.messages;
create policy "messages_select_participant"
  on public.messages for select
  using (public.is_conversation_participant(conversation_id));

drop policy if exists "messages_insert_participant" on public.messages;
create policy "messages_insert_participant"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and public.is_conversation_participant(conversation_id)
  );

-- L'expéditeur peut "soft delete" (update read_at autorisé au destinataire).
drop policy if exists "messages_update_read" on public.messages;
create policy "messages_update_read"
  on public.messages for update
  using (
    public.is_conversation_participant(conversation_id)
    and sender_id <> auth.uid()
  )
  with check (
    public.is_conversation_participant(conversation_id)
    and sender_id <> auth.uid()
  );

-- =========================================================
-- Realtime — ajout à la publication supabase_realtime
-- (websockets côté client)
-- =========================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.messages';
    exception
      when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.conversations';
    exception
      when duplicate_object then null;
    end;
  end if;
end$$;

-- Replica identity full : on reçoit les rows complets dans les events realtime.
alter table public.messages replica identity full;
alter table public.conversations replica identity full;
