// Edge function : valide ou rejette une intervention soumise par un agent.
// Appelée par l'admin depuis l'écran Validation.
//
// POST {
//   intervention_id,
//   action: 'validate',
//   admin_summary: string,
//   global_result: 'ok'|'to_improve',
//   validated_media_ids: string[]
// }
// ou
// POST { intervention_id, action: 'reject', reason: string }
//
// Auth : admin (verify_jwt = true + check role)

import { corsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';

type ValidateBody = {
  intervention_id: string;
  action: 'validate';
  admin_summary?: string;
  global_result: 'ok' | 'to_improve';
  validated_media_ids?: string[];
};

type RejectBody = {
  intervention_id: string;
  action: 'reject';
  reason: string;
};

type Body = ValidateBody | RejectBody;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const auth = await getAuthenticatedUser(req, { requireAdmin: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { admin } = auth;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.intervention_id) {
    return json({ error: 'intervention_id is required' }, 400);
  }

  // Vérifie que l'intervention existe et qu'elle est dans un état attendu
  const { data: intervention, error: ivErr } = await admin
    .from('interventions')
    .select('id, status')
    .eq('id', body.intervention_id)
    .single();

  if (ivErr || !intervention) {
    return json({ error: 'Intervention not found' }, 404);
  }
  if (intervention.status === 'validated' || intervention.status === 'rejected') {
    return json({ error: `Intervention already ${intervention.status}` }, 400);
  }

  // ====== ACTION : validate ======
  if (body.action === 'validate') {
    if (!body.global_result || !['ok', 'to_improve'].includes(body.global_result)) {
      return json({ error: "global_result must be 'ok' or 'to_improve'" }, 400);
    }

    const { error: updIvErr } = await admin
      .from('interventions')
      .update({
        status: 'validated',
        validated_at: new Date().toISOString(),
        admin_summary: body.admin_summary ?? null,
        global_result: body.global_result,
      })
      .eq('id', body.intervention_id);

    if (updIvErr) return json({ error: updIvErr.message }, 500);

    // Toutes les photos de l'intervention deviennent visibles côté client
    // dès que l'admin valide. Le champ `validated_media_ids` du body est
    // conservé pour rétro-compat mais ignoré.
    const { count: validatedCount, error: validErr } = await admin
      .from('media')
      .update({ is_validated: true }, { count: 'exact' })
      .eq('intervention_id', body.intervention_id);

    if (validErr) return json({ error: validErr.message }, 500);

    // Auto-génère le PDF de rapport en arrière-plan, pour que le client
    // ait directement un bouton "Voir le rapport PDF" fonctionnel sans
    // attendre que l'admin clique manuellement sur la génération.
    triggerPdfGeneration(req, body.intervention_id);

    return json({ ok: true, validated_media_count: validatedCount ?? 0 }, 200);
  }

  // ====== ACTION : reject ======
  if (body.action === 'reject') {
    if (!body.reason || body.reason.trim().length === 0) {
      return json({ error: 'reason is required when rejecting' }, 400);
    }

    const { error: updErr } = await admin
      .from('interventions')
      .update({
        status: 'rejected',
        admin_notes: body.reason.trim(),
      })
      .eq('id', body.intervention_id);

    if (updErr) return json({ error: updErr.message }, 500);

    return json({ ok: true }, 200);
  }

  return json({ error: "action must be 'validate' or 'reject'" }, 400);
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Lance la génération du PDF en arrière-plan via la fonction generate-report.
 * On forwarde le JWT de l'admin pour que la fonction accepte la requête.
 * On utilise EdgeRuntime.waitUntil si disponible pour ne pas bloquer la
 * réponse au client ; sinon on fire-and-forget sans await.
 */
function triggerPdfGeneration(req: Request, interventionId: string): void {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const authHeader = req.headers.get('Authorization');
  if (!SUPABASE_URL || !authHeader) return;

  const task = fetch(`${SUPABASE_URL}/functions/v1/generate-report`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ intervention_id: interventionId }),
  })
    .then(async (r) => {
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        console.error('[validate-intervention] auto-PDF failed:', r.status, txt);
      }
    })
    .catch((e) => {
      console.error('[validate-intervention] auto-PDF error:', e);
    });

  // @ts-ignore EdgeRuntime n'est pas dans le types par défaut
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime?.waitUntil) {
    // @ts-ignore
    EdgeRuntime.waitUntil(task);
  }
  // Sinon : fire-and-forget. La promesse continue à tourner même si on return.
}
