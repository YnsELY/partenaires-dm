import { useCallback, useEffect, useState } from 'react';
import { supabase, Media, Site } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export type ClientMedia = Media & {
  intervention: {
    id: string;
    scheduled_at: string;
    site: Pick<Site, 'id' | 'name'> | null;
  } | null;
};

type Filters = {
  interventionId?: string; // si fourni, filtre sur cette intervention
  siteId?: string; // si fourni, filtre sur ce site
};

export function useClientPhotos(filters: Filters = {}) {
  const { profile } = useAuth();
  const [items, setItems] = useState<ClientMedia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (profile?.role !== 'client') return;
    setLoading(true);
    setError(null);

    // Pas de filtre `is_validated` côté requête : la policy RLS
    // `media_select_for_client` (cf. migration 0019) se charge de ne renvoyer
    // que les photos des interventions validées sur les sites du client.
    // Ajouter le filtre ici cachait toutes les photos quand le flag n'était
    // pas posé sur les lignes (race / vieux uploads / bug de l'edge function).
    let query = supabase
      .from('media')
      .select(
        `
        id, intervention_id, url, type, zone, is_validated, taken_at, expires_at, created_at,
        intervention:interventions ( id, scheduled_at, site_id, site:sites ( id, name ) )
        `
      )
      .order('taken_at', { ascending: true });

    if (filters.interventionId) {
      query = query.eq('intervention_id', filters.interventionId);
    }

    const { data, error: err } = await query;
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    let rows = (data ?? []) as unknown as ClientMedia[];
    if (filters.siteId) {
      rows = rows.filter((m: any) => m.intervention?.site_id === filters.siteId);
    }
    setItems(rows);
    setLoading(false);
  }, [profile?.role, filters.interventionId, filters.siteId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, loading, error, refresh };
}
