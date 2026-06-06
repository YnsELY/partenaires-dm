import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, Intervention, Site } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { syncAgentInterventionReminders } from '../lib/notifications';

export type InterventionWithSite = Intervention & {
  site: Pick<Site, 'id' | 'name' | 'address' | 'service_type' | 'photo_url' | 'description'> | null;
};

type State = {
  today: InterventionWithSite[];
  upcoming: InterventionWithSite[];
  past: InterventionWithSite[];
  inProgress: InterventionWithSite[];
  loading: boolean;
  error: string | null;
};

const initial: State = {
  today: [],
  upcoming: [],
  past: [],
  inProgress: [],
  loading: true,
  error: null,
};

function startOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.toISOString();
}
function endOfDayISO(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.toISOString();
}

export function useAgentInterventions() {
  const { session } = useAuth();
  const [state, setState] = useState<State>(initial);

  const refresh = useCallback(async () => {
    if (!session?.user?.id) {
      setState({ ...initial, loading: false });
      return;
    }

    setState((s) => ({ ...s, loading: true, error: null }));

    // Pas de filtre agent_id : la RLS renvoie toutes les interventions
    // accessibles (agent principal, équipe, ou rattaché via intervention_agents).
    const { data, error } = await supabase
      .from('interventions')
      .select(
        `
        id, site_id, agent_id, team_id, scheduled_at, started_at, submitted_at,
        validated_at, status, agent_notes, admin_summary, global_result, pdf_url, created_at,
        site:sites ( id, name, address, service_type, photo_url, description )
      `
      )
      .order('scheduled_at', { ascending: true });

    if (error) {
      setState({ ...initial, loading: false, error: error.message });
      return;
    }

    const rows = (data ?? []) as unknown as InterventionWithSite[];
    const today: InterventionWithSite[] = [];
    const upcoming: InterventionWithSite[] = [];
    const past: InterventionWithSite[] = [];
    const inProgress: InterventionWithSite[] = [];

    const dayStart = startOfDayISO();
    const dayEnd = endOfDayISO();

    const todayIds = new Set<string>();
    for (const r of rows) {
      if (r.status === 'in_progress') inProgress.push(r);

      if (r.scheduled_at >= dayStart && r.scheduled_at <= dayEnd) {
        today.push(r);
        todayIds.add(r.id);
      } else if (r.scheduled_at > dayEnd && r.status === 'scheduled') {
        upcoming.push(r);
      } else if (r.status === 'validated' || r.status === 'rejected' || r.status === 'pending_validation') {
        past.push(r);
      }
    }

    // Une intervention `in_progress` ou `pending_validation` planifiée un
    // jour passé doit rester visible côté agent : on l'ajoute en tête de
    // today pour qu'elle apparaisse avec son badge.
    for (const r of rows) {
      if (
        (r.status === 'in_progress' || r.status === 'pending_validation') &&
        !todayIds.has(r.id)
      ) {
        today.unshift(r);
        todayIds.add(r.id);
      }
    }

    syncAgentInterventionReminders(rows).catch((e) => {
      console.warn('[notifications] reminder sync failed', e?.message ?? e);
    });
    setState({ today, upcoming, past, inProgress, loading: false, error: null });
  }, [session?.user?.id]);

  // Garde la dernière référence de refresh dans une ref pour que le useEffect
  // realtime ne se relance pas à chaque nouveau callback.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Realtime : refresh à chaque change pertinent. Comme un agent peut être
  // rattaché à une intervention sans en être l'agent principal (multi-agents),
  // on ne peut pas filtrer côté serveur sur agent_id ; on écoute donc toutes
  // les interventions et on relit via la RLS (le payload n'est pas utilisé). On
  // écoute aussi intervention_agents pour les ajouts/retraits de cet agent.
  // Nom de canal unique par montage pour éviter qu'un canal déjà subscribe()
  // soit récupéré par supabase.channel() (ce qui casse l'ajout de listener).
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;

    const channelName = `interventions-agent-${userId}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'interventions',
        },
        () => {
          refreshRef.current();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'intervention_agents',
          filter: `agent_id=eq.${userId}`,
        },
        () => {
          refreshRef.current();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  return { ...state, refresh };
}
