import { useCallback, useEffect, useState } from 'react';
import { supabase, Incident, IncidentStatus, Site } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ACTIVE_AGENT_STATUSES } from '../lib/incidentStatus';

export type AgentIncident = Incident & {
  site: Pick<Site, 'id' | 'name' | 'address'> | null;
};

type Filters = {
  /**
   * Statut(s) à filtrer. Par défaut : seulement les "actifs"
   * (assigned, in_progress, pending_validation) pour que la home agent
   * n'affiche que les signalements à traiter. Passer `null` pour tout récupérer.
   */
  status?: IncidentStatus | IncidentStatus[] | null;
};

/**
 * Liste les signalements assignés à l'agent courant (incidents.assigned_agent_id).
 * RLS : la policy `incidents_select_assigned_agent` (migration 0012) autorise
 * la lecture côté agent.
 */
export function useAgentIncidents(filters: Filters = {}) {
  const { session, profile } = useAuth();
  const userId = session?.user?.id ?? null;
  const role = profile?.role ?? null;

  const [items, setItems] = useState<AgentIncident[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const effectiveStatus: IncidentStatus[] | null =
    filters.status === null
      ? null
      : filters.status === undefined
      ? ACTIVE_AGENT_STATUSES
      : Array.isArray(filters.status)
      ? filters.status
      : [filters.status];

  const statusKey = effectiveStatus ? effectiveStatus.join(',') : 'all';

  const refresh = useCallback(async () => {
    if (!userId || role !== 'agent') return;
    setError(null);

    let query = supabase
      .from('incidents')
      .select(
        `
        id, intervention_id, site_id, reported_by, reporter_role, zone, description,
        photo_url, status, admin_notes, assigned_agent_id, agent_resolution_notes,
        closed_at, created_at,
        site:sites ( id, name, address )
        `
      )
      .eq('assigned_agent_id', userId)
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
    setItems((data ?? []) as unknown as AgentIncident[]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role, statusKey]);

  useEffect(() => {
    if (!userId || role !== 'agent') return;
    setLoading(true);
    refresh();
  }, [userId, role, refresh]);

  return { items, loading, error, refresh };
}
