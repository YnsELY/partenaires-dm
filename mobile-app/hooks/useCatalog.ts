import { useCallback, useEffect, useState } from 'react';
import { supabase, CatalogCategory, CatalogService } from '../lib/supabase';

export type CategoryWithServices = CatalogCategory & {
  services: CatalogService[];
};

/**
 * Charge le catalogue des prestations de nettoyage (catégories + services)
 * en une seule passe. Pas de realtime : le catalogue est statique, géré
 * par migration côté Supabase.
 */
export function useCatalog() {
  const [categories, setCategories] = useState<CategoryWithServices[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);

    const [catRes, svcRes] = await Promise.all([
      supabase
        .from('catalog_categories')
        .select('*')
        .order('order_index', { ascending: true }),
      supabase
        .from('catalog_services')
        .select('*')
        .order('order_index', { ascending: true }),
    ]);

    if (catRes.error) {
      setError(catRes.error.message);
      setLoading(false);
      return;
    }
    if (svcRes.error) {
      setError(svcRes.error.message);
      setLoading(false);
      return;
    }

    const cats = (catRes.data ?? []) as CatalogCategory[];
    const svcs = (svcRes.data ?? []) as CatalogService[];

    const byCategory = new Map<string, CatalogService[]>();
    for (const s of svcs) {
      const list = byCategory.get(s.category_id) ?? [];
      list.push(s);
      byCategory.set(s.category_id, list);
    }

    setCategories(
      cats.map((c) => ({
        ...c,
        services: byCategory.get(c.id) ?? [],
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { categories, loading, error, refresh };
}

/**
 * Helper d'affichage : transforme une fréquence + count en libellé court
 * pour les badges (ex: "H · 1×", "M · 4×", "Annuel", "Sur demande").
 */
export function formatFrequencyBadge(
  frequency: CatalogService['frequency'] | null,
  count: number | null
): string | null {
  if (!frequency) return null;
  const n = count ?? 1;
  switch (frequency) {
    case 'H':
      return `H · ${n}×`;
    case 'M':
      return `M · ${n}×`;
    case 'A':
      return `A · ${n}×`;
    case 'OnDemand':
      return 'Sur demande';
    default:
      return null;
  }
}
