import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, Intervention, Site, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type AdminIntervention = Intervention & {
  site: Pick<Site, 'id' | 'name' | 'address' | 'service_type'> | null;
  agent: Pick<Profile, 'id' | 'full_name' | 'email'> | null;
};

type Status = AdminIntervention['status'];

type Filters = {
  date?: Date; // jour précis
  from?: Date;
  to?: Date;
  status?: Status | Status[];
  limit?: number;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function useAdminInterventions(filters: Filters = {}) {
  const { profile } = useAuth();
  const [items, setItems] = useState<AdminIntervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sérialise les filtres pour la dépendance du useCallback
  const filtersKey = JSON.stringify({
    date: filters.date?.toISOString().slice(0, 10),
    from: filters.from?.toISOString(),
    to: filters.to?.toISOString(),
    status: filters.status,
    limit: filters.limit,
  });

  const refresh = useCallback(async () => {
    if (profile?.role !== 'admin') return;
    setLoading(true);
    setError(null);

    let query = supabase
      .from('interventions')
      .select(
        `
        id, site_id, agent_id, team_id, scheduled_at, started_at, submitted_at,
        validated_at, status, agent_notes, admin_summary, global_result, pdf_url, created_at,
        site:sites ( id, name, address, service_type ),
        agent:profiles!interventions_agent_id_fkey ( id, full_name, email )
        `
      )
      .order('scheduled_at', { ascending: true });

    if (filters.date) {
      query = query
        .gte('scheduled_at', startOfDay(filters.date).toISOString())
        .lte('scheduled_at', endOfDay(filters.date).toISOString());
    } else {
      if (filters.from) query = query.gte('scheduled_at', filters.from.toISOString());
      if (filters.to) query = query.lte('scheduled_at', filters.to.toISOString());
    }

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

    setItems((data ?? []) as unknown as AdminIntervention[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, filtersKey]);

  // Realtime sur la table interventions
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (profile?.role !== 'admin') return;
    const channelName = `admin-interventions-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'interventions' }, () => {
        refreshRef.current();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.role]);

  return { items, loading, error, refresh };
}
