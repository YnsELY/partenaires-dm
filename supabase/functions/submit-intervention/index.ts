// Edge function : valide qu'une intervention est complète puis la passe en
// pending_validation. Appelée par l'agent depuis l'app mobile.
// POST { intervention_id }
// Auth: Bearer <user JWT> (verify_jwt = true dans config.toml)
// Réponse 200 : { ok: true }
// Réponse 400 : { error, missing? }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';

type Body = { intervention_id?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return json({ error: 'Server env vars missing' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Missing Authorization header' }, 401);
  }

  // Client utilisateur : utilisé pour récupérer auth.uid() depuis le JWT
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return json({ error: 'Invalid session' }, 401);
  }
  const agentId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { intervention_id } = body;
  if (!intervention_id) {
    return json({ error: 'intervention_id is required' }, 400);
  }

  // Client service-role : on contourne RLS pour faire les checks et l'update
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Récupère l'intervention et vérifie ownership
  const { data: intervention, error: ivError } = await admin
    .from('interventions')
    .select('id, agent_id, site_id, status')
    .eq('id', intervention_id)
    .single();

  if (ivError || !intervention) {
    return json({ error: 'Intervention not found' }, 404);
  }

  // L'agent doit être l'agent principal OU rattaché via intervention_agents.
  let isAssigned = intervention.agent_id === agentId;
  if (!isAssigned) {
    const { data: link } = await admin
      .from('intervention_agents')
      .select('agent_id')
      .eq('intervention_id', intervention.id)
      .eq('agent_id', agentId)
      .maybeSingle();
    isAssigned = !!link;
  }
  if (!isAssigned) {
    return json({ error: 'You are not assigned to this intervention' }, 403);
  }
  if (intervention.status === 'pending_validation' || intervention.status === 'validated') {
    return json({ error: `Intervention is already in status "${intervention.status}"` }, 400);
  }

  // 2) Récupère la liste des zones depuis checklist_tasks (snapshot per-intervention
  //    en priorité, fallback sur le template du site pour les anciennes interventions)
  let zonesRows: { zone: string | null }[] | null = null;
  const perIv = await admin
    .from('checklist_tasks')
    .select('zone')
    .eq('intervention_id', intervention.id);
  if (perIv.error) {
    return json({ error: perIv.error.message }, 500);
  }
  if (perIv.data && perIv.data.length > 0) {
    zonesRows = perIv.data;
  } else {
    const fallback = await admin
      .from('checklist_tasks')
      .select('zone')
      .eq('site_id', intervention.site_id)
      .is('intervention_id', null);
    if (fallback.error) {
      return json({ error: fallback.error.message }, 500);
    }
    zonesRows = fallback.data ?? [];
  }

  const zones = Array.from(
    new Set((zonesRows ?? []).map((r) => r.zone).filter((z): z is string => !!z))
  );

  // 3) Vérifie qu'au moins une photo before + after existe par zone connue
  const { data: mediaRows, error: mediaError } = await admin
    .from('media')
    .select('zone, type')
    .eq('intervention_id', intervention_id);

  if (mediaError) {
    return json({ error: mediaError.message }, 500);
  }

  const missing: { zone: string; type: 'before' | 'after' }[] = [];
  for (const zone of zones) {
    const hasBefore = (mediaRows ?? []).some((m) => m.zone === zone && m.type === 'before');
    const hasAfter = (mediaRows ?? []).some((m) => m.zone === zone && m.type === 'after');
    if (!hasBefore) missing.push({ zone, type: 'before' });
    if (!hasAfter) missing.push({ zone, type: 'after' });
  }

  if (zones.length === 0) {
    // pas de zone définie : on demande au moins 1 before + 1 after global
    const hasBefore = (mediaRows ?? []).some((m) => m.type === 'before');
    const hasAfter = (mediaRows ?? []).some((m) => m.type === 'after');
    if (!hasBefore) missing.push({ zone: '_global', type: 'before' });
    if (!hasAfter) missing.push({ zone: '_global', type: 'after' });
  }

  // 4) Vérifie qu'au moins une checklist_results existe pour cette intervention
  const { count: checklistCount, error: checklistError } = await admin
    .from('checklist_results')
    .select('*', { count: 'exact', head: true })
    .eq('intervention_id', intervention_id);

  if (checklistError) {
    return json({ error: checklistError.message }, 500);
  }

  if (missing.length > 0 || (checklistCount ?? 0) === 0) {
    return json(
      {
        error: 'Intervention incomplete',
        missing,
        checklist_completed: (checklistCount ?? 0) > 0,
      },
      400
    );
  }

  // 5) Marque l'intervention comme pending_validation
  const { error: updateError } = await admin
    .from('interventions')
    .update({ status: 'pending_validation', submitted_at: new Date().toISOString() })
    .eq('id', intervention_id);

  if (updateError) {
    return json({ error: updateError.message }, 500);
  }

  triggerNotification(req, 'intervention_submitted', intervention_id);

  return json({ ok: true }, 200);
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function triggerNotification(req: Request, type: string, entityId: string): void {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const authHeader = req.headers.get('Authorization');
  if (!SUPABASE_URL || !authHeader) return;

  const task = fetch(`${SUPABASE_URL}/functions/v1/dispatch-notification`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type, entity_id: entityId }),
  }).catch((e) => {
    console.error('[submit-intervention] notification error:', e);
  });

  // @ts-ignore EdgeRuntime n'est pas dans les types par défaut
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(task);
  }
}
