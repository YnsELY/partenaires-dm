// Edge function : envoie le rapport PDF par email aux clients d'un chantier.
// Appelée automatiquement depuis generate-report après la première génération du PDF.
//
// POST { intervention_id: string }
// Auth : admin (JWT forwarded depuis generate-report)
//
// Variables d'environnement requises :
//   RESEND_API_KEY  — clé API Resend
//   FROM_EMAIL      — adresse expéditrice vérifiée (ex: "Les Partenaires DM <rapports@votredomaine.com>")

import { corsHeaders } from '../_shared/cors.ts';
import { getAuthenticatedUser } from '../_shared/auth.ts';
import { buildReportEmailHtml, buildReportEmailText } from '../_shared/email.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true }, 200);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const auth = await getAuthenticatedUser(req, { requireAdmin: true });
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const { admin } = auth;

  let intervention_id: string;
  try {
    const body = await req.json();
    intervention_id = body.intervention_id;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!intervention_id) return json({ error: 'intervention_id is required' }, 400);

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
  const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Les Partenaires DM <rapports@partenairesdm.fr>';

  if (!RESEND_API_KEY) {
    console.error('[send-report-email] RESEND_API_KEY not set');
    return json({ error: 'Email service not configured' }, 500);
  }

  // ── 1) Données de l'intervention ────────────────────────────────────────────
  const { data: iv, error: ivErr } = await admin
    .from('interventions')
    .select(
      `id, site_id, validated_at, admin_summary, global_result, pdf_url,
       site:sites ( id, name, address, client_id )`
    )
    .eq('id', intervention_id)
    .single();

  if (ivErr || !iv) {
    console.error('[send-report-email] intervention not found:', ivErr?.message);
    return json({ error: 'Intervention not found' }, 404);
  }

  const ivAny = iv as any;
  const siteId: string = ivAny.site_id;
  const clientCompanyId: string | null = ivAny.site?.client_id ?? null;

  // ── 2) Destinataires ─────────────────────────────────────────────────────────
  // Deux chemins d'accès : entreprise (profiles.client_id) et accès explicite (client_site_access)
  const recipientMap = new Map<string, { full_name: string; email: string }>();

  if (clientCompanyId) {
    const { data: companyProfiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('role', 'client')
      .eq('client_id', clientCompanyId)
      .not('email', 'is', null);

    for (const p of companyProfiles ?? []) {
      const profile = p as any;
      if (profile.email) recipientMap.set(profile.email, profile);
    }
  }

  const { data: accessRows } = await admin
    .from('client_site_access')
    .select('client_profile_id')
    .eq('site_id', siteId);

  if (accessRows && accessRows.length > 0) {
    const ids = (accessRows as any[]).map((r) => r.client_profile_id);
    const { data: accessProfiles } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ids)
      .not('email', 'is', null);

    for (const p of accessProfiles ?? []) {
      const profile = p as any;
      if (profile.email) recipientMap.set(profile.email, profile);
    }
  }

  if (recipientMap.size === 0) {
    console.warn('[send-report-email] no client recipients for intervention', intervention_id);
    return json({ ok: true, sent: 0, warning: 'No recipients' }, 200);
  }

  // ── 3) Téléchargement du PDF depuis le storage ───────────────────────────────
  const pdfPath = `${intervention_id}/report.pdf`;
  const { data: pdfBlob, error: dlErr } = await admin.storage
    .from('reports')
    .download(pdfPath);

  if (dlErr || !pdfBlob) {
    console.error('[send-report-email] PDF download failed:', dlErr?.message);
    return json({ error: 'PDF not available yet' }, 500);
  }

  const pdfArrayBuffer = await pdfBlob.arrayBuffer();
  const pdfUint8 = new Uint8Array(pdfArrayBuffer);

  // Encodage base64 par blocs pour éviter les erreurs de stack sur les gros fichiers
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < pdfUint8.length; i += CHUNK) {
    binary += String.fromCharCode(...pdfUint8.slice(i, i + CHUNK));
  }
  const pdfBase64 = btoa(binary);

  // ── 4) Métadonnées de l'email ────────────────────────────────────────────────
  const siteName: string = ivAny.site?.name ?? 'Site';
  const siteAddress: string | null = ivAny.site?.address ?? null;
  const globalResult: 'ok' | 'to_improve' = ivAny.global_result ?? 'ok';
  const adminSummary: string | null = ivAny.admin_summary ?? null;
  const pdfUrl: string | null = ivAny.pdf_url ?? null;

  const validatedDate = ivAny.validated_at
    ? new Date(ivAny.validated_at).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      });

  const safeSlug = siteName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const dateSlug = (ivAny.validated_at ?? new Date().toISOString()).slice(0, 10);
  const pdfFilename = `rapport-${safeSlug}-${dateSlug}.pdf`;

  // ── 5) Envoi via Resend ──────────────────────────────────────────────────────
  let sent = 0;
  const errors: string[] = [];

  for (const [email, profile] of recipientMap.entries()) {
    const emailParams = {
      clientName: profile.full_name ?? 'Client',
      siteName,
      siteAddress,
      validatedDate,
      globalResult,
      adminSummary,
      pdfUrl,
    };

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [email],
          subject: `Rapport d'intervention validé — ${siteName}`,
          html: buildReportEmailHtml(emailParams),
          text: buildReportEmailText(emailParams),
          attachments: [
            {
              filename: pdfFilename,
              content: pdfBase64,
            },
          ],
        }),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        errors.push(`${email}: HTTP ${res.status} — ${txt}`);
        console.error('[send-report-email] Resend error for', email, res.status, txt);
      } else {
        sent++;
        console.log('[send-report-email] email sent to', email);
      }
    } catch (e) {
      errors.push(`${email}: ${String(e)}`);
      console.error('[send-report-email] fetch error for', email, e);
    }
  }

  return json(
    { ok: true, sent, total: recipientMap.size, errors: errors.length > 0 ? errors : undefined },
    200
  );
});

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
