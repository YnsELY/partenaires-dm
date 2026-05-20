import { useCallback, useEffect, useState } from 'react';
import { supabase, Site, Client } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type ClientSiteWithCompany = Site & {
  client: Pick<Client, 'id' | 'name' | 'logo_url'> | null;
};

export function useClientSites() {
  const { profile } = useAuth();
  const [sites, setSites] = useState<ClientSiteWithCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (profile?.role !== 'client') return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('sites')
      .select('*, client:clients ( id, name, logo_url )')
      .order('name', { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    setSites((data ?? []) as unknown as ClientSiteWithCompany[]);
    setLoading(false);
  }, [profile?.role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sites, loading, error, refresh };
}
