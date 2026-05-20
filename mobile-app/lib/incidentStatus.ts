import type { BadgeVariant } from '../components/Badge';
import type { IncidentStatus } from './supabase';

type Role = 'client' | 'agent' | 'admin';

type Display = { label: string; variant: BadgeVariant };

const LABELS: Record<Role, Partial<Record<IncidentStatus, Display>>> = {
  client: {
    open: { label: 'Envoyé', variant: 'warning' },
    assigned: { label: 'Prochainement traité', variant: 'primary' },
    in_progress: { label: 'Traitement en cours', variant: 'primary' },
    pending_validation: { label: 'Traitement en cours', variant: 'primary' },
    resolved: { label: 'Terminé — à confirmer', variant: 'success' },
    closed: { label: 'Clôturé', variant: 'neutral' },
  },
  agent: {
    assigned: { label: 'À démarrer', variant: 'warning' },
    in_progress: { label: 'En cours', variant: 'primary' },
    pending_validation: { label: 'En attente admin', variant: 'neutral' },
    resolved: { label: 'Terminé', variant: 'success' },
    closed: { label: 'Clôturé', variant: 'neutral' },
  },
  admin: {
    open: { label: 'Nouveau', variant: 'error' },
    assigned: { label: 'Assigné', variant: 'warning' },
    in_progress: { label: 'En cours agent', variant: 'primary' },
    pending_validation: { label: 'À valider', variant: 'warning' },
    resolved: { label: 'Validé', variant: 'success' },
    closed: { label: 'Clôturé client', variant: 'neutral' },
  },
};

/** Statuts considérés "actifs" (non-finis) — utiles pour filtrer les listes. */
export const ACTIVE_AGENT_STATUSES: IncidentStatus[] = [
  'assigned',
  'in_progress',
  'pending_validation',
];

export const ACTIVE_CLIENT_STATUSES: IncidentStatus[] = [
  'open',
  'assigned',
  'in_progress',
  'pending_validation',
  'resolved',
];

export function incidentDisplay(status: IncidentStatus, role: Role): Display {
  return (
    LABELS[role][status] ?? {
      label: status.toUpperCase(),
      variant: 'neutral',
    }
  );
}
