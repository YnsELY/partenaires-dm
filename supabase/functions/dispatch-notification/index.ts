// Edge function : centralise les notifications push Expo.
//
// POST { type, entity_id?, extra? }
// Auth : utilisateur connecté. La fonction revalide les droits et calcule
// les destinataires côté service-role avant tout envoi.

import { corsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { sendNotificationEvent, PushPayload } from '../_shared/push.ts';
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

type Body = {
  type?: string;
  entity_id?: string;
  extra?: Record<string, unknown>;
};

type Profile = {
  id: string;
  role: 'admin' | 'agent' | 'client';
  full_name: string | null;
  email: string | null;
  client_id: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { admin, userId } = auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.type) return json({ error: 'type is required' }, 400);

  try {
    const payload = await buildPayload(admin, userId, body);
    if (!payload) return json({ ok: true, skipped: true }, 200);

    const result = await sendNotificationEvent(admin, payload);
    return json({ ok: true, result }, 200);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message }, 400);
  }
});

async function buildPayload(
  admin: SupabaseClient,
  actorId: string,
  body: Body
): Promise<PushPayload | null> {
  const actor = await getProfile(admin, actorId);
  if (!actor) throw new Error('Profile not found');

  switch (body.type) {
    case 'test':
      return {
        eventType: 'test',
        actorId,
        entityType: 'profile',
        entityId: actorId,
        recipientUserIds: [actorId],
        title: 'Notification de test',
        body: "Les notifications push sont bien configurées.",
        data: { screen: homeScreenForRole(actor.role) },
      };

    case 'intervention_created':
      requireAdmin(actor);
      return interventionPayload(admin, actorId, body.entity_id, 'created');

    case 'intervention_started':
      return interventionPayload(admin, actorId, body.entity_id, 'started');

    case 'intervention_submitted':
      return interventionPayload(admin, actorId, body.entity_id, 'submitted');

    case 'intervention_validated':
      requireAdmin(actor);
      return interventionPayload(admin, actorId, body.entity_id, 'validated');

    case 'intervention_rejected':
      requireAdmin(actor);
      return interventionPayload(admin, actorId, body.entity_id, 'rejected');

    case 'report_available':
      requireAdmin(actor);
      return interventionPayload(admin, actorId, body.entity_id, 'report_available');

    case 'incident_created':
      return incidentPayload(admin, actorId, body.entity_id, 'created');

    case 'incident_assigned':
      requireAdmin(actor);
      return incidentPayload(admin, actorId, body.entity_id, 'assigned');

    case 'incident_resolution_submitted':
      return incidentPayload(admin, actorId, body.entity_id, 'resolution_submitted');

    case 'incident_resolved':
      requireAdmin(actor);
      return incidentPayload(admin, actorId, body.entity_id, 'resolved');

    case 'incident_closed':
      return incidentPayload(admin, actorId, body.entity_id, 'closed');

    case 'message_created':
      return messagePayload(admin, actorId, body.entity_id);

    case 'client_linked':
      requireAdmin(actor);
      return clientLinkedPayload(admin, actorId, body.entity_id);

    case 'site_created':
      requireAdmin(actor);
      return sitePayload(admin, actorId, body.entity_id);

    case 'evaluation_submitted':
      return evaluationPayload(admin, actorId, body.entity_id);

    default:
      throw new Error(`Unsupported notification type: ${body.type}`);
  }
}

