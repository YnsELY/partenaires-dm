// Helper partagé pour les edge functions qui nécessitent d'identifier l'appelant
// (et éventuellement vérifier qu'il est admin).

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

export type AuthCheckResult =
  | { ok: true; userId: string; admin: SupabaseClient }
  | { ok: false; status: number; error: string };

export async function getAuthenticatedUser(
  req: Request,
  opts: { requireAdmin?: boolean } = {}
): Promise<AuthCheckResult> {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return { ok: false, status: 500, error: 'Server env vars missing' };
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return { ok: false, status: 401, error: 'Missing Authorization header' };
  }

  // Client utilisateur (avec le JWT) pour récupérer l'identité
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return { ok: false, status: 401, error: 'Invalid session' };
  }
  const userId = userData.user.id;

  // Client service-role pour les opérations privilégiées
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (opts.requireAdmin) {
    const { data: profile, error: profileErr } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (profileErr || !profile) {
      return { ok: false, status: 403, error: 'Profile not found' };
    }
    if (profile.role !== 'admin') {
      return { ok: false, status: 403, error: 'Admin role required' };
    }
  }

  return { ok: true, userId, admin };
}
