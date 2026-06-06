import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, Intervention, Site } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type ClientIntervention = Intervention & {
  site: Pick<Site, 'id' | 'name' | 'address' | 'service_type' | 'description' | 'photo_url'> | null;
};

type Filters = {
  status?: ClientIntervention['status'] | ClientIntervention['status'][];
  limit?: number;
  recent?: boolean; // ordre desc par scheduled_at
};

export function useClientInterventions(filters: Filters = {}) {
  const { profile } = useAuth();
  const [items, setItems] = useState<ClientIntervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filtersKey = JSON.stringify({
    status: filters.status,
    limit: filters.limit,
    recent: filters.recent,
  });

  const refresh = useCallback(async () => {
    if (profile?.role !== 'client') return;
    setLoading(true);
    setError(null);

    let query = supabase
      .from('interventions')
      .select(
        `
        id, site_id, agent_id, team_id, scheduled_at, started_at, submitted_at,
        validated_at, status, agent_notes, admin_summary, admin_details, global_result,
        pdf_url, created_at,
        site:sites ( id, name, address, service_type, description, photo_url )
        `
      )
      .order('scheduled_at', { ascending: !filters.recent });

    if (filters.status) {
      if (Array.isArray(filters.status)) query = query.in('status', filters.status);
      else query = query.eq('status', filters.status);
    }
    if (filters.limit) query = query.limit(filters.limit);

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setItems((data ?? []) as unknown as ClientIntervention[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, filtersKey]);

  // Realtime sur interventions (nouvelles validations, etc.)
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (profile?.role !== 'client') return;
    const channelName = `client-interventions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'interventions' },
        () => refreshRef.current()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.role]);

  return { items, loading, error, refresh };
}
