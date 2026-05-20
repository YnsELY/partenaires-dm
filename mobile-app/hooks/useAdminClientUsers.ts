import { useCallback, useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

type Filter = {
  // - 'unassigned' : profils client.role='client' et client_id IS NULL
  // - clientId (uuid) : profils déjà rattachés à cette entreprise
  // - 'all' : tous les profils client
  scope?: 'unassigned' | 'all' | string;
};

export function useAdminClientUsers(filter: Filter = { scope: 'unassigned' }) {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const scope = filter.scope ?? 'unassigned';

  const refresh = useCallback(async () => {
    if (profile?.role !== 'admin') return;
    setLoading(true);
    setError(null);

    let query = supabase
      .from('profiles')
      .select('*')
      .eq('role', 'client')
      .order('full_name', { ascending: true });

    if (scope === 'unassigned') {
      query = query.is('client_id', null);
    } else if (scope !== 'all') {
      query = query.eq('client_id', scope);
    }

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setUsers((data ?? []) as Profile[]);
    setLoading(false);
  }, [profile?.role, scope]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { users, loading, error, refresh };
}
