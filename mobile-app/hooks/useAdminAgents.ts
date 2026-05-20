import { useCallback, useEffect, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function useAdminAgents() {
  const { profile } = useAuth();
  const [agents, setAgents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (profile?.role !== 'admin') return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'agent')
      .order('full_name', { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    setAgents((data ?? []) as Profile[]);
    setLoading(false);
  }, [profile?.role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { agents, loading, error, refresh };
}
