// Edge function : supprime un compte utilisateur (auth.user + profile + données
// liées par cascade FK).
//
// Deux usages :
//   1. Auto-suppression : n'importe quel utilisateur connecté supprime SON
//      propre compte (body vide, ou user_id === appelant).
//   2. Suppression par l'admin : l'admin supprime le compte d'un autre
//      utilisateur (body { user_id }).
//
// POST { user_id? }
// Auth : Bearer <user JWT> (verify_jwt = true)
// Réponse 200 : { ok: true }
// Réponse 4xx : { error }

import { corsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';

type Body = { user_id?: string };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const auth = await getAuthenticatedUser(req);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { admin, userId: callerId } = auth;

  // Body optionnel : pour l'auto-suppression on peut appeler sans corps.
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const targetId = body.user_id ?? callerId;
  const isSelf = targetId === callerId;

  // Rôle de l'appelant
  const { data: callerProfile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', callerId)
    .maybeSingle();
  const callerRole = callerProfile?.role ?? null;

  // Supprimer le compte d'un autre utilisateur est réservé aux admins.
  if (!isSelf && callerRole !== 'admin') {
    return json({ error: 'Admin role required to delete another account' }, 403);
  }

  // Rôle de la cible (peut être null si le profil a déjà disparu)
  const { data: targetProfile, error: targetErr } = await admin
    .from('profiles')
    .select('role')
    .eq('id', targetId)
    .maybeSingle();
  if (targetErr) {
    return json({ error: targetErr.message }, 500);
  }

  // Garde-fou : ne jamais supprimer le dernier administrateur (sinon plus
  // personne ne peut administrer l'application).
  if (targetProfile?.role === 'admin') {
    const { count, error: countErr } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');
    if (countErr) {
      return json({ error: countErr.message }, 500);
    }
    if ((count ?? 0) <= 1) {
      return json(
        { error: 'Impossible de supprimer le dernier administrateur.' },
        400
      );
    }
  }

  // Suppression de l'utilisateur Auth → cascade sur profiles et toutes les
  // tables liées (team_members, conversations, messages, push_tokens, etc.).
  const { error: delErr } = await admin.auth.admin.deleteUser(targetId);
  if (delErr) {
    return json({ error: delErr.message }, 400);
  }

  return json({ ok: true }, 200);
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
