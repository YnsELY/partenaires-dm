-- Les Partenaires DM — Étend la messagerie aux clients
--
-- La table conversations supportait uniquement admin <-> agent. On ajoute
-- un canal admin <-> client en introduisant `client_id` (nullable) et en
-- rendant `agent_id` nullable, avec une contrainte XOR qui garantit qu'une
-- conversation a soit un agent soit un client comme partenaire.

-- =========================================================
-- 1) Schéma
-- =========================================================
alter table public.conversations
  add column if not exists client_id uuid references public.profiles(id) on delete cascade;

alter table public.conversations
  alter column agent_id drop not null;

-- Drop ancien unique (admin_id, agent_id) qui ne tolère pas les nulls
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'conversations_admin_id_agent_id_key'
  ) then
    execute 'alter table public.conversations drop constraint conversations_admin_id_agent_id_key';
  end if;
end$$;

-- XOR : exactement un de (agent_id, client_id) est non null
alter table public.conversations
  drop constraint if exists conversations_partner_xor;
alter table public.conversations
  add constraint conversations_partner_xor
  check ((agent_id is null) <> (client_id is null));

-- Unicité par couple (admin, partenaire)
create unique index if not exists conversations_admin_agent_uniq
  on public.conversations (admin_id, agent_id)
  where agent_id is not null;

create unique index if not exists conversations_admin_client_uniq
  on public.conversations (admin_id, client_id)
  where client_id is not null;

create index if not exists conversations_client_idx on public.conversations (client_id);

-- =========================================================
-- 2) Helpers : participant à une conversation (étendu au client)
-- =========================================================
create or replace function public.is_conversation_participant(conv_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = conv_id
      and (
        c.admin_id = auth.uid()
        or c.agent_id = auth.uid()
        or c.client_id = auth.uid()
      )
  );
$$;

-- =========================================================
-- 3) RLS — conversations : étendues au client
-- =========================================================
drop policy if exists "conversations_select_participant" on public.conversations;
create policy "conversations_select_participant"
  on public.conversations for select
  using (
    admin_id = auth.uid()
    or agent_id = auth.uid()
    or client_id = auth.uid()
  );

-- Un admin peut créer une conversation avec un agent OU un client
drop policy if exists "conversations_insert_admin" on public.conversations;
create policy "conversations_insert_admin"
  on public.conversations for insert
  with check (
    public.is_admin()
    and admin_id = auth.uid()
    and (
      (
        agent_id is not null
        and exists (select 1 from public.profiles p where p.id = agent_id and p.role = 'agent')
      )
      or (
        client_id is not null
        and exists (select 1 from public.profiles p where p.id = client_id and p.role = 'client')
      )
    )
  );

-- Un client peut initier une conversation avec un admin
drop policy if exists "conversations_insert_client" on public.conversations;
create policy "conversations_insert_client"
  on public.conversations for insert
  with check (
    client_id = auth.uid()
    and agent_id is null
    and exists (
      select 1 from public.profiles p
      where p.id = admin_id and p.role = 'admin'
    )
  );

-- =========================================================
-- 4) RPC — Auto-création de la conversation client <-> admin
--
-- Le client appelle cette fonction au montage de son onglet Messages.
-- Si une conversation existe déjà avec n'importe quel admin, on la retourne.
-- Sinon on en crée une avec le premier admin disponible.
-- SECURITY DEFINER pour bypasser les RLS d'INSERT (le client peut ne pas
-- avoir la permission de lire la table profiles pour repérer un admin).
-- =========================================================
create or replace function public.ensure_client_conversation()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := auth.uid();
  v_role text;
  v_conv_id uuid;
  v_admin_id uuid;
begin
  if v_client is null then
    raise exception 'Non authentifié';
  end if;

  select role into v_role from public.profiles where id = v_client;
  if v_role is distinct from 'client' then
    raise exception 'Seul un client peut appeler cette fonction';
  end if;

  -- Conversation existante pour ce client
  select id into v_conv_id
  from public.conversations
  where client_id = v_client
  order by created_at asc
  limit 1;

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  -- Sinon, crée avec le premier admin trouvé
  select id into v_admin_id
  from public.profiles
  where role = 'admin'
  order by created_at asc
  limit 1;

  if v_admin_id is null then
    raise exception 'Aucun administrateur disponible';
  end if;

  insert into public.conversations (admin_id, client_id)
  values (v_admin_id, v_client)
  returning id into v_conv_id;

  return v_conv_id;
end;
$$;

revoke all on function public.ensure_client_conversation() from public;
grant execute on function public.ensure_client_conversation() to authenticated;
