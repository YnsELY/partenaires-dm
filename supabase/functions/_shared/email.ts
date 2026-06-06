export interface ReportEmailParams {
  clientName: string;
  siteName: string;
  siteAddress?: string | null;
  validatedDate: string;
  globalResult: 'ok' | 'to_improve';
  adminSummary?: string | null;
  pdfUrl?: string | null;
}

export function buildReportEmailHtml(p: ReportEmailParams): string {
  const isOk = p.globalResult !== 'to_improve';
  const badgeColor = isOk ? '#16a34a' : '#b45309';
  const badgeBg = isOk ? '#dcfce7' : '#fef3c7';
  const badgeLabel = isOk ? 'Intervention OK' : '&#192; am&#233;liorer';

  const summaryBlock = p.adminSummary
    ? `
      <tr>
        <td style="padding:0 32px 24px;">
          <table width="100%" cellpadding="0" cellspacing="0"
            style="background:#f8f9ff;border-left:3px solid #00236f;border-radius:0 8px 8px 0;">
            <tr>
              <td style="padding:16px;">
                <div style="font-size:10px;font-weight:800;color:#6b7280;letter-spacing:1.2px;margin-bottom:8px;text-transform:uppercase;">
                  R&#233;sum&#233; de l&#39;intervention
                </div>
                <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
                  ${escapeHtml(p.adminSummary)}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  const buttonBlock = p.pdfUrl
    ? `
      <tr>
        <td style="padding:0 32px 28px;">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#00236f;border-radius:8px;">
                <a href="${p.pdfUrl}"
                  style="display:inline-block;padding:13px 26px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;letter-spacing:0.3px;">
                  &#128196; Ouvrir le rapport PDF
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Rapport d&#39;intervention &#8212; ${escapeHtml(p.siteName)}</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f8;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f2f8;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background:#ffffff;border-radius:16px;overflow:hidden;
                 box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:600px;">

          <!-- Header -->
          <tr>
            <td style="background:#00236f;padding:28px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <div style="font-size:20px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">
                      Les Partenaires DM
                    </div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.65);margin-top:3px;letter-spacing:1.2px;text-transform:uppercase;">
                      Rapport d&#39;intervention
                    </div>
                  </td>
                  <td align="right" valign="middle">
                    <span style="background:${badgeBg};color:${badgeColor};
                      font-size:11px;font-weight:800;padding:6px 14px;
                      border-radius:20px;letter-spacing:0.6px;white-space:nowrap;">
                      ${badgeLabel}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Site name banner -->
          <tr>
            <td style="background:#f8f9ff;padding:20px 32px;border-bottom:1px solid #e5e7eb;">
              <div style="font-size:10px;font-weight:800;color:#9ca3af;letter-spacing:1.2px;text-transform:uppercase;margin-bottom:4px;">
                Chantier
              </div>
              <div style="font-size:20px;font-weight:800;color:#00236f;">
                ${escapeHtml(p.siteName)}
              </div>
              ${p.siteAddress
                ? `<div style="font-size:13px;color:#6b7280;margin-top:3px;">${escapeHtml(p.siteAddress)}</div>`
                : ''}
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:28px 32px 16px;">
              <p style="margin:0 0 16px;font-size:15px;color:#374151;">
                Bonjour <strong>${escapeHtml(p.clientName)}</strong>,
              </p>
              <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;">
                Nous avons le plaisir de vous informer que l&#39;intervention
                r&#233;alis&#233;e sur votre chantier a &#233;t&#233;
                <strong style="color:#00236f;">valid&#233;e</strong>
                par nos &#233;quipes le <strong>${escapeHtml(p.validatedDate)}</strong>.
              </p>
            </td>
          </tr>

          ${summaryBlock}

          <!-- Attachment notice -->
          <tr>
            <td style="padding:0 32px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0"
                style="background:#f0f7ff;border-radius:8px;">
                <tr>
                  <td style="padding:14px 16px;">
                    <table cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-right:10px;vertical-align:top;font-size:18px;">&#128196;</td>
                        <td style="font-size:14px;color:#374151;line-height:1.6;">
                          Vous trouverez le rapport complet de l&#39;intervention
                          <strong>en pi&#232;ce jointe</strong> de cet email (format PDF).
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          ${buttonBlock}

          <!-- Sign-off -->
          <tr>
            <td style="padding:0 32px 32px;">
              <p style="margin:0;font-size:14px;color:#6b7280;line-height:1.7;">
                Si vous avez des questions concernant ce rapport,
                n&#39;h&#233;sitez pas &#224; nous contacter.
              </p>
              <p style="margin:20px 0 0;font-size:14px;color:#374151;font-weight:600;">
                L&#39;&#233;quipe Les Partenaires DM
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8f9ff;padding:18px 32px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center;line-height:1.6;">
                Ce message a &#233;t&#233; envoy&#233; automatiquement suite &#224; la validation
                de votre intervention.<br>
                &copy; Les Partenaires DM
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildReportEmailText(p: ReportEmailParams): string {
  const lines = [
    `Bonjour ${p.clientName},`,
    '',
    `Nous avons le plaisir de vous informer que l'intervention réalisée sur votre chantier "${p.siteName}" a été validée par nos équipes le ${p.validatedDate}.`,
  ];
  if (p.adminSummary) {
    lines.push('', `Résumé de l'intervention :`, p.adminSummary);
  }
  lines.push(
    '',
    "Vous trouverez le rapport complet de l'intervention en pièce jointe de cet email (format PDF).",
  );
  if (p.pdfUrl) {
    lines.push('', `Ouvrir le rapport en ligne : ${p.pdfUrl}`);
  }
  lines.push(
    '',
    "Si vous avez des questions concernant ce rapport, n'hésitez pas à nous contacter.",
    '',
    "L'équipe Les Partenaires DM",
  );
  return lines.join('\n');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