async function interventionPayload(
  admin: SupabaseClient,
  actorId: string,
  interventionId: string | undefined,
  action: 'created' | 'started' | 'submitted' | 'validated' | 'rejected' | 'report_available'
): Promise<PushPayload | null> {
  if (!interventionId) throw new Error('entity_id is required');
  const { data: iv, error } = await admin
    .from('interventions')
    .select(
      `
      id, site_id, agent_id, scheduled_at, status, admin_notes, global_result,
      site:sites ( id, name, client_id ),
      agent:profiles!interventions_agent_id_fkey ( id, full_name )
      `
    )
    .eq('id', interventionId)
    .maybeSingle();
  if (error || !iv) throw new Error(error?.message ?? 'Intervention not found');

  const row = iv as any;
  const siteName = row.site?.name ?? 'Site';
  const agentName = row.agent?.full_name ?? 'Agent';
  const at = row.scheduled_at ? formatDateTime(row.scheduled_at) : null;

  if (action === 'created') {
    const recipients = await agentIdsForIntervention(admin, row.id, row.agent_id);
    if (recipients.length === 0) return null;
    return {
      eventType: 'intervention_created',
      actorId,
      entityType: 'intervention',
      entityId: row.id,
      recipientUserIds: recipients,
      title: 'Nouvelle intervention planifiée',
      body: `${siteName}${at ? ` · ${at}` : ''}`,
      data: { screen: 'agent_mission', interventionId: row.id },
    };
  }

  if (action === 'started') {
    const assigned = await agentIdsForIntervention(admin, row.id, row.agent_id);
    if (!assigned.includes(actorId)) {
      throw new Error('Only assigned agent can notify start');
    }
    return {
      eventType: 'intervention_started',
      actorId,
      entityType: 'intervention',
      entityId: row.id,
      recipientUserIds: await adminIds(admin),
      title: 'Intervention démarrée',
      body: `${agentName} a démarré l'intervention sur ${siteName}.`,
      data: { screen: 'admin_planning', interventionId: row.id },
    };
  }

  if (action === 'submitted') {
    const assigned = await agentIdsForIntervention(admin, row.id, row.agent_id);
    if (!assigned.includes(actorId)) {
      throw new Error('Only assigned agent can notify submission');
    }
    return {
      eventType: 'intervention_submitted',
      actorId,
      entityType: 'intervention',
      entityId: row.id,
      recipientUserIds: await adminIds(admin),
      title: 'Intervention à valider',
      body: `${agentName} a soumis ${siteName}.`,
      data: { screen: 'admin_validation', interventionId: row.id },
    };
  }

  if (action === 'validated') {
    const recipients = await agentIdsForIntervention(admin, row.id, row.agent_id);
    if (recipients.length === 0) return null;
    return {
      eventType: 'intervention_validated',
      actorId,
      entityType: 'intervention',
      entityId: row.id,
      recipientUserIds: recipients,
      title: 'Intervention validée',
      body: `${siteName} est validée${row.global_result === 'to_improve' ? ' avec points à améliorer' : ''}.`,
      data: { screen: 'agent_mission', interventionId: row.id },
    };
  }

  if (action === 'rejected') {
    const recipients = await agentIdsForIntervention(admin, row.id, row.agent_id);
    if (recipients.length === 0) return null;
    return {
      eventType: 'intervention_rejected',
      actorId,
      entityType: 'intervention',
      entityId: row.id,
      recipientUserIds: recipients,
      title: 'Intervention rejetée',
      body: row.admin_notes ? String(row.admin_notes).slice(0, 140) : `${siteName} nécessite une reprise.`,
      data: { screen: 'agent_mission', interventionId: row.id },
    };
  }

  const clients = await clientIdsForSite(admin, row.site_id);
  return {
    eventType: 'report_available',
    actorId,
    entityType: 'intervention',
    entityId: row.id,
    recipientUserIds: clients,
    title: 'Rapport disponible',
    body: `Le rapport de ${siteName} est prêt à consulter.`,
    data: { screen: 'client_intervention', interventionId: row.id },
  };
}

