import { useCallback, useEffect, useState } from 'react';
import { supabase, Team, Profile } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type TeamWithMembers = Team & {
  members: Pick<Profile, 'id' | 'full_name'>[];
};

export function useAdminTeams() {
  const { profile } = useAuth();
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (profile?.role !== 'admin') return;
    setLoading(true);
    setError(null);

    const { data, error: err } = await supabase
      .from('teams')
      .select(
        `
        id, name, zone, is_active, created_at,
        team_members ( agent:profiles ( id, full_name ) )
        `
      )
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const flat = (data ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      zone: t.zone,
      is_active: t.is_active,
      created_at: t.created_at,
      members: (t.team_members ?? [])
        .map((tm: any) => tm.agent)
        .filter(Boolean) as Pick<Profile, 'id' | 'full_name'>[],
    })) as TeamWithMembers[];

    setTeams(flat);
    setLoading(false);
  }, [profile?.role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { teams, loading, error, refresh };
}
