import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type AdminStats = {
  activeSites: number;
  deployedAgents: number;
  monthInterventions: number;
  pendingValidation: number;
  openIncidents: number;
};

const initial: AdminStats = {
  activeSites: 0,
  deployedAgents: 0,
  monthInterventions: 0,
  pendingValidation: 0,
  openIncidents: 0,
};

export function useAdminStats() {
  const { profile } = useAuth();
  const [stats, setStats] = useState<AdminStats>(initial);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (profile?.role !== 'admin') return;
    setLoading(true);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      sitesRes,
      agentsRes,
      monthRes,
      pendingRes,
      incidentsRes,
    ] = await Promise.all([
      supabase.from('sites').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'agent'),
      supabase
        .from('interventions')
        .select('id', { count: 'exact', head: true })
        .gte('scheduled_at', startOfMonth.toISOString()),
      supabase
        .from('interventions')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_validation'),
      supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'open'),
    ]);

    setStats({
      activeSites: sitesRes.count ?? 0,
      deployedAgents: agentsRes.count ?? 0,
      monthInterventions: monthRes.count ?? 0,
      pendingValidation: pendingRes.count ?? 0,
      openIncidents: incidentsRes.count ?? 0,
    });
    setLoading(false);
  }, [profile?.role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, refresh };
}
