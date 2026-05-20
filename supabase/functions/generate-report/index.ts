// Edge function : génère un rapport PDF pour une intervention validée.
// Embed les photos cochées (is_validated=true) + la liste des tâches effectuées.
// Upload dans le bucket "reports" puis renvoie un signed URL (1 an).
//
// POST { intervention_id }
// Auth : admin OR agent assigné OR client ayant accès au site.

import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ============================================================
// CORS + Auth (inlinés volontairement : le bundler Supabase ne
// remonte pas `../_shared/`, donc on duplique ici plutôt que
// d'introduire une dépendance fragile).
// ============================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AuthCheckResult =
  | { ok: true; userId: string; admin: SupabaseClient }
  | { ok: false; status: number; error: string };

async function getAuthenticatedUser(req: Request): Promise<AuthCheckResult> {
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

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return { ok: false, status: 401, error: 'Invalid session' };
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return { ok: true, userId: userData.user.id, admin };
}

type Body = { intervention_id?: string };

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 40;

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
  if (!body.intervention_id) {
    return json({ error: 'intervention_id is required' }, 400);
  }
  const interventionId = body.intervention_id;

  // 1) Charge l'intervention + autorise (admin OR agent assigné OR client autorisé)
  const { data: iv, error: ivErr } = await admin
    .from('interventions')
    .select(
      `id, site_id, agent_id, scheduled_at, validated_at, status,
       admin_summary, global_result,
       site:sites ( id, name, address, client:clients ( id, name ) ),
       agent:profiles!interventions_agent_id_fkey ( id, full_name )`
    )
    .eq('id', interventionId)
    .maybeSingle();

  if (ivErr || !iv) return json({ error: 'Intervention not found' }, 404);

  // Vérifie l'accès. Pour un client, l'accès au site peut venir de deux
  // chemins (cf. migration 0008_client_profile_link.sql) :
  //   1) profiles.client_id → sites.client_id (lien entreprise)
  //   2) client_site_access (accès granulaire site par site)
  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('role, client_id')
    .eq('id', userId)
    .maybeSingle();
  const isAdmin = profile?.role === 'admin';
  const isAgent = (iv as any).agent_id === userId;

  let isClientAllowed = false;
  if (!isAdmin && !isAgent && profile?.role === 'client') {
    // Voie 1 : entreprise du profil = entreprise du site
    if (profile.client_id) {
      const { data: siteRow } = await admin
        .from('sites')
        .select('client_id')
        .eq('id', (iv as any).site_id)
        .maybeSingle();
      if (siteRow?.client_id && siteRow.client_id === profile.client_id) {
        isClientAllowed = true;
      }
    }
    // Voie 2 : accès explicite via client_site_access
    if (!isClientAllowed) {
      const { count } = await admin
        .from('client_site_access')
        .select('*', { count: 'exact', head: true })
        .eq('client_profile_id', userId)
        .eq('site_id', (iv as any).site_id);
      isClientAllowed = (count ?? 0) > 0;
    }
  }

  if (!isAdmin && !isAgent && !isClientAllowed) {
    return json(
      {
        error: `Forbidden — userId=${userId}, role=${profile?.role ?? 'null'}, ` +
          `profile.client_id=${profile?.client_id ?? 'null'}, ` +
          `iv.site_id=${(iv as any).site_id ?? 'null'}` +
          (profErr ? `, profile_err=${profErr.message}` : ''),
      },
      403
    );
  }

  // 2) Charge tasks + results + media (validées)
  let tasksRes = await admin
    .from('checklist_tasks')
    .select('*')
    .eq('intervention_id', interventionId)
    .order('order_index', { ascending: true });
  if (!tasksRes.data || tasksRes.data.length === 0) {
    tasksRes = await admin
      .from('checklist_tasks')
      .select('*')
      .eq('site_id', (iv as any).site_id)
      .is('intervention_id', null)
      .order('order_index', { ascending: true });
  }
  const tasks = tasksRes.data ?? [];

  const { data: resultsRows } = await admin
    .from('checklist_results')
    .select('task_id, is_done')
    .eq('intervention_id', interventionId);
  const resultsMap = new Map<string, boolean>();
  for (const r of resultsRows ?? []) {
    resultsMap.set((r as any).task_id, !!(r as any).is_done);
  }

  const { data: mediaRows } = await admin
    .from('media')
    .select('id, url, type, zone, taken_at')
    .eq('intervention_id', interventionId)
    .eq('is_validated', true)
    .order('taken_at', { ascending: true });
  const media = (mediaRows ?? []) as Array<{
    id: string;
    url: string;
    type: 'before' | 'after' | 'anomaly';
    zone: string | null;
  }>;

  // 3) Génère le PDF
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const drawText = (
    text: string,
    opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}
  ) => {
    const size = opts.size ?? 11;
    const useFont = opts.bold ? fontBold : font;
    const color = opts.color ?? [0.1, 0.1, 0.12];
    page.drawText(text, {
      x: MARGIN,
      y,
      size,
      font: useFont,
      color: rgb(color[0], color[1], color[2]),
    });
    y -= size + 4;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  // Header
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 60,
    width: PAGE_W,
    height: 60,
    color: rgb(0, 0.137, 0.435), // #00236f
  });
  page.drawText('LES PARTENAIRES DM', {
    x: MARGIN,
    y: PAGE_H - 38,
    size: 14,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Rapport d'intervention", {
    x: MARGIN,
    y: PAGE_H - 55,
    size: 9,
    font,
    color: rgb(0.85, 0.88, 1),
  });
  y = PAGE_H - 90;

  // Bloc infos
  const ivAny = iv as any;
  const siteName = ivAny.site?.name ?? 'Site inconnu';
  const clientName = ivAny.site?.client?.name ?? '—';
  const agentName = ivAny.agent?.full_name ?? 'Non assigné';
  const validatedDate = ivAny.validated_at
    ? new Date(ivAny.validated_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '—';
  const scheduledDate = new Date(ivAny.scheduled_at).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  drawText(siteName, { size: 18, bold: true, color: [0, 0.137, 0.435] });
  drawText(`Client : ${clientName}`, { size: 11 });
  drawText(`Adresse : ${ivAny.site?.address ?? '—'}`, { size: 11 });
  drawText(`Agent : ${agentName}`, { size: 11 });
  drawText(`Planifiée le : ${scheduledDate}`, { size: 11 });
  drawText(`Validée le : ${validatedDate}`, { size: 11 });

  const statusLabel =
    ivAny.global_result === 'to_improve' ? 'A AMELIORER' : 'INTERVENTION OK';
  const statusColor: [number, number, number] =
    ivAny.global_result === 'to_improve' ? [0.71, 0.32, 0.04] : [0.09, 0.64, 0.29];
  y -= 6;
  drawText(`Statut : ${statusLabel}`, { size: 12, bold: true, color: statusColor });

  // Résumé
  if (ivAny.admin_summary) {
    y -= 8;
    drawText("Resume de l'administration :", { size: 11, bold: true });
    const lines = wrapText(stripAccents(ivAny.admin_summary as string), 90);
    for (const line of lines) {
      ensureSpace(14);
      drawText(line, { size: 10, color: [0.27, 0.27, 0.32] });
    }
  }

  // Tâches effectuées
  y -= 12;
  ensureSpace(30);
  drawText('Taches effectuees', { size: 14, bold: true, color: [0, 0.137, 0.435] });

  // Groupe par zone
  const tasksByZone = new Map<string, typeof tasks>();
  for (const t of tasks) {
    const k = (t as any).zone ?? 'Général';
    const list = tasksByZone.get(k) ?? [];
    list.push(t);
    tasksByZone.set(k, list);
  }

  for (const [zone, items] of tasksByZone.entries()) {
    ensureSpace(20);
    y -= 4;
    drawText(`> ${stripAccents(zone)}`, { size: 11, bold: true, color: [0.1, 0.1, 0.12] });
    for (const t of items as any[]) {
      ensureSpace(14);
      const done = resultsMap.get(t.id);
      const check = done ? '[X]' : '[ ]';
      const label = stripAccents(t.label as string);
      const lines = wrapText(`${check} ${label}`, 90);
      for (let i = 0; i < lines.length; i++) {
        ensureSpace(13);
        page.drawText(lines[i], {
          x: MARGIN + (i === 0 ? 0 : 18),
          y,
          size: 10,
          font,
          color: done ? rgb(0.1, 0.1, 0.12) : rgb(0.55, 0.55, 0.6),
        });
        y -= 13;
      }
    }
  }

  // Photos — page dédiée, grille 2 colonnes
  if (media.length > 0) {
    page = pdf.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
    page.drawText('Preuves photographiques', {
      x: MARGIN,
      y,
      size: 14,
      font: fontBold,
      color: rgb(0, 0.137, 0.435),
    });
    y -= 24;

    const TILE_W = (PAGE_W - 2 * MARGIN - 14) / 2;
    const TILE_H = TILE_W * 0.75;
    let col = 0;

    // Groupe par zone
    const mediaByZone = new Map<string, typeof media>();
    for (const m of media) {
      const k = m.zone ?? 'Général';
      const list = mediaByZone.get(k) ?? [];
      list.push(m);
      mediaByZone.set(k, list);
    }

    for (const [zone, items] of mediaByZone.entries()) {
      // Titre de zone
      if (y - 20 < MARGIN) {
        page = pdf.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
        col = 0;
      }
      page.drawText(stripAccents(zone), {
        x: MARGIN,
        y,
        size: 11,
        font: fontBold,
        color: rgb(0.1, 0.1, 0.12),
      });
      y -= 16;
      col = 0;

      for (const m of items) {
        if (col === 0 && y - TILE_H - 30 < MARGIN) {
          page = pdf.addPage([PAGE_W, PAGE_H]);
          y = PAGE_H - MARGIN;
        }

        try {
          const imgBytes = await fetchImageBytes(m.url);
          let embedded;
          // pdf-lib supporte JPG et PNG nativement
          try {
            embedded = await pdf.embedJpg(imgBytes);
          } catch {
            embedded = await pdf.embedPng(imgBytes);
          }
          const x = MARGIN + col * (TILE_W + 14);
          page.drawImage(embedded, { x, y: y - TILE_H, width: TILE_W, height: TILE_H });
          page.drawText(m.type.toUpperCase(), {
            x: x + 6,
            y: y - 16,
            size: 8,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
        } catch (_) {
          // Image inaccessible — on skippe silencieusement.
        }
        col = (col + 1) % 2;
        if (col === 0) {
          y -= TILE_H + 14;
        }
      }
      if (col !== 0) {
        // Fin de ligne incomplète
        y -= TILE_H + 14;
        col = 0;
      }
      y -= 8;
    }
  }

  // 4) Upload dans le bucket reports
  const pdfBytes = await pdf.save();
  const path = `${interventionId}/report.pdf`;
  const { error: upErr } = await admin.storage
    .from('reports')
    .upload(path, pdfBytes, {
      contentType: 'application/pdf',
      upsert: true,
    });
  if (upErr) {
    return json({ error: `Upload failed: ${upErr.message}` }, 500);
  }

  // 5) Signed URL valable 1 an
  const { data: signed, error: signErr } = await admin.storage
    .from('reports')
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signErr || !signed?.signedUrl) {
    return json({ error: signErr?.message ?? 'Failed to sign URL' }, 500);
  }

  // 6) Persiste l'URL sur l'intervention pour réutilisation
  await admin
    .from('interventions')
    .update({ pdf_url: signed.signedUrl })
    .eq('id', interventionId);

  return json({ ok: true, signed_url: signed.signedUrl }, 200);
});

// ============================================================
// Helpers
// ============================================================

async function fetchImageBytes(url: string): Promise<Uint8Array> {
  // Les signed URLs Supabase sont auto-suffisantes, on peut fetch directement.
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Image fetch failed: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** pdf-lib ne supporte pas les accents avec les fonts standards.
 *  On remplace les accents par leur équivalent ASCII pour éviter
 *  les WinAnsi encoding errors. */
function stripAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[–—]/g, '-')
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
