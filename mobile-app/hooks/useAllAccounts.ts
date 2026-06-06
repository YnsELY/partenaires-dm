import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

/**
 * Liste tous les comptes utilisateurs (profiles, tous rôles confondus) pour
 * l'écran d'administration des comptes. Réservé à l'admin (RLS
 * `profiles_select_admin`).
 */
export function useAllAccounts() {
  const { profile } = useAuth();
  const [accounts, setAccounts] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (profile?.role !== 'admin') return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('profiles')
      .select('*')
      .order('role', { ascending: true })
      .order('full_name', { ascending: true });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setAccounts((data ?? []) as Profile[]);
    setLoading(false);
  }, [profile?.role]);

  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime : la liste se met à jour quand un compte est créé/supprimé.
  useEffect(() => {
    if (profile?.role !== 'admin') return;
    const channelName = `admin-accounts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        () => refreshRef.current()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.role]);

  return { accounts, loading, error, refresh };
}
