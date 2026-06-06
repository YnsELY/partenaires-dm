import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, Message } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { notifyEvent } from '../lib/notifications';

/**
 * Hook de messagerie temps réel pour une conversation donnée.
 * - Charge l'historique au montage.
 * - S'abonne via Supabase Realtime (websocket) aux nouveaux messages
 *   pour mettre à jour la liste sans rechargement.
 * - Marque comme lus les messages reçus.
 */
export function useMessages(conversationId: string | null) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seenIdsRef = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!conversationId) return;
    setError(null);

    const { data, error: err } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const list = (data ?? []) as Message[];
    seenIdsRef.current = new Set(list.map((m) => m.id));
    setMessages(list);
    setLoading(false);
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    refresh();
  }, [conversationId, refresh]);

  // Marque les messages reçus comme lus (read_at = now)
  const markAsRead = useCallback(async () => {
    if (!conversationId || !userId) return;
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .neq('sender_id', userId)
      .is('read_at', null);
  }, [conversationId, userId]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      markAsRead();
    }
  }, [loading, messages.length, markAsRead]);

  // Subscription realtime
  useEffect(() => {
    if (!conversationId) return;

    const channelName = `messages-${conversationId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          if (seenIdsRef.current.has(msg.id)) return;
          seenIdsRef.current.add(msg.id);
          setMessages((prev) => [...prev, msg]);
          // Si je ne suis pas l'expéditeur, je peux le marquer comme lu.
          if (msg.sender_id !== userId) {
            supabase
              .from('messages')
              .update({ read_at: new Date().toISOString() })
              .eq('id', msg.id)
              .then(() => undefined);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || !conversationId || !userId) return;
      setSending(true);
      setError(null);

      // Insertion optimiste — on attend la confirmation realtime/insert
      // pour garder l'id réel, donc on ne touche pas à `messages` ici.
      const { data, error: err } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: userId,
          body: trimmed,
        })
        .select('id')
        .maybeSingle();

      if (err) {
        setError(err.message);
      } else if (data?.id) {
        notifyEvent('message_created', data.id);
      }
      setSending(false);
    },
    [conversationId, userId]
  );

  return { messages, loading, sending, error, send, refresh };
}
