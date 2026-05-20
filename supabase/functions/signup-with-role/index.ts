// Edge function : crée un compte (auth.users) + insère un profile avec rôle.
// POST { email, password, full_name, phone, role: 'admin'|'agent'|'client' }
// Réponse 200 : { user_id, role }
// Réponse 4xx : { error }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { corsHeaders } from '../_shared/cors.ts';

type Body = {
  email?: string;
  password?: string;
  full_name?: string;
  phone?: string;
  role?: 'admin' | 'agent' | 'client';
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { email, password, full_name, phone, role } = body;

  if (!email || !password || !role) {
    return json({ error: 'email, password and role are required' }, 400);
  }
  if (!['admin', 'agent', 'client'].includes(role)) {
    return json({ error: "role must be 'admin', 'agent' or 'client'" }, 400);
  }
  if (password.length < 6) {
    return json({ error: 'password must be at least 6 characters long' }, 400);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Server is missing SUPABASE_URL or SERVICE_ROLE_KEY' }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1) Crée le user auth (email auto-confirmé pour le mode dev)
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, phone, role },
  });

  if (createError || !created?.user) {
    return json({ error: createError?.message ?? 'Could not create user' }, 400);
  }

  const userId = created.user.id;

  // 2) Insère la ligne profiles correspondante
  const { error: profileError } = await admin.from('profiles').insert({
    id: userId,
    role,
    full_name: full_name ?? null,
    phone: phone ?? null,
    email,
  });

  if (profileError) {
    // Rollback : on supprime l'auth user pour ne pas laisser d'orphelin
    await admin.auth.admin.deleteUser(userId);
    return json({ error: profileError.message }, 400);
  }

  return json({ user_id: userId, role }, 200);
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
