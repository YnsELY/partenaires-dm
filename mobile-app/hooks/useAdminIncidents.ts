import { useCallback, useEffect, useState } from 'react';
import { supabase, Incident, Site, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type AdminIncident = Incident & {
  site: Pick<Site, 'id' | 'name'> | null;
  reporter: Pick<Profile, 'id' | 'full_name'> | null;
};

type Filters = {
  status?: AdminIncident['status'] | AdminIncident['status'][];
  limit?: number;
};

export function useAdminIncidents(filters: Filters = {}) {
  const { profile } = useAuth();
  const [items, setItems] = useState<AdminIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const filtersKey = JSON.stringify({ status: filters.status, limit: filters.limit });

  const refresh = useCallback(async () => {
    if (profile?.role !== 'admin') return;
    setLoading(true);
    setError(null);

    let query = supabase
      .from('incidents')
      .select(
        `
        id, intervention_id, site_id, reported_by, reporter_role, zone, description,
        photo_url, status, admin_notes, created_at,
        site:sites ( id, name ),
        reporter:profiles!incidents_reported_by_fkey ( id, full_name )
        `
      )
      .order('created_at', { ascending: false });

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

    setItems((data ?? []) as unknown as AdminIncident[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.role, filtersKey]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, error, refresh };
}
