/**
 * Minimal branded email infrastructure. A single wrapper keeps every
 * transactional email visually consistent without duplicating HTML in each
 * service. Richer per-workflow templates build on `renderBrandedEmail`.
 */

const BRAND = {
  name: 'TFHC Orderliness',
  navy: '#0F172A',
  gold: '#D97706',
  ground: '#F8FAFC',
  ink: '#0b1c30',
  muted: '#45464d',
};

export interface BrandedEmail {
  /** Short heading shown as the email's H1. */
  heading: string;
  /** Optional preheader (hidden preview text). */
  preview?: string;
  /** Paragraphs of body copy (plain strings; rendered as <p>). */
  paragraphs: string[];
  /** Optional call-to-action button. */
  cta?: { label: string; url: string };
  /** Optional small print under the CTA (e.g. link expiry). */
  footnote?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderBrandedEmail(input: BrandedEmail): { subject: string; text: string; html: string } {
  const textParts = [
    input.heading,
    '',
    ...input.paragraphs,
  ];
  if (input.cta) textParts.push('', `${input.cta.label}: ${input.cta.url}`);
  if (input.footnote) textParts.push('', input.footnote);
  textParts.push('', `— ${BRAND.name}`);

  const paragraphsHtml = input.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:${BRAND.ink};">${escapeHtml(p)}</p>`)
    .join('');

  const ctaHtml = input.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:8px 0 16px;">
         <tr><td style="border-radius:8px;background:${BRAND.navy};">
           <a href="${escapeHtml(input.cta.url)}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(input.cta.label)}</a>
         </td></tr>
       </table>`
    : '';

  const footnoteHtml = input.footnote
    ? `<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:${BRAND.muted};">${escapeHtml(input.footnote)}</p>`
    : '';

  const preview = input.preview
    ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preview)}</span>`
    : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BRAND.ground};">
${preview}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BRAND.ground};padding:24px 0;">
  <tr><td align="center">
    <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
      <tr><td style="background:${BRAND.navy};padding:20px 32px;">
        <span style="font-size:16px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">${BRAND.name}</span>
      </td></tr>
      <tr><td style="padding:32px;">
        <h1 style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:700;letter-spacing:-0.01em;color:${BRAND.navy};">${escapeHtml(input.heading)}</h1>
        ${paragraphsHtml}
        ${ctaHtml}
        ${footnoteHtml}
      </td></tr>
      <tr><td style="padding:20px 32px;border-top:1px solid #E2E8F0;">
        <p style="margin:0;font-size:12px;line-height:18px;color:${BRAND.muted};">
          You are receiving this because you have an account with ${BRAND.name}. If this wasn't you, please contact your church administrator.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

  return { subject: input.heading, text: textParts.join('\n'), html };
}
