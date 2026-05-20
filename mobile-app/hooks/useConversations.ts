import { useCallback, useEffect, useState } from 'react';
import { supabase, Conversation, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type ConversationWithPartner = Conversation & {
  partner: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role'> | null;
  unread_count: number;
};

/** Renvoie l'id du participant "autre" pour une conversation donnée selon le rôle courant. */
function partnerIdOf(c: Conversation, role: string | null, userId: string | null): string | null {
  if (role === 'admin') return c.agent_id ?? c.client_id ?? null;
  if (role === 'agent') return c.admin_id;
  if (role === 'client') return c.admin_id;
  return null;
}

/**
 * Liste des conversations de l'utilisateur courant (admin, agent ou client),
 * triées par dernier message. S'abonne en realtime aux nouveaux messages
 * et aux changements de last_message_at pour rafraîchir le bandeau et le
 * compteur de messages non lus.
 */
export function useConversations() {
  const { session, profile } = useAuth();
  const userId = session?.user?.id ?? null;
  const role = profile?.role ?? null;

  const [conversations, setConversations] = useState<ConversationWithPartner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !role) return;
    setError(null);

    let query = supabase
      .from('conversations')
      .select('*')
      .order('last_message_at', { ascending: false });

    if (role === 'admin') query = query.eq('admin_id', userId);
    else if (role === 'agent') query = query.eq('agent_id', userId);
    else if (role === 'client') query = query.eq('client_id', userId);

    const { data: convs, error: convErr } = await query;

    if (convErr) {
      setError(convErr.message);
      setLoading(false);
      return;
    }

    const list = (convs ?? []) as Conversation[];
    if (list.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const partnerIds = Array.from(
      new Set(list.map((c) => partnerIdOf(c, role, userId)).filter((x): x is string => !!x))
    );
    const { data: profilesData, error: profErr } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role')
      .in('id', partnerIds);

    if (profErr) {
      setError(profErr.message);
      setLoading(false);
      return;
    }

    const profileMap = new Map<string, ConversationWithPartner['partner']>();
    (profilesData ?? []).forEach((p: any) => profileMap.set(p.id, p));

    // Compteur de messages non lus (envoyés par l'autre, non lus par moi)
    const convIds = list.map((c) => c.id);
    const { data: unreadRows } = await supabase
      .from('messages')
      .select('conversation_id')
      .in('conversation_id', convIds)
      .neq('sender_id', userId)
      .is('read_at', null);

    const unreadMap = new Map<string, number>();
    (unreadRows ?? []).forEach((r: any) => {
      unreadMap.set(r.conversation_id, (unreadMap.get(r.conversation_id) ?? 0) + 1);
    });

    setConversations(
      list.map((c) => {
        const pid = partnerIdOf(c, role, userId);
        return {
          ...c,
          partner: pid ? profileMap.get(pid) ?? null : null,
          unread_count: unreadMap.get(c.id) ?? 0,
        };
      })
    );
    setLoading(false);
  }, [userId, role]);

  useEffect(() => {
    if (!userId || !role) return;
    setLoading(true);
    refresh();
  }, [userId, role, refresh]);

  // Realtime — on écoute les modifs sur conversations et les nouveaux messages
  // qui me concernent pour rafraîchir la liste.
  useEffect(() => {
    if (!userId || !role) return;

    // Le filtre realtime cible la colonne où on est référencé selon le rôle.
    const ownColumn =
      role === 'admin' ? 'admin_id' : role === 'agent' ? 'agent_id' : 'client_id';

    const channelName = `conversations-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversations',
          filter: `${ownColumn}=eq.${userId}`,
        },
        () => {
          refresh();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          // On rafraîchit pour mettre à jour preview + compteur non-lus.
          refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, role, refresh]);

  /**
   * Crée (ou retrouve) la conversation entre l'admin courant et un agent
   * donné. À appeler uniquement côté admin.
   */
  const openConversationWith = useCallback(
    async (agentId: string): Promise<string | null> => {
      if (!userId || role !== 'admin') return null;

      // Cherche d'abord une conversation existante
      const { data: existing, error: findErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('admin_id', userId)
        .eq('agent_id', agentId)
        .maybeSingle();

      if (findErr) {
        setError(findErr.message);
        return null;
      }
      if (existing?.id) return existing.id;

      const { data: created, error: insErr } = await supabase
        .from('conversations')
        .insert({ admin_id: userId, agent_id: agentId })
        .select('id')
        .single();

      if (insErr) {
        setError(insErr.message);
        return null;
      }
      await refresh();
      return created.id;
    },
    [userId, role, refresh]
  );

  return { conversations, loading, error, refresh, openConversationWith };
}
