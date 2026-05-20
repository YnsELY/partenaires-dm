import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, Incident, IncidentStatus, Site } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ACTIVE_CLIENT_STATUSES } from '../lib/incidentStatus';

export type ClientIncident = Incident & {
  site: Pick<Site, 'id' | 'name'> | null;
};

type Filters = {
  /**
   * Statuts à filtrer. Par défaut : tous les statuts actifs côté client
   * (open, assigned, in_progress, pending_validation, resolved) — on cache
   * les `closed`. Passer `null` pour récupérer tous les statuts.
   */
  status?: IncidentStatus | IncidentStatus[] | null;
};

/**
 * Liste les signalements du client courant. Realtime activé sur la table
 * incidents pour qu'un changement de statut côté admin/agent rafraîchisse
 * automatiquement la liste côté client.
 */
export function useClientIncidents(filters: Filters = {}) {
  const { session, profile } = useAuth();
  const userId = session?.user?.id ?? null;
  const role = profile?.role ?? null;

  const [items, setItems] = useState<ClientIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveStatus: IncidentStatus[] | null =
    filters.status === null
      ? null
      : filters.status === undefined
      ? ACTIVE_CLIENT_STATUSES
      : Array.isArray(filters.status)
      ? filters.status
      : [filters.status];

  const statusKey = effectiveStatus ? effectiveStatus.join(',') : 'all';

  const refresh = useCallback(async () => {
    if (!userId || role !== 'client') return;
    setError(null);

    let query = supabase
      .from('incidents')
      .select(
        `
        id, intervention_id, site_id, reported_by, reporter_role, zone, description,
        photo_url, status, admin_notes, assigned_agent_id, agent_resolution_notes,
        closed_at, created_at,
        site:sites ( id, name )
        `
      )
      .eq('reported_by', userId)
      .eq('reporter_role', 'client')
      .order('created_at', { ascending: false });

    if (effectiveStatus && effectiveStatus.length > 0) {
      query = query.in('status', effectiveStatus);
    }

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setItems((data ?? []) as unknown as ClientIncident[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role, statusKey]);

  useEffect(() => {
    if (!userId || role !== 'client') return;
    setLoading(true);
    refresh();
  }, [userId, role, refresh]);

  // Realtime : rafraîchit dès qu'un incident du client change
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!userId || role !== 'client') return;
    // Nom unique par mount pour éviter "cannot add callbacks after subscribe"
    // si le hook est ré-instancié (fast refresh, double rendu, etc.).
    const channelName = `client-incidents-${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'incidents',
          filter: `reported_by=eq.${userId}`,
        },
        () => refreshRef.current()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, role]);

  return { items, loading, error, refresh };
}
