import { useCallback, useEffect, useState } from 'react';
import { supabase, Evaluation } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { notifyEvent } from '../lib/notifications';

type State = {
  evaluation: Evaluation | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
};

export function useClientEvaluation(interventionId: string | null) {
  const { session, profile } = useAuth();
  const [state, setState] = useState<State>({
    evaluation: null,
    loading: !!interventionId,
    saving: false,
    error: null,
  });

  const refresh = useCallback(async () => {
    if (!interventionId || !session?.user?.id || profile?.role !== 'client') {
      setState({ evaluation: null, loading: false, saving: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));

    const { data, error } = await supabase
      .from('evaluations')
      .select('*')
      .eq('intervention_id', interventionId)
      .eq('client_profile_id', session.user.id)
      .maybeSingle();

    if (error) {
      setState({ evaluation: null, loading: false, saving: false, error: error.message });
      return;
    }
    setState({
      evaluation: (data as Evaluation) ?? null,
      loading: false,
      saving: false,
      error: null,
    });
  }, [interventionId, session?.user?.id, profile?.role]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (input: {
      rating: number | null;
      satisfaction: 'satisfied' | 'to_improve' | null;
      comment: string;
    }) => {
      if (!interventionId || !session?.user?.id) return;
      setState((s) => ({ ...s, saving: true, error: null }));

      const payload = {
        intervention_id: interventionId,
        client_profile_id: session.user.id,
        rating: input.rating,
        satisfaction: input.satisfaction,
        comment: input.comment.trim() || null,
      };

      const { data, error } = await supabase
        .from('evaluations')
        .upsert(payload, { onConflict: 'intervention_id,client_profile_id' })
        .select()
        .maybeSingle();

      if (error) {
        setState((s) => ({ ...s, saving: false, error: error.message }));
        throw new Error(error.message);
      }
      setState({
        evaluation: (data as Evaluation) ?? null,
        loading: false,
        saving: false,
        error: null,
      });
      if ((data as Evaluation | null)?.id) {
        notifyEvent('evaluation_submitted', (data as Evaluation).id);
      }
    },
    [interventionId, session?.user?.id]
  );

  return { ...state, refresh, save };
}