async function incidentPayload(
  admin: SupabaseClient,
  actorId: string,
  incidentId: string | undefined,
  action:
    | 'created'
    | 'assigned'
    | 'resolution_submitted'
    | 'resolved'
    | 'closed'
): Promise<PushPayload | null> {
  if (!incidentId) throw new Error('entity_id is required');
  const { data: inc, error } = await admin
    .from('incidents')
    .select(
      `
      id, site_id, reported_by, reporter_role, zone, description, status,
      assigned_agent_id,
      site:sites ( id, name ),
      reporter:profiles!incidents_reported_by_fkey ( id, full_name )
      `
    )
    .eq('id', incidentId)
    .maybeSingle();
  if (error || !inc) throw new Error(error?.message ?? 'Incident not found');
  const row = inc as any;
  const siteName = row.site?.name ?? 'Site';
  const shortDesc = row.description ? String(row.description).slice(0, 120) : 'Signalement sans description';

  if (action === 'created') {
    if (row.reported_by !== actorId) throw new Error('Only reporter can notify incident creation');
    return {
      eventType: 'incident_created',
      actorId,
      entityType: 'incident',
      entityId: row.id,
      recipientUserIds: await adminIds(admin),
      title: row.reporter_role === 'client' ? 'Nouveau signalement client' : 'Nouvelle anomalie agent',
      body: `${siteName}${row.zone ? ` · ${row.zone}` : ''} — ${shortDesc}`,
      data: { screen: 'admin_incident', incidentId: row.id },
    };
  }

  if (action === 'assigned') {
    if (!row.assigned_agent_id) return null;
    return {
      eventType: 'incident_assigned',
      actorId,
      entityType: 'incident',
      entityId: row.id,
      recipientUserIds: [row.assigned_agent_id],
      title: 'Signalement assigné',
      body: `${siteName}${row.zone ? ` · ${row.zone}` : ''}`,
      data: { screen: 'agent_incident', incidentId: row.id },
    };
  }

  if (action === 'resolution_submitted') {
    if (row.assigned_agent_id !== actorId) throw new Error('Only assigned agent can notify resolution');
    return {
      eventType: 'incident_resolution_submitted',
      actorId,
      entityType: 'incident',
      entityId: row.id,
      recipientUserIds: await adminIds(admin),
      title: 'Résolution à valider',
      body: `${siteName} — l’agent a envoyé sa résolution.`,
      data: { screen: 'admin_incident', incidentId: row.id },
    };
  }

  if (action === 'resolved') {
    const recipients = new Set<string>();
    if (row.reporter_role === 'client') recipients.add(row.reported_by);
    if (row.assigned_agent_id) recipients.add(row.assigned_agent_id);
    return {
      eventType: 'incident_resolved',
      actorId,
      entityType: 'incident',
      entityId: row.id,
      recipientUserIds: Array.from(recipients),
      title: 'Signalement résolu',
      body: `${siteName} — la résolution a été validée.`,
      data: { screen: 'incident_detail', incidentId: row.id },
    };
  }

  if (row.reported_by !== actorId) throw new Error('Only reporter can notify incident closure');
  const recipients = new Set<string>(await adminIds(admin));
  if (row.assigned_agent_id) recipients.add(row.assigned_agent_id);
  return {
    eventType: 'incident_closed',
    actorId,
    entityType: 'incident',
    entityId: row.id,
    recipientUserIds: Array.from(recipients),
    title: 'Signalement clôturé',
    body: `${siteName} — le client a confirmé la résolution.`,
    data: { screen: 'incident_detail', incidentId: row.id },
  };
}

async function messagePayload(
  admin: SupabaseClient,
  actorId: string,
  messageId: string | undefined
): Promise<PushPayload | null> {
  if (!messageId) throw new Error('entity_id is required');
  const { data: msg, error } = await admin
    .from('messages')
    .select(
      `
      id, conversation_id, sender_id, body,
      conversation:conversations ( id, admin_id, agent_id, client_id ),
      sender:profiles!messages_sender_id_fkey ( id, full_name )
      `
    )
    .eq('id', messageId)
    .maybeSingle();
  if (error || !msg) throw new Error(error?.message ?? 'Message not found');
  const row = msg as any;
  if (row.sender_id !== actorId) throw new Error('Only sender can notify message');

  const conv = row.conversation;
  const recipients = [conv?.admin_id, conv?.agent_id, conv?.client_id].filter(
    (id) => id && id !== actorId
  );
  if (recipients.length === 0) return null;

  return {
    eventType: 'message_created',
    actorId,
    entityType: 'message',
    entityId: row.id,
    recipientUserIds: recipients,
    title: row.sender?.full_name ?? 'Nouveau message',
    body: String(row.body).slice(0, 140),
    data: { screen: 'conversation', conversationId: row.conversation_id },
  };
}

async function clientLinkedPayload(
  admin: SupabaseClient,
  actorId: string,
  clientProfileId: string | undefined
): Promise<PushPayload | null> {
  if (!clientProfileId) throw new Error('entity_id is required');
  const profile = await getProfile(admin, clientProfileId);
  if (!profile || profile.role !== 'client') throw new Error('Client profile not found');
  return {
    eventType: 'client_linked',
    actorId,
    entityType: 'profile',
    entityId: clientProfileId,
    recipientUserIds: [clientProfileId],
    title: 'Accès client activé',
    body: 'Vos chantiers sont maintenant disponibles dans l’application.',
    data: { screen: 'client_home' },
  };
}

