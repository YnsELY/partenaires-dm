// Edge function : crée un compte agent (auth.user + profile) depuis l'admin.
// POST { email, password, full_name, phone?, team_id? }
// Auth : admin uniquement (verify_jwt = true + check role)
// Réponse 200 : { user_id }
// Réponse 4xx : { error }

import { corsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';

type Body = {
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  team_id?: string;
};

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

  const { email, password, full_name, phone, team_id } = body;

  if (!email || !password || !full_name) {
    return json({ error: 'email, password and full_name are required' }, 400);
  }
  if (password.length < 6) {
    return json({ error: 'password must be at least 6 characters long' }, 400);
  }

  // 1) Crée l'utilisateur Auth
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, phone, role: 'agent' },
  });

  if (createErr || !created?.user) {
    return json({ error: createErr?.message ?? 'Could not create auth user' }, 400);
  }

  const userId = created.user.id;

  // 2) Insère le profil
  const { error: profileErr } = await admin.from('profiles').insert({
    id: userId,
    role: 'agent',
    full_name,
    phone: phone ?? null,
    email,
  });

  if (profileErr) {
    await admin.auth.admin.deleteUser(userId);
    return json({ error: profileErr.message }, 400);
  }

  // 3) Optionnel : assignation à une équipe
  if (team_id) {
    const { error: teamErr } = await admin.from('team_members').insert({
      team_id,
      agent_id: userId,
    });
    if (teamErr) {
      // On ne rollback pas l'agent ici : il existe, juste sans équipe
      return json({ user_id: userId, warning: `team assignment failed: ${teamErr.message}` }, 200);
    }
  }

  return json({ user_id: userId }, 200);
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
