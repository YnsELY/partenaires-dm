import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, Client } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type ClientWithSiteCount = Client & {
  site_count: number;
};

export function useAdminClients() {
  const { profile } = useAuth();
  const [clients, setClients] = useState<ClientWithSiteCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (profile?.role !== 'admin') return;
    setLoading(true);
    setError(null);

    const [clientsRes, sitesRes] = await Promise.all([
      supabase.from('clients').select('*').order('created_at', { ascending: false }),
      supabase.from('sites').select('id, client_id, is_active'),
    ]);

    if (clientsRes.error) {
      setError(clientsRes.error.message);
      setLoading(false);
      return;
    }

    const counts = new Map<string, number>();
    for (const s of sitesRes.data ?? []) {
      if (!s.is_active) continue;
      counts.set(s.client_id, (counts.get(s.client_id) ?? 0) + 1);
    }

    setClients(
      ((clientsRes.data ?? []) as Client[]).map((c) => ({
        ...c,
        site_count: counts.get(c.id) ?? 0,
      }))
    );
    setLoading(false);
  }, [profile?.role]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime : la liste se met à jour automatiquement quand un client est créé
  // depuis n'importe quel autre écran (formulaire client-new par exemple).
  useEffect(() => {
    if (profile?.role !== 'admin') return;
    const channelName = `admin-clients-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'clients' },
        () => refreshRef.current()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sites' },
        () => refreshRef.current()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.role]);

  return { clients, loading, error, refresh };
}