async function sitePayload(
  admin: SupabaseClient,
  actorId: string,
  siteId: string | undefined
): Promise<PushPayload | null> {
  if (!siteId) throw new Error('entity_id is required');
  const { data: site, error } = await admin
    .from('sites')
    .select('id, name, client_id')
    .eq('id', siteId)
    .maybeSingle();
  if (error || !site) throw new Error(error?.message ?? 'Site not found');
  const row = site as any;
  return {
    eventType: 'site_created',
    actorId,
    entityType: 'site',
    entityId: row.id,
    recipientUserIds: await clientIdsForSite(admin, row.id),
    title: 'Nouveau chantier disponible',
    body: `${row.name ?? 'Un chantier'} est disponible dans votre espace.`,
    data: { screen: 'client_site', siteId: row.id },
  };
}

async function evaluationPayload(
  admin: SupabaseClient,
  actorId: string,
  evaluationId: string | undefined
): Promise<PushPayload | null> {
  if (!evaluationId) throw new Error('entity_id is required');
  const { data: evaluation, error } = await admin
    .from('evaluations')
    .select(
      `
      id, intervention_id, client_profile_id, rating, satisfaction, comment,
      intervention:interventions ( id, site_id, site:sites ( id, name ) ),
      client:profiles!evaluations_client_profile_id_fkey ( id, full_name )
      `
    )
    .eq('id', evaluationId)
    .maybeSingle();
  if (error || !evaluation) throw new Error(error?.message ?? 'Evaluation not found');
  const row = evaluation as any;
  if (row.client_profile_id !== actorId) throw new Error('Only client can notify evaluation');
  const siteName = row.intervention?.site?.name ?? 'Intervention';
  const rating = row.rating ? `${row.rating}/5` : 'avis';
  return {
    eventType: 'evaluation_submitted',
    actorId,
    entityType: 'evaluation',
    entityId: row.id,
    recipientUserIds: await adminIds(admin),
    title: 'Nouvel avis client',
    body: `${siteName} — ${rating}${row.comment ? ` · ${String(row.comment).slice(0, 80)}` : ''}`,
    data: { screen: 'admin_validation', interventionId: row.intervention_id },
  };
}

async function adminIds(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin.from('profiles').select('id').eq('role', 'admin');
  return ((data ?? []) as Array<{ id: string }>).map((p) => p.id);
}

// Tous les agents rattachés à une intervention : l'agent principal (agent_id)
// + ceux ajoutés via intervention_agents (multi-agents).
async function agentIdsForIntervention(
  admin: SupabaseClient,
  interventionId: string,
  primaryAgentId: string | null
): Promise<string[]> {
  const ids = new Set<string>();
  if (primaryAgentId) ids.add(primaryAgentId);
  const { data } = await admin
    .from('intervention_agents')
    .select('agent_id')
    .eq('intervention_id', interventionId);
  for (const row of (data ?? []) as Array<{ agent_id: string }>) ids.add(row.agent_id);
  return Array.from(ids);
}

async function clientIdsForSite(admin: SupabaseClient, siteId: string): Promise<string[]> {
  const { data: site } = await admin
    .from('sites')
    .select('client_id')
    .eq('id', siteId)
    .maybeSingle();
  const ids = new Set<string>();

  if ((site as any)?.client_id) {
    const { data: companyUsers } = await admin
      .from('profiles')
      .select('id')
      .eq('role', 'client')
      .eq('client_id', (site as any).client_id);
    for (const row of (companyUsers ?? []) as Array<{ id: string }>) ids.add(row.id);
  }

  const { data: accessRows } = await admin
    .from('client_site_access')
    .select('client_profile_id')
    .eq('site_id', siteId);
  for (const row of (accessRows ?? []) as Array<{ client_profile_id: string }>) {
    ids.add(row.client_profile_id);
  }
  return Array.from(ids);
}

async function getProfile(admin: SupabaseClient, userId: string): Promise<Profile | null> {
  const { data } = await admin
    .from('profiles')
    .select('id, role, full_name, email, client_id')
    .eq('id', userId)
    .maybeSingle();
  return (data as Profile | null) ?? null;
}

function requireAdmin(profile: Profile) {
  if (profile.role !== 'admin') throw new Error('Admin role required');
}

function homeScreenForRole(role: Profile['role']): string {
  if (role === 'admin') return 'admin_home';
  if (role === 'agent') return 'agent_home';
  return 'client_home';
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
