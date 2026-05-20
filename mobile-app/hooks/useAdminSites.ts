import { useCallback, useEffect, useState } from 'react';
import { supabase, Site, Client } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type SiteWithClient = Site & {
  client: Pick<Client, 'id' | 'name'> | null;
};

export function useAdminSites(clientId?: string) {
  const { profile } = useAuth();
  const [sites, setSites] = useState<SiteWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (profile?.role !== 'admin') return;
    setLoading(true);
    setError(null);

    let query = supabase
      .from('sites')
      .select('*, client:clients ( id, name )')
      .order('created_at', { ascending: false });

    if (clientId) query = query.eq('client_id', clientId);

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    setSites((data ?? []) as unknown as SiteWithClient[]);
    setLoading(false);
  }, [profile?.role, clientId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sites, loading, error, refresh };
}
