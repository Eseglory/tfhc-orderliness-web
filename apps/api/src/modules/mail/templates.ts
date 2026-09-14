/**
 * TFHC-ORDERLINESS Professional Branded Email Template System.
 *
 * Provides responsive, production-ready, beautifully branded HTML email templates
 * for the 6 core system categories:
 *  1. Notification (Informational, Announcements, System Updates)
 *  2. Reminder (Upcoming Services, Roster Shifts, Dues Deadlines)
 *  3. Alert (Live Gathering Start, Urgent Follow-Up Flags)
 *  4. Warning (Absenteeism Thresholds, Arrears Notice, Policy Violations)
 *  5. Approval (Absence Excuses, Expense Approvals, Attendance Corrections)
 *  6. Query (Administrative Inquiries, Verification & Information Requests)
 */

// Default Hosted Image URLs for production email delivery (Gmail/Outlook HTTPS requirements)
export const DEFAULT_CHURCH_LOGO_URL =
  process.env.CHURCH_LOGO_URL || 'https://eglobalicthub.com/assets/tfhc/logo.png';
export const DEFAULT_ESE_GLORY_AVATAR =
  process.env.ADMIN_PHOTO_URL || 'https://eglobalicthub.com/assets/tfhc/ese-glory.jpg';

export const BRAND = {
  name: 'TFHC Orderliness',
  churchName: "The Father's House Church",
  churchAddress: '90, Ojodu Akute Road, Ajayi Farms Bus-Stop.',
  churchMapsUrl: 'https://www.google.com/maps/place/402+Park+Ave+S,+New+York,+NY+10016,+USA/@40.7431645,-73.985576,18z/data=!3m1!4b1!4m12!1m6!3m5!1s0x89c259ab1e7d7bb3:0x73d3e76f445d8343!2sBig+Blue+Travel!8m2!3d40.7542139!4d-73.9860662!3m4!1s0x89c259a79f63f8eb:0x376f7da45d944208!8m2!3d40.7431624!4d-73.9844496',
  churchLogoUrl: DEFAULT_CHURCH_LOGO_URL,
  poweredByName: 'Eglobal ICT-Hub',
  poweredByUrl: 'https://eglobalicthub.com',
  navy: '#1E1B4B',
  indigo: '#4338CA',
  ground: '#F1F5F9',
  cardBg: '#FFFFFF',
  ink: '#0F172A',
  muted: '#64748B',
  border: '#E2E8F0',
};

export type EmailCategory = 'notification' | 'reminder' | 'alert' | 'warning' | 'approval' | 'query';

interface CategoryStyle {
  label: string;
  badgeBg: string;
  badgeColor: string;
  accentBar: string;
  iconSymbol: string;
}

const CATEGORY_STYLES: Record<EmailCategory, CategoryStyle> = {
  notification: {
    label: 'NOTIFICATION',
    badgeBg: '#EEF2FF',
    badgeColor: '#4338CA',
    accentBar: '#4F46E5',
    iconSymbol: '📢',
  },
  reminder: {
    label: 'REMINDER',
    badgeBg: '#FEF3C7',
    badgeColor: '#B45309',
    accentBar: '#F59E0B',
    iconSymbol: '⏰',
  },
  alert: {
    label: 'CRITICAL ALERT',
    badgeBg: '#FFE4E6',
    badgeColor: '#BE123C',
    accentBar: '#E11D48',
    iconSymbol: '🚨',
  },
  warning: {
    label: 'ACTION REQUIRED',
    badgeBg: '#FEF2F2',
    badgeColor: '#991B1B',
    accentBar: '#DC2626',
    iconSymbol: '⚠️',
  },
  approval: {
    label: 'ADMINISTRATIVE APPROVAL',
    badgeBg: '#ECFDF5',
    badgeColor: '#047857',
    accentBar: '#10B981',
    iconSymbol: '✅',
  },
  query: {
    label: 'OPERATIONAL INQUIRY',
    badgeBg: '#F3E8FF',
    badgeColor: '#7E22CE',
    accentBar: '#9333EA',
    iconSymbol: '💬',
  },
};

export interface BrandedEmailOptions {
  category?: EmailCategory;
  /** Subject line & main heading (H1). */
  heading: string;
  /** Optional preheader (hidden inbox preview snippet). */
  preview?: string;
  /** Recipient display name (e.g. "David Johnson", "Clara Smith"). */
  recipientName?: string;
  /** Paragraphs of body text (rendered cleanly as formatted paragraphs). */
  paragraphs: string[];
  /** Optional key-value metadata breakdown box (e.g. Date, Time, Venue, Reference). */
  details?: { label: string; value: string }[];
  /** Primary Call-to-Action button. */
  cta?: { label: string; url: string; tone?: 'primary' | 'success' | 'danger' };
  /** Secondary link or instructions. */
  secondaryAction?: { label: string; url: string };
  /** Optional footnote / expiry text (e.g. "This token expires in 24 hours"). */
  footnote?: string;
  /** Optional notification reference ID */
  referenceId?: string;
}

export function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderBrandedEmail(input: BrandedEmailOptions): { subject: string; text: string; html: string } {
  const category = input.category ?? 'notification';
  const style = CATEGORY_STYLES[category];
  const refCode = input.referenceId || `TFHC-ORD-REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  // Plain Text Version (High Quality Fallback)
  const textParts: string[] = [
    `[${BRAND.name.toUpperCase()} — ${style.label}]`,
    input.heading,
    '========================================',
  ];

  if (input.recipientName) {
    textParts.push(`Hello ${input.recipientName},`, '');
  }

  textParts.push(...input.paragraphs);

  if (input.details && input.details.length > 0) {
    textParts.push('', '--- Details ---');
    input.details.forEach((d) => textParts.push(`${d.label}: ${d.value}`));
  }

  if (input.cta) {
    textParts.push('', `>> ${input.cta.label}: ${input.cta.url}`);
  }

  if (input.secondaryAction) {
    textParts.push(`>> ${input.secondaryAction.label}: ${input.secondaryAction.url}`);
  }

  if (input.footnote) {
    textParts.push('', `Note: ${input.footnote}`);
  }

  textParts.push(
    '',
    `Notification Reference: Ref: ${refCode}`,
    '---',
    BRAND.churchName,
    BRAND.churchAddress,
    `Powered by ${BRAND.poweredByName} (${BRAND.poweredByUrl})`,
  );

  // HTML Rendering
  const greetingHtml = input.recipientName
    ? `<p style="margin:0 0 16px;font-size:16px;line-height:24px;font-weight:600;color:${BRAND.ink};">Hello ${escapeHtml(
        input.recipientName,
      )},</p>`
    : '';

  const paragraphsHtml = input.paragraphs
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155;">${escapeHtml(p)}</p>`)
    .join('');

  const detailsHtml =
    input.details && input.details.length > 0
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0 24px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
          <tr><td style="padding:16px 20px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              ${input.details
                .map(
                  (d, idx) => `
                <tr>
                  <td style="padding:${idx > 0 ? '8px' : '0'} 0 0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#64748B;width:35%;">${escapeHtml(
                    d.label,
                  )}</td>
                  <td style="padding:${idx > 0 ? '8px' : '0'} 0 0;font-size:14px;font-weight:600;color:#0F172A;">${escapeHtml(
                    d.value,
                  )}</td>
                </tr>`,
                )
                .join('')}
            </table>
          </td></tr>
        </table>`
      : '';

  const ctaBtnColor =
    input.cta?.tone === 'success' ? '#10B981' : input.cta?.tone === 'danger' ? '#E11D48' : BRAND.indigo;

  const ctaHtml = input.cta
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:20px 0 16px;">
         <tr>
           <td align="center" style="border-radius:10px;background:${ctaBtnColor};">
             <a href="${escapeHtml(
               input.cta.url,
             )}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:0.01em;">
               ${escapeHtml(input.cta.label)}
             </a>
           </td>
         </tr>
       </table>`
    : '';

  const secondaryHtml = input.secondaryAction
    ? `<p style="margin:8px 0 16px;font-size:13px;color:#64748B;">
         Or visit: <a href="${escapeHtml(
           input.secondaryAction.url,
         )}" style="color:${BRAND.indigo};text-decoration:underline;">${escapeHtml(
        input.secondaryAction.label,
      )}</a>
       </p>`
    : '';

  const footnoteHtml = input.footnote
    ? `<p style="margin:16px 0 0;font-size:12px;line-height:18px;color:#94A3B8;border-top:1px dashed #E2E8F0;padding-top:12px;">
         ${escapeHtml(input.footnote)}
       </p>`
    : '';

  const previewHtml = input.preview
    ? `<span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;">${escapeHtml(
        input.preview,
      )}</span>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.heading)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${BRAND.ground};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  ${previewHtml}
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${BRAND.ground};padding:32px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,0.06);border:1px solid #E2E8F0;">

          <!-- Colored Accent Bar -->
          <tr>
            <td style="height:5px;background-color:${style.accentBar};"></td>
          </tr>

          <!-- Header with Logo & Purpose Badge -->
          <tr>
            <td style="padding:22px 36px 18px;background-color:#FFFFFF;border-bottom:1px solid #F1F5F9;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="left" valign="middle">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td valign="middle" style="padding-right:12px;">
                          <img src="${BRAND.churchLogoUrl}" alt="${BRAND.churchName}" height="34" style="display:block;height:34px;border:0;outline:none;" />
                        </td>
                        <td valign="middle" style="border-left:1px solid #E2E8F0;padding-left:12px;">
                          <div style="font-size:16px;font-weight:900;letter-spacing:-0.02em;color:${BRAND.navy};">
                            ${BRAND.name}
                          </div>
                          <div style="font-size:11px;font-weight:600;color:#94A3B8;letter-spacing:0.02em;margin-top:1px;">
                            ${BRAND.churchName}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" valign="middle">
                    <span style="display:inline-block;padding:5px 12px;border-radius:20px;font-size:11px;font-weight:800;letter-spacing:0.04em;background-color:${style.badgeBg};color:${style.badgeColor};">
                      ${style.iconSymbol} ${style.label}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td style="padding:32px 36px;">
              <h1 style="margin:0 0 20px;font-size:22px;line-height:28px;font-weight:800;letter-spacing:-0.02em;color:${BRAND.navy};">
                ${escapeHtml(input.heading)}
              </h1>

              ${greetingHtml}
              ${paragraphsHtml}
              ${detailsHtml}
              ${ctaHtml}
              ${secondaryHtml}
              ${footnoteHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 36px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;text-align:center;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center" style="font-size:12px;line-height:20px;color:#64748B;">
                    <p style="margin:0 0 6px;">
                      <a href="${BRAND.churchMapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#334155;font-weight:700;text-decoration:underline;">
                        ${BRAND.churchName} • ${BRAND.churchAddress}
                      </a>
                    </p>
                    <p style="margin:0 0 8px;font-size:11px;color:#94A3B8;">
                      Notification Reference: <span style="font-family:monospace;font-weight:700;color:#64748B;">Ref: ${refCode}</span>
                    </p>
                    <p style="margin:0 0 10px;font-size:12px;">
                      <a href="#" style="color:#4F46E5;text-decoration:none;">Notification Preferences</a>
                      &nbsp;&nbsp;•&nbsp;&nbsp;
                      <a href="${BRAND.poweredByUrl}/privacy" target="_blank" rel="noopener noreferrer" style="color:#4F46E5;text-decoration:none;">Privacy Policy</a>
                      &nbsp;&nbsp;•&nbsp;&nbsp;
                      <a href="#" style="color:#4F46E5;text-decoration:none;">Unsubscribe</a>
                    </p>
                    <div style="margin-top:12px;padding-top:12px;border-top:1px solid #E2E8F0;font-size:11px;color:#94A3B8;">
                      Powered by <a href="${BRAND.poweredByUrl}" target="_blank" rel="noopener noreferrer" style="color:#4338CA;font-weight:700;text-decoration:none;">${BRAND.poweredByName}</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: input.heading, text: textParts.join('\n'), html };
}

// =========================================================================
// INVITATION EMAIL TEMPLATE (Matching Official Orderliness Brand Design)
// =========================================================================
export interface InvitationEmailOptions {
  recipientName?: string;
  recipientEmail?: string;
  inviteUrl: string;
  inviterName?: string;
  inviterTitle?: string;
  inviterEmail?: string;
  inviterPhotoUrl?: string;
  roleName?: string;
  expiresInDays?: number;
  referenceId?: string;
  mobileAppUrl?: string;
  orientationNotice?: {
    title?: string;
    description?: string;
  };
}

export function renderInvitationEmail(options: InvitationEmailOptions): { subject: string; text: string; html: string } {
  const inviterName = options.inviterName || 'Ese Glory';
  const inviterTitle = options.inviterTitle || 'System Administrator';
  const inviterEmail = options.inviterEmail || 'engreseglory@gmail.com';
  // Default crisp high-res avatar photo
  const inviterPhoto = options.inviterPhotoUrl || DEFAULT_ESE_GLORY_AVATAR;

  const refCode = options.referenceId || `TFHC-ORD-INV-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const firstName = options.recipientName?.trim() || 'Team Member';
  const subject = `You are invited to join the Orderliness Unit Platform`;
  const mobileAppUrl = options.mobileAppUrl || options.inviteUrl;

  // Plain Text Version
  const text = [
    `[USHERING & ORDERLINESS UNIT]`,
    `You are invited to join the Orderliness Unit Platform`,
    `"Let all things be done decently and in order." — 1 Corinthians 14:40`,
    `========================================`,
    ``,
    `Dear ${firstName},`,
    ``,
    `Welcome to the Ushering & Orderliness Ministry at ${BRAND.churchName}. Through this dedicated operations platform, you can seamlessly access your Sunday duty rosters, check sanctuary zone assignments, log live attendance headcounts, and receive immediate unit briefing alerts.`,
    ``,
    `KEY FEATURES:`,
    `- Rosters & Shifts: View upcoming Sunday call times and sanctuary zone check-ins`,
    `- Live Headcount: Coordinate seating flow & real-time sanctuary tally counters`,
    `- Briefings & Alerts: Instant broadcast notices, sanctuary protocols & lead sync`,
    ``,
    `UPCOMING EVENT:`,
    `${options.orientationNotice?.title || 'Upcoming Usher Team Briefing & Orientation'}`,
    `${options.orientationNotice?.description || 'Join us this Saturday at 9:00 AM in the Main Sanctuary for app walkthrough, zone assignments, and emergency protocol orientation.'}`,
    ``,
    `>> Accept Invitation & Activate Account: ${options.inviteUrl}`,
    `>> Download Mobile App: ${mobileAppUrl}`,
    ``,
    `----------------------------------------`,
    `Invited by:`,
    `${inviterName}`,
    `${inviterTitle}`,
    `${inviterEmail}`,
    `----------------------------------------`,
    `Notification Reference: Ref: ${refCode}`,
    `Address: ${BRAND.churchAddress}`,
    `Map: ${BRAND.churchMapsUrl}`,
    `Privacy Policy: ${BRAND.poweredByUrl}/privacy`,
    `Powered by ${BRAND.poweredByName} (${BRAND.poweredByUrl})`,
  ].join('\n');

  // HTML Version
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#EEF2F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Preheader -->
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;">
    You are invited to join the Orderliness Unit Platform at ${BRAND.churchName}. Accept your invitation to activate your account.
  </span>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#EEF2F6;padding:36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Card Container -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 36px rgba(15,23,42,0.08);border:1px solid #E2E8F0;">

          <!-- Top Dark Navy Hero Banner -->
          <tr>
            <td style="background-color:#1E1B4B;background-image:linear-gradient(180deg, #1E1B4B 0%, #25225E 100%);padding:36px 32px 32px;text-align:center;">

              <!-- Church Logo -->
              <div style="margin-bottom:16px;">
                <img src="${BRAND.churchLogoUrl}" alt="${BRAND.churchName}" height="38" style="display:inline-block;height:38px;border:0;outline:none;" />
              </div>

              <!-- Badge Pill -->
              <div style="display:inline-block;padding:5px 14px;background-color:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:9999px;margin-bottom:16px;">
                <span style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:#E0E7FF;text-transform:uppercase;">
                  ✨ USHERING &amp; ORDERLINESS UNIT
                </span>
              </div>

              <!-- Main Hero Heading -->
              <h1 style="margin:0 0 12px;font-size:26px;line-height:34px;font-weight:800;color:#FFFFFF;letter-spacing:-0.025em;">
                You are invited to join<br>the Orderliness Unit Platform
              </h1>

              <!-- Scripture Subtitle -->
              <p style="margin:0;font-size:13px;line-height:20px;color:#A5B4FC;font-style:italic;">
                &ldquo;Let all things be done decently and in order.&rdquo; &mdash; 1 Corinthians 14:40
              </p>
            </td>
          </tr>

          <!-- Main Body Content -->
          <tr>
            <td style="padding:36px 36px 28px;">

              <!-- Greeting -->
              <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#0F172A;">
                Dear <strong>${escapeHtml(firstName)}</strong>,
              </p>

              <!-- Intro Paragraph -->
              <p style="margin:0 0 28px;font-size:15px;line-height:24px;color:#334155;">
                Welcome to the <strong>Ushering &amp; Orderliness Ministry</strong> at ${BRAND.churchName}. Through this dedicated operations platform, you can seamlessly access your Sunday duty rosters, check sanctuary zone assignments, log live attendance headcounts, and receive immediate unit briefing alerts.
              </p>

              <!-- 3 Feature Cards (Desktop Table / Stackable) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <tr>
                  <!-- Card 1: Rosters & Shifts -->
                  <td width="31%" valign="top" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:16px 12px;text-align:center;">
                    <div style="font-size:24px;margin-bottom:8px;">📅</div>
                    <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:4px;">Rosters &amp; Shifts</div>
                    <div style="font-size:11px;line-height:16px;color:#64748B;">View upcoming Sunday call times and zone check-ins</div>
                  </td>

                  <td width="3.5%"></td>

                  <!-- Card 2: Live Headcount -->
                  <td width="31%" valign="top" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:16px 12px;text-align:center;">
                    <div style="font-size:24px;margin-bottom:8px;">👥</div>
                    <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:4px;">Live Headcount</div>
                    <div style="font-size:11px;line-height:16px;color:#64748B;">Coordinate seating flow &amp; real-time tally counters</div>
                  </td>

                  <td width="3.5%"></td>

                  <!-- Card 3: Briefings & Alerts -->
                  <td width="31%" valign="top" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:16px 12px;text-align:center;">
                    <div style="font-size:24px;margin-bottom:8px;">🔔</div>
                    <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:4px;">Briefings &amp; Alerts</div>
                    <div style="font-size:11px;line-height:16px;color:#64748B;">Instant broadcast notices &amp; lead sync protocols</div>
                  </td>
                </tr>
              </table>

              <!-- Notice Box (Orientation) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:32px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:14px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="32" valign="top" style="font-size:20px;padding-right:12px;">📋</td>
                        <td valign="top">
                          <div style="font-size:13px;font-weight:700;color:#92400E;margin-bottom:2px;">
                            ${escapeHtml(options.orientationNotice?.title || 'Upcoming Usher Team Briefing & Orientation')}
                          </div>
                          <div style="font-size:12px;line-height:18px;color:#B45309;">
                            ${escapeHtml(
                              options.orientationNotice?.description ||
                                'Join us this Saturday at 9:00 AM in the Main Sanctuary for app walkthrough, zone assignments, and emergency protocol orientation.',
                            )}
                          </div>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:12px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius:12px;background-color:#4338CA;">
                          <a href="${escapeHtml(options.inviteUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:16px 36px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;letter-spacing:0.01em;box-shadow:0 4px 14px rgba(67,56,202,0.35);">
                            Accept Invitation &amp; Activate Account &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Secondary Mobile App link -->
              <p style="margin:0 0 32px;text-align:center;font-size:13px;color:#64748B;">
                <a href="${escapeHtml(mobileAppUrl)}" target="_blank" rel="noopener noreferrer" style="color:#4338CA;text-decoration:none;font-weight:600;">
                  Or download the Orderliness Usher Mobile App
                </a>
              </p>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:0 0 24px;">

              <!-- Inviter Signature Block -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="56" valign="middle" style="padding-right:14px;">
                    <img src="${escapeHtml(inviterPhoto)}" alt="${escapeHtml(inviterName)}" width="52" height="52" style="display:block;border-radius:50%;object-fit:cover;border:2px solid #E2E8F0;" />
                  </td>
                  <td valign="middle">
                    <div style="font-size:15px;font-weight:700;color:#0F172A;line-height:20px;">
                      ${escapeHtml(inviterName)}
                    </div>
                    <div style="font-size:12px;color:#64748B;line-height:18px;">
                      ${escapeHtml(inviterTitle)}
                    </div>
                    <div style="font-size:12px;color:#4338CA;line-height:18px;">
                      <a href="mailto:${escapeHtml(inviterEmail)}" style="color:#4338CA;text-decoration:none;">${escapeHtml(inviterEmail)}</a>
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer Section -->
          <tr>
            <td style="padding:28px 36px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;text-align:center;">

              <!-- Address Link -->
              <p style="margin:0 0 6px;font-size:12px;line-height:18px;">
                <a href="${BRAND.churchMapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#334155;font-weight:700;text-decoration:underline;">
                  ${BRAND.churchName} &bull; ${BRAND.churchAddress}
                </a>
              </p>

              <!-- Appointment Notice -->
              <p style="margin:0 0 10px;font-size:12px;line-height:18px;color:#64748B;">
                You received this invitation because you were appointed to the Ushering &amp; Orderliness Ministry at ${BRAND.churchName}.
              </p>

              <!-- Notification Reference -->
              <p style="margin:0 0 12px;font-size:11px;color:#94A3B8;">
                Notification Reference: <span style="font-family:monospace;font-weight:700;color:#475569;">Ref: ${refCode}</span>
              </p>

              <!-- Footer Links -->
              <p style="margin:0 0 14px;font-size:12px;line-height:18px;">
                <a href="#" style="color:#4338CA;text-decoration:none;font-weight:500;">Notification Preferences</a>
                &nbsp;&nbsp;&bull;&nbsp;&nbsp;
                <a href="${BRAND.poweredByUrl}/privacy" target="_blank" rel="noopener noreferrer" style="color:#4338CA;text-decoration:none;font-weight:500;">Privacy Policy</a>
                &nbsp;&nbsp;&bull;&nbsp;&nbsp;
                <a href="#" style="color:#4338CA;text-decoration:none;font-weight:500;">Unsubscribe</a>
              </p>

              <!-- Powered By -->
              <div style="margin-top:14px;padding-top:14px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B;">
                Powered by <a href="${BRAND.poweredByUrl}" target="_blank" rel="noopener noreferrer" style="color:#4338CA;font-weight:700;text-decoration:none;">${BRAND.poweredByName}</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}


// =========================================================================
// 1. ROSTER REMINDER EMAIL TEMPLATE (Matching Screenshot 1)
// =========================================================================
export interface RosterReminderEmailOptions {
  recipientName: string;
  serviceTitle?: string;
  callTime?: string;
  serviceDate?: string;
  assignedZone?: string;
  vestmentCode?: string;
  dutySupervisor?: string;
  checklist?: string[];
  confirmUrl?: string;
  swapUrl?: string;
  bannerImageUrl?: string;
  referenceId?: string;
  inviterName?: string;
  inviterTitle?: string;
  inviterEmail?: string;
  inviterPhotoUrl?: string;
}

export function renderRosterReminderEmail(options: RosterReminderEmailOptions): { subject: string; text: string; html: string } {
  const inviterName = options.inviterName || 'Ese Glory';
  const inviterTitle = options.inviterTitle || 'System Administrator';
  const inviterEmail = options.inviterEmail || 'engreseglory@gmail.com';
  const inviterPhoto = options.inviterPhotoUrl || DEFAULT_ESE_GLORY_AVATAR;

  const refCode = options.referenceId || `TFHC-ORD-REM-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const serviceTitle = options.serviceTitle || 'Sunday 2nd Service Duty';
  const callTime = options.callTime || '07:15 AM Prompt';
  const serviceDate = options.serviceDate || 'Sunday, Oct 27, 2026';
  const assignedZone = options.assignedZone || 'Main Sanctuary / Zone A';
  const vestmentCode = options.vestmentCode || 'Navy Blazer & Gold Pin';
  const dutySupervisor = options.dutySupervisor || 'Unit Lead on Duty';
  const confirmUrl = options.confirmUrl || '#';
  const swapUrl = options.swapUrl || '#';

  const checklist = options.checklist || [
    'Review Seating Capacity & Reserved Rows — Ensure aisles are clear for communion and VIP readiness.',
    'Collect Mandatory Digital Tally Counter — Collect counter from Unit Lead before doors open.',
    'Join Team Briefing & Prayer — 15 minutes before opening with Unit Leads.',
  ];

  const subject = `Orderliness Ministry Duty Reminder: ${serviceTitle} (${serviceDate})`;

  // Plain text version
  const text = [
    `[USHERING & ORDERLINESS UNIT • ROSTER REMINDER]`,
    `Orderliness Ministry Duty Reminder`,
    `"Serving with diligence and honor: fervent in spirit; serving the Lord." — Romans 12:11`,
    `========================================`,
    ``,
    `Dear ${options.recipientName},`,
    ``,
    `Grace and peace to you. You are scheduled for sanctuary stewardship and assembly orderliness for the upcoming service. Please review your duty post details, briefing requirements, and acknowledge your readiness below.`,
    ``,
    `--- DUTY SCHEDULE ---`,
    `Service: ${serviceTitle}`,
    `Call Time: ${callTime}`,
    `Date: ${serviceDate}`,
    `Zone / Station: ${assignedZone}`,
    `Vestment Code: ${vestmentCode}`,
    `Supervisor: ${dutySupervisor}`,
    ``,
    `--- PRE-SERVICE BRIEFING CHECKLIST ---`,
    ...checklist.map((item) => `- [ ] ${item}`),
    ``,
    `>> Confirm Attendance / Check-in Ready: ${confirmUrl}`,
    `>> Request Shift Swap: ${swapUrl}`,
    ``,
    `----------------------------------------`,
    `Unit Administration:`,
    `${inviterName}`,
    `${inviterTitle}`,
    `${inviterEmail}`,
    `----------------------------------------`,
    `Notification Reference: Ref: ${refCode}`,
    `Address: ${BRAND.churchAddress}`,
    `Map: ${BRAND.churchMapsUrl}`,
    `Privacy Policy: ${BRAND.poweredByUrl}/privacy`,
    `Powered by ${BRAND.poweredByName} (${BRAND.poweredByUrl})`,
  ].join('\n');

  // HTML version
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF2F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#EEF2F6;padding:36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 36px rgba(15,23,42,0.08);border:1px solid #E2E8F0;">

          <!-- Top Navy Header -->
          <tr>
            <td style="background-color:#1E1B4B;background-image:linear-gradient(180deg, #1E1B4B 0%, #25225E 100%);padding:32px 32px 28px;text-align:center;">
              <div style="margin-bottom:16px;">
                <img src="${BRAND.churchLogoUrl}" alt="${BRAND.churchName}" height="36" style="display:inline-block;height:36px;border:0;outline:none;" />
              </div>
              <div style="display:inline-block;padding:5px 14px;background-color:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:9999px;margin-bottom:14px;">
                <span style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:#E0E7FF;text-transform:uppercase;">
                  ✨ USHERING &amp; ORDERLINESS UNIT &bull; ROSTER REMINDER
                </span>
              </div>
              <h1 style="margin:0 0 8px;font-size:24px;line-height:32px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">
                Orderliness Ministry Duty Reminder
              </h1>
              <p style="margin:0;font-size:13px;line-height:20px;color:#A5B4FC;font-style:italic;">
                &ldquo;Serving with diligence and honor: fervent in spirit; serving the Lord.&rdquo; &mdash; Romans 12:11
              </p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:32px 36px;">

              <!-- Greeting -->
              <p style="margin:0 0 14px;font-size:16px;line-height:24px;color:#0F172A;">
                Dear <strong>${escapeHtml(options.recipientName)}</strong>,
              </p>

              <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#334155;">
                Grace and peace to you. You are scheduled for sanctuary stewardship and assembly orderliness for the upcoming service. Please review your duty post details, briefing requirements, and acknowledge your readiness below.
              </p>

              <!-- Duty Callout Banner -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;background:#EEF2FF;border:1px solid #C7D2FE;border-radius:14px;overflow:hidden;">
                <tr>
                  <td style="padding:16px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="left" valign="middle">
                          <span style="display:inline-block;padding:4px 10px;background:#4338CA;color:#FFFFFF;border-radius:6px;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;">
                            ⚡ ${escapeHtml(serviceTitle)}
                          </span>
                        </td>
                        <td align="right" valign="middle">
                          <span style="font-size:13px;font-weight:800;color:#4338CA;">
                            ⏰ Call Time: ${escapeHtml(callTime)}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Details Grid (2x2) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;">
                <tr>
                  <td width="50%" style="padding:16px 20px;border-right:1px solid #E2E8F0;border-bottom:1px solid #E2E8F0;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748B;margin-bottom:4px;">📅 Date &amp; Service</div>
                    <div style="font-size:14px;font-weight:700;color:#0F172A;">${escapeHtml(serviceDate)}</div>
                  </td>
                  <td width="50%" style="padding:16px 20px;border-bottom:1px solid #E2E8F0;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748B;margin-bottom:4px;">🚪 Zone &amp; Station</div>
                    <div style="font-size:14px;font-weight:700;color:#0F172A;">${escapeHtml(assignedZone)}</div>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding:16px 20px;border-right:1px solid #E2E8F0;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748B;margin-bottom:4px;">👔 Vestment Code</div>
                    <div style="font-size:14px;font-weight:700;color:#0F172A;">${escapeHtml(vestmentCode)}</div>
                  </td>
                  <td width="50%" style="padding:16px 20px;">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:#64748B;margin-bottom:4px;">👤 Supervisor</div>
                    <div style="font-size:14px;font-weight:700;color:#0F172A;">${escapeHtml(dutySupervisor)}</div>
                  </td>
                </tr>
              </table>

              <!-- Pre-Service Checklist -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-size:13px;font-weight:800;color:#0F172A;text-transform:uppercase;letter-spacing:0.04em;margin-bottom:12px;">
                      📋 Pre-Service Briefing Checklist
                    </div>
                    ${checklist
                      .map(
                        (item) => `
                      <div style="margin-bottom:10px;font-size:13px;line-height:20px;color:#334155;display:table;width:100%;">
                        <span style="display:table-cell;width:24px;vertical-align:top;color:#4338CA;font-weight:700;">&bull;</span>
                        <span style="display:table-cell;vertical-align:top;">${escapeHtml(item)}</span>
                      </div>`,
                      )
                      .join('')}
                  </td>
                </tr>
              </table>

              <!-- Dual CTAs -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius:12px;background-color:#4338CA;">
                          <a href="${escapeHtml(confirmUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 28px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;letter-spacing:0.01em;">
                            Confirm Attendance / Check-in Ready &rarr;
                          </a>
                        </td>
                        <td width="12"></td>
                        <td align="center" style="border-radius:12px;border:1px solid #CBD5E1;background-color:#FFFFFF;">
                          <a href="${escapeHtml(swapUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 22px;font-size:14px;font-weight:700;color:#475569;text-decoration:none;border-radius:12px;">
                            Request Shift Swap
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:0 0 24px;">

              <!-- Inviter Signature Block -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="56" valign="middle" style="padding-right:14px;">
                    <img src="${escapeHtml(inviterPhoto)}" alt="${escapeHtml(inviterName)}" width="52" height="52" style="display:block;border-radius:50%;object-fit:cover;border:2px solid #E2E8F0;" />
                  </td>
                  <td valign="middle">
                    <div style="font-size:15px;font-weight:700;color:#0F172A;line-height:20px;">
                      ${escapeHtml(inviterName)}
                    </div>
                    <div style="font-size:12px;color:#64748B;line-height:18px;">
                      ${escapeHtml(inviterTitle)}
                    </div>
                    <div style="font-size:12px;color:#4338CA;line-height:18px;">
                      <a href="mailto:${escapeHtml(inviterEmail)}" style="color:#4338CA;text-decoration:none;">${escapeHtml(inviterEmail)}</a>
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 36px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;line-height:18px;">
                <a href="${BRAND.churchMapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#334155;font-weight:700;text-decoration:underline;">
                  ${BRAND.churchName} &bull; ${BRAND.churchAddress}
                </a>
              </p>
              <p style="margin:0 0 10px;font-size:12px;line-height:18px;color:#64748B;">
                You are receiving this operational duty notice as an active team member of the Ushering &amp; Orderliness Unit.
              </p>
              <p style="margin:0 0 12px;font-size:11px;color:#94A3B8;">
                Notification Reference: <span style="font-family:monospace;font-weight:700;color:#475569;">Ref: ${refCode}</span>
              </p>
              <p style="margin:0 0 14px;font-size:12px;line-height:18px;">
                <a href="#" style="color:#4338CA;text-decoration:none;font-weight:500;">Notification Preferences</a>
                &nbsp;&nbsp;&bull;&nbsp;&nbsp;
                <a href="${BRAND.poweredByUrl}/privacy" target="_blank" rel="noopener noreferrer" style="color:#4338CA;text-decoration:none;font-weight:500;">Privacy Policy</a>
                &nbsp;&nbsp;&bull;&nbsp;&nbsp;
                <a href="#" style="color:#4338CA;text-decoration:none;font-weight:500;">Unsubscribe</a>
              </p>
              <div style="margin-top:14px;padding-top:14px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B;">
                Powered by <a href="${BRAND.poweredByUrl}" target="_blank" rel="noopener noreferrer" style="color:#4338CA;font-weight:700;text-decoration:none;">${BRAND.poweredByName}</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

// =========================================================================
// 2. MEMBER QUERY & AVAILABILITY EMAIL TEMPLATE (Matching Screenshot 2)
// =========================================================================
export interface MemberQueryAvailabilityEmailOptions {
  recipientName: string;
  eventName: string;
  eventDescription?: string;
  sessionsCountText?: string;
  deadlineText?: string;
  actionUrl: string;
  referenceId?: string;
  inviterName?: string;
  inviterTitle?: string;
  inviterEmail?: string;
  inviterPhotoUrl?: string;
}

export function renderMemberQueryAvailabilityEmail(options: MemberQueryAvailabilityEmailOptions): { subject: string; text: string; html: string } {
  const inviterName = options.inviterName || 'Ese Glory';
  const inviterTitle = options.inviterTitle || 'System Administrator';
  const inviterEmail = options.inviterEmail || 'engreseglory@gmail.com';
  const inviterPhoto = options.inviterPhotoUrl || DEFAULT_ESE_GLORY_AVATAR;

  const refCode = options.referenceId || `TFHC-ORD-QRY-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const eventName = options.eventName || 'Upcoming Annual Thanksgiving Convention';
  const sessionsCountText = options.sessionsCountText || '4 Morning Sessions • 3 Evening Celebrations';
  const deadlineText = options.deadlineText || 'Wednesday at 6:00 PM';
  const subject = `Sanctuary Operations Inquiry: ${eventName} Availability & Deployment`;

  // Plain Text
  const text = [
    `[SANCTUARY OPS • TEAM AVAILABILITY INQUIRY]`,
    `${eventName}`,
    `Availability & Zone Deployment Inquiry`,
    `========================================`,
    ``,
    `Dear ${options.recipientName},`,
    ``,
    `Grace and peace to you as we prepare for the ${eventName}. The Orderliness & Ushering Operations Team requires your availability, station preference, and uniform inventory confirmation to complete the duty roster.`,
    ``,
    `EVENT SCOPE: ${sessionsCountText}`,
    ``,
    `STEPS TO COMPLETE:`,
    `Step 1: Your General Attendance (Available / Partial / Unavailable)`,
    `Step 2: Preferred Service Station (Sanctuary Seating, Altar & Clergy, Guest Reception, Parking & Logistics)`,
    `Step 3: Uniform & Accoutrement Status`,
    ``,
    `>> Submit Availability & Preferences: ${options.actionUrl}`,
    ``,
    `Strict Deadline for Submission: ${deadlineText}`,
    ``,
    `----------------------------------------`,
    `Unit Administration:`,
    `${inviterName}`,
    `${inviterTitle}`,
    `${inviterEmail}`,
    `----------------------------------------`,
    `Notification Reference: Ref: ${refCode}`,
    `Address: ${BRAND.churchAddress}`,
    `Map: ${BRAND.churchMapsUrl}`,
    `Privacy Policy: ${BRAND.poweredByUrl}/privacy`,
    `Powered by ${BRAND.poweredByName} (${BRAND.poweredByUrl})`,
  ].join('\n');

  // HTML
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF2F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#EEF2F6;padding:36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 36px rgba(15,23,42,0.08);border:1px solid #E2E8F0;">

          <!-- Top Navy Header -->
          <tr>
            <td style="background-color:#1E1B4B;background-image:linear-gradient(180deg, #1E1B4B 0%, #25225E 100%);padding:32px 32px 28px;text-align:center;">
              <div style="margin-bottom:16px;">
                <img src="${BRAND.churchLogoUrl}" alt="${BRAND.churchName}" height="36" style="display:inline-block;height:36px;border:0;outline:none;" />
              </div>
              <div style="display:inline-block;padding:5px 14px;background-color:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:9999px;margin-bottom:14px;">
                <span style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:#E0E7FF;text-transform:uppercase;">
                  ✨ SANCTUARY OPS &bull; TEAM AVAILABILITY INQUIRY
                </span>
              </div>
              <h1 style="margin:0 0 8px;font-size:24px;line-height:32px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">
                ${escapeHtml(eventName)}
              </h1>
              <p style="margin:0;font-size:13px;line-height:20px;color:#A5B4FC;">
                Availability &amp; Zone Deployment Inquiry &bull; Official Roster Formulation
              </p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:32px 36px;">

              <p style="margin:0 0 14px;font-size:16px;line-height:24px;color:#0F172A;">
                Dear <strong>${escapeHtml(options.recipientName)}</strong>,
              </p>

              <p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#334155;">
                Grace and peace to you as we prepare for the <strong>${escapeHtml(eventName)}</strong>. The Orderliness &amp; Ushering Operations Team requires your immediate availability, physical deployment preference, and uniform inventory confirmation to complete the duty roster.
              </p>

              <!-- Event Scope Badge -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;">
                <tr>
                  <td style="padding:14px 18px;text-align:center;">
                    <span style="font-size:13px;font-weight:800;color:#1E1B4B;">
                      🎪 Event Schedule Scope: ${escapeHtml(sessionsCountText)}
                    </span>
                  </td>
                </tr>
              </table>

              <!-- Interactive Step Checklist Preview -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <!-- Step 1 -->
                <tr>
                  <td style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin-bottom:10px;">
                    <div style="font-size:12px;font-weight:800;color:#4338CA;margin-bottom:4px;">STEP 1: GENERAL ATTENDANCE STATUS</div>
                    <div style="font-size:13px;color:#334155;">Confirm whether you are available for all sessions, partial dates, or on-call.</div>
                  </td>
                </tr>
                <tr><td height="10"></td></tr>
                <!-- Step 2 -->
                <tr>
                  <td style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;margin-bottom:10px;">
                    <div style="font-size:12px;font-weight:800;color:#4338CA;margin-bottom:4px;">STEP 2: PREFERRED SERVICE STATION</div>
                    <div style="font-size:13px;color:#334155;">Select Sanctuary Seating, Altar &amp; Clergy Escort, Guest Reception, or Logistics.</div>
                  </td>
                </tr>
                <tr><td height="10"></td></tr>
                <!-- Step 3 -->
                <tr>
                  <td style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px 16px;">
                    <div style="font-size:12px;font-weight:800;color:#4338CA;margin-bottom:4px;">STEP 3: UNIFORM &amp; ACCOUTREMENT STATUS</div>
                    <div style="font-size:13px;color:#334155;">Verify official navy blazer, name badge, and white gloves inventory.</div>
                  </td>
                </tr>
              </table>

              <!-- Action CTA -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius:12px;background-color:#4338CA;">
                          <a href="${escapeHtml(options.actionUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:16px 36px;font-size:15px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;box-shadow:0 4px 14px rgba(67,56,202,0.35);">
                            Submit Availability &amp; Preferences &rarr;
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Deadline Notice -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;">
                <tr>
                  <td style="padding:14px 18px;text-align:center;font-size:12px;font-weight:700;color:#92400E;">
                    ⏳ Strict Deadline for Submission: ${escapeHtml(deadlineText)}
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:0 0 24px;">

              <!-- Inviter Signature Block -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="56" valign="middle" style="padding-right:14px;">
                    <img src="${escapeHtml(inviterPhoto)}" alt="${escapeHtml(inviterName)}" width="52" height="52" style="display:block;border-radius:50%;object-fit:cover;border:2px solid #E2E8F0;" />
                  </td>
                  <td valign="middle">
                    <div style="font-size:15px;font-weight:700;color:#0F172A;line-height:20px;">
                      ${escapeHtml(inviterName)}
                    </div>
                    <div style="font-size:12px;color:#64748B;line-height:18px;">
                      ${escapeHtml(inviterTitle)}
                    </div>
                    <div style="font-size:12px;color:#4338CA;line-height:18px;">
                      <a href="mailto:${escapeHtml(inviterEmail)}" style="color:#4338CA;text-decoration:none;">${escapeHtml(inviterEmail)}</a>
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 36px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;line-height:18px;">
                <a href="${BRAND.churchMapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#334155;font-weight:700;text-decoration:underline;">
                  ${BRAND.churchName} &bull; ${BRAND.churchAddress}
                </a>
              </p>
              <p style="margin:0 0 10px;font-size:12px;line-height:18px;color:#64748B;">
                You are receiving this availability inquiry as a team member in the Ushering &amp; Orderliness Unit.
              </p>
              <p style="margin:0 0 12px;font-size:11px;color:#94A3B8;">
                Notification Reference: <span style="font-family:monospace;font-weight:700;color:#475569;">Ref: ${refCode}</span>
              </p>
              <p style="margin:0 0 14px;font-size:12px;line-height:18px;">
                <a href="#" style="color:#4338CA;text-decoration:none;font-weight:500;">Notification Preferences</a>
                &nbsp;&nbsp;&bull;&nbsp;&nbsp;
                <a href="${BRAND.poweredByUrl}/privacy" target="_blank" rel="noopener noreferrer" style="color:#4338CA;text-decoration:none;font-weight:500;">Privacy Policy</a>
                &nbsp;&nbsp;&bull;&nbsp;&nbsp;
                <a href="#" style="color:#4338CA;text-decoration:none;font-weight:500;">Unsubscribe</a>
              </p>
              <div style="margin-top:14px;padding-top:14px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B;">
                Powered by <a href="${BRAND.poweredByUrl}" target="_blank" rel="noopener noreferrer" style="color:#4338CA;font-weight:700;text-decoration:none;">${BRAND.poweredByName}</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

// =========================================================================
// 3. APPROVAL NOTIFICATION EMAIL TEMPLATE (Matching Screenshot 3)
// =========================================================================
export interface ApprovalNotificationEmailOptions {
  recipientName: string;
  requestTitle: string;
  requesterName: string;
  requesterRole?: string;
  requestType: string;
  effectiveDate: string;
  substituteName?: string;
  assignedStation?: string;
  justification: string;
  approveUrl: string;
  rejectUrl: string;
  referenceId?: string;
  inviterName?: string;
  inviterTitle?: string;
  inviterEmail?: string;
  inviterPhotoUrl?: string;
}

export function renderApprovalNotificationEmail(options: ApprovalNotificationEmailOptions): { subject: string; text: string; html: string } {
  const inviterName = options.inviterName || 'Ese Glory';
  const inviterTitle = options.inviterTitle || 'System Administrator';
  const inviterEmail = options.inviterEmail || 'engreseglory@gmail.com';
  const inviterPhoto = options.inviterPhotoUrl || DEFAULT_ESE_GLORY_AVATAR;

  const refCode = options.referenceId || `REQ-SWP-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const subject = `Administrative Action Required: ${options.requestTitle} (${options.requesterName})`;

  // Plain text
  const text = [
    `[SANCTUARY OPERATIONS • ADMINISTRATIVE APPROVAL]`,
    `${options.requestTitle}`,
    `========================================`,
    ``,
    `Dear ${options.recipientName},`,
    ``,
    `An operational leave / shift swap request has been submitted for review. Administrative approval is required prior to duty roster deployment.`,
    ``,
    `REQUISITION PROFILE: Ref: ${refCode}`,
    `Requester: ${options.requesterName} (${options.requesterRole || 'Sanctuary Orderliness'})`,
    `Request Type: ${options.requestType}`,
    `Effective Date: ${options.effectiveDate}`,
    options.substituteName ? `Substitute Assignee: ${options.substituteName}` : '',
    options.assignedStation ? `Assigned Station: ${options.assignedStation}` : '',
    `Justification: "${options.justification}"`,
    ``,
    `>> Approve Request: ${options.approveUrl}`,
    `>> Reject with Reason: ${options.rejectUrl}`,
    ``,
    `----------------------------------------`,
    `Operations Administration:`,
    `${inviterName}`,
    `${inviterTitle}`,
    `${inviterEmail}`,
    `----------------------------------------`,
    `Notification Reference: Ref: ${refCode}`,
    `Address: ${BRAND.churchAddress}`,
    `Map: ${BRAND.churchMapsUrl}`,
    `Privacy Policy: ${BRAND.poweredByUrl}/privacy`,
    `Powered by ${BRAND.poweredByName} (${BRAND.poweredByUrl})`,
  ].filter(Boolean).join('\n');

  // HTML
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF2F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#EEF2F6;padding:36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 36px rgba(15,23,42,0.08);border:1px solid #E2E8F0;">

          <!-- Top Navy Header -->
          <tr>
            <td style="background-color:#1E1B4B;background-image:linear-gradient(180deg, #1E1B4B 0%, #25225E 100%);padding:32px 32px 28px;text-align:center;">
              <div style="margin-bottom:16px;">
                <img src="${BRAND.churchLogoUrl}" alt="${BRAND.churchName}" height="36" style="display:inline-block;height:36px;border:0;outline:none;" />
              </div>
              <div style="display:inline-block;padding:5px 14px;background-color:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:9999px;margin-bottom:14px;">
                <span style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:#E0E7FF;text-transform:uppercase;">
                  ⚖️ SANCTUARY OPERATIONS &bull; ADMINISTRATIVE APPROVAL
                </span>
              </div>
              <h1 style="margin:0 0 8px;font-size:24px;line-height:32px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">
                ${escapeHtml(options.requestTitle)}
              </h1>
              <p style="margin:0;font-size:13px;line-height:20px;color:#A5B4FC;">
                Official Operational Notification &bull; Administrative Review
              </p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:32px 36px;">

              <p style="margin:0 0 14px;font-size:16px;line-height:24px;color:#0F172A;">
                Dear <strong>${escapeHtml(options.recipientName)}</strong>,
              </p>

              <!-- Action Callout -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:12px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <div style="font-size:13px;font-weight:800;color:#92400E;margin-bottom:2px;">
                      ⏳ Pending Administrator Review
                    </div>
                    <div style="font-size:12px;line-height:18px;color:#B45309;">
                      An operational leave / shift swap request has been submitted. Administrative approval is required prior to duty roster deployment.
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Requisition Profile -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;">
                <tr>
                  <td style="padding:14px 20px;background:#F1F5F9;border-bottom:1px solid #E2E8F0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="left" style="font-size:11px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:0.04em;">
                          REQUISITION PROFILE
                        </td>
                        <td align="right" style="font-size:11px;font-family:monospace;font-weight:700;color:#64748B;">
                          Ref: ${refCode}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 20px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <tr>
                        <td width="38%" style="font-size:12px;font-weight:700;color:#64748B;padding-bottom:10px;">Requester:</td>
                        <td style="font-size:13px;font-weight:700;color:#0F172A;padding-bottom:10px;">${escapeHtml(options.requesterName)} (${escapeHtml(options.requesterRole || 'Sanctuary Orderliness')})</td>
                      </tr>
                      <tr>
                        <td style="font-size:12px;font-weight:700;color:#64748B;padding-bottom:10px;">Request Type:</td>
                        <td style="font-size:13px;font-weight:600;color:#0F172A;padding-bottom:10px;">${escapeHtml(options.requestType)}</td>
                      </tr>
                      <tr>
                        <td style="font-size:12px;font-weight:700;color:#64748B;padding-bottom:10px;">Effective Date:</td>
                        <td style="font-size:13px;font-weight:700;color:#0F172A;padding-bottom:10px;">${escapeHtml(options.effectiveDate)}</td>
                      </tr>
                      ${
                        options.substituteName
                          ? `<tr>
                        <td style="font-size:12px;font-weight:700;color:#64748B;padding-bottom:10px;">Substitute:</td>
                        <td style="font-size:13px;font-weight:600;color:#0F172A;padding-bottom:10px;">${escapeHtml(options.substituteName)}</td>
                      </tr>`
                          : ''
                      }
                      ${
                        options.assignedStation
                          ? `<tr>
                        <td style="font-size:12px;font-weight:700;color:#64748B;padding-bottom:10px;">Station:</td>
                        <td style="font-size:13px;font-weight:600;color:#0F172A;padding-bottom:10px;">${escapeHtml(options.assignedStation)}</td>
                      </tr>`
                          : ''
                      }
                      <tr>
                        <td valign="top" style="font-size:12px;font-weight:700;color:#64748B;">Justification:</td>
                        <td style="font-size:13px;line-height:20px;color:#334155;font-style:italic;">&ldquo;${escapeHtml(options.justification)}&rdquo;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Dual CTAs (Approve / Reject) -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <table role="presentation" cellspacing="0" cellpadding="0">
                      <tr>
                        <td align="center" style="border-radius:12px;background-color:#059669;">
                          <a href="${escapeHtml(options.approveUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 30px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;box-shadow:0 4px 14px rgba(5,150,105,0.3);">
                            ✓ Approve Request
                          </a>
                        </td>
                        <td width="12"></td>
                        <td align="center" style="border-radius:12px;background-color:#DC2626;">
                          <a href="${escapeHtml(options.rejectUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:15px 26px;font-size:14px;font-weight:700;color:#FFFFFF;text-decoration:none;border-radius:12px;box-shadow:0 4px 14px rgba(220,38,38,0.3);">
                            ✕ Reject with Reason
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:0 0 24px;">

              <!-- Inviter Signature Block -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="56" valign="middle" style="padding-right:14px;">
                    <img src="${escapeHtml(inviterPhoto)}" alt="${escapeHtml(inviterName)}" width="52" height="52" style="display:block;border-radius:50%;object-fit:cover;border:2px solid #E2E8F0;" />
                  </td>
                  <td valign="middle">
                    <div style="font-size:15px;font-weight:700;color:#0F172A;line-height:20px;">
                      ${escapeHtml(inviterName)}
                    </div>
                    <div style="font-size:12px;color:#64748B;line-height:18px;">
                      ${escapeHtml(inviterTitle)}
                    </div>
                    <div style="font-size:12px;color:#4338CA;line-height:18px;">
                      <a href="mailto:${escapeHtml(inviterEmail)}" style="color:#4338CA;text-decoration:none;">${escapeHtml(inviterEmail)}</a>
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 36px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;line-height:18px;">
                <a href="${BRAND.churchMapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#334155;font-weight:700;text-decoration:underline;">
                  ${BRAND.churchName} &bull; ${BRAND.churchAddress}
                </a>
              </p>
              <p style="margin:0 0 10px;font-size:12px;line-height:18px;color:#64748B;">
                This operational dispatch is intended for authorized administrators and team leads of the Orderliness Unit.
              </p>
              <p style="margin:0 0 12px;font-size:11px;color:#94A3B8;">
                Notification Reference: <span style="font-family:monospace;font-weight:700;color:#475569;">Ref: ${refCode}</span>
              </p>
              <p style="margin:0 0 14px;font-size:12px;line-height:18px;">
                <a href="#" style="color:#4338CA;text-decoration:none;font-weight:500;">Notification Preferences</a>
                &nbsp;&nbsp;&bull;&nbsp;&nbsp;
                <a href="${BRAND.poweredByUrl}/privacy" target="_blank" rel="noopener noreferrer" style="color:#4338CA;text-decoration:none;font-weight:500;">Privacy Policy</a>
                &nbsp;&nbsp;&bull;&nbsp;&nbsp;
                <a href="#" style="color:#4338CA;text-decoration:none;font-weight:500;">Unsubscribe</a>
              </p>
              <div style="margin-top:14px;padding-top:14px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B;">
                Powered by <a href="${BRAND.poweredByUrl}" target="_blank" rel="noopener noreferrer" style="color:#4338CA;font-weight:700;text-decoration:none;">${BRAND.poweredByName}</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

// =========================================================================
// 4. GENERAL INFORMATION & BULLETIN EMAIL TEMPLATE (Matching Screenshot 4)
// =========================================================================
export interface BulletinDispatchEmailOptions {
  recipientName: string;
  issueTitle?: string;
  seasonSubtitle?: string;
  leadMessage?: string;
  protocols?: { title: string; desc: string; icon?: string }[];
  trainingEvent?: { title: string; timeAndVenue: string; ctaUrl?: string };
  appReleaseNotes?: string[];
  milestones?: { date: string; title: string; tag?: string }[];
  handbookDownloadUrl?: string;
  referenceId?: string;
  inviterName?: string;
  inviterTitle?: string;
  inviterEmail?: string;
  inviterPhotoUrl?: string;
}

export function renderBulletinDispatchEmail(options: BulletinDispatchEmailOptions): { subject: string; text: string; html: string } {
  const inviterName = options.inviterName || 'Ese Glory';
  const inviterTitle = options.inviterTitle || 'System Administrator';
  const inviterEmail = options.inviterEmail || 'engreseglory@gmail.com';
  const inviterPhoto = options.inviterPhotoUrl || DEFAULT_ESE_GLORY_AVATAR;

  const refCode = options.referenceId || `TFHC-ORD-BUL-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  const issueTitle = options.issueTitle || 'Orderliness Monthly Operations Dispatch';
  const seasonSubtitle = options.seasonSubtitle || 'Service Operations Briefing • Protocol Updates';
  const leadMessage =
    options.leadMessage ||
    'As we prepare for our upcoming services and church events, we are coordinating all ushering and orderliness team members across their assigned zones. Our focus remains on excellence in hospitality, smooth sanctuary coordination, and ensuring well-organized church services. Please review the operational briefing items below.';

  const protocols = options.protocols || [
    {
      title: 'Altar & Communion Flow',
      desc: 'Row-by-row usher guide: Aisle 1 & 4 release first, followed by central nave.',
      icon: '🍷',
    },
    {
      title: 'Exit Coordination & Dismissal',
      desc: 'Order of dismissal protocol with rear sanctuary marshaling.',
      icon: '🚪',
    },
  ];

  const milestones = options.milestones || [
    { date: 'Sunday, 1st Service', title: 'Service Operations Briefing', tag: 'All Team' },
    { date: 'Upcoming Saturday', title: 'Annual Uniform & Badge Inspection', tag: 'Mandatory' },
    { date: 'Annual Celebration', title: 'Harvest Thanksgiving Service', tag: 'Special Service' },
  ];

  const subject = `${BRAND.churchName}: ${issueTitle} (${seasonSubtitle})`;

  // Plain text
  const text = [
    `[${BRAND.churchName.toUpperCase()} • USHERING & ORDERLINESS OPERATIONS]`,
    `${issueTitle}`,
    `${seasonSubtitle}`,
    `========================================`,
    ``,
    `Dear ${options.recipientName},`,
    ``,
    `Operations Briefing • ${inviterName}:`,
    leadMessage,
    ``,
    `--- 1. PROTOCOLS & SERVICE FLOW GUIDELINES ---`,
    ...protocols.map((p) => `- ${p.title}: ${p.desc}`),
    ``,
    options.trainingEvent
      ? `--- 2. MANDATORY TEAM TRAINING SESSION ---\n${options.trainingEvent.title} (${options.trainingEvent.timeAndVenue})\n>> Confirm: ${options.trainingEvent.ctaUrl || '#'}\n`
      : '',
    `--- 3. KEY DATES & OPERATIONAL MILESTONES ---`,
    ...milestones.map((m) => `- ${m.date}: ${m.title} [${m.tag || 'Notice'}]`),
    ``,
    options.handbookDownloadUrl ? `>> Download Handbook: ${options.handbookDownloadUrl}\n` : '',
    `----------------------------------------`,
    `Unit Administration:`,
    `${inviterName}`,
    `${inviterTitle}`,
    `${inviterEmail}`,
    `----------------------------------------`,
    `Notification Reference: Ref: ${refCode}`,
    `Address: ${BRAND.churchAddress}`,
    `Map: ${BRAND.churchMapsUrl}`,
    `Privacy Policy: ${BRAND.poweredByUrl}/privacy`,
    `Powered by ${BRAND.poweredByName} (${BRAND.poweredByUrl})`,
  ].filter(Boolean).join('\n');

  // HTML
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#EEF2F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#EEF2F6;padding:36px 16px;">
    <tr>
      <td align="center">
        <!-- Main Container -->
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 36px rgba(15,23,42,0.08);border:1px solid #E2E8F0;">

          <!-- Top Navy Header -->
          <tr>
            <td style="background-color:#1E1B4B;background-image:linear-gradient(180deg, #1E1B4B 0%, #25225E 100%);padding:32px 32px 28px;text-align:center;">
              <div style="margin-bottom:16px;">
                <img src="${BRAND.churchLogoUrl}" alt="${BRAND.churchName}" height="36" style="display:inline-block;height:36px;border:0;outline:none;" />
              </div>
              <div style="display:inline-block;padding:5px 14px;background-color:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:9999px;margin-bottom:14px;">
                <span style="font-size:11px;font-weight:800;letter-spacing:0.06em;color:#E0E7FF;text-transform:uppercase;">
                  📋 ${escapeHtml(BRAND.churchName.toUpperCase())} &bull; ORDERLINESS OPERATIONS
                </span>
              </div>
              <h1 style="margin:0 0 8px;font-size:24px;line-height:32px;font-weight:800;color:#FFFFFF;letter-spacing:-0.02em;">
                ${escapeHtml(issueTitle)}
              </h1>
              <p style="margin:0;font-size:13px;line-height:20px;color:#A5B4FC;">
                ${escapeHtml(seasonSubtitle)}
              </p>
            </td>
          </tr>

          <!-- Main Body -->
          <tr>
            <td style="padding:32px 36px;">

              <!-- Lead Note Box with Photo -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:16px;">
                <tr>
                  <td width="48" valign="top" style="padding-right:12px;">
                    <img src="${escapeHtml(inviterPhoto)}" alt="${escapeHtml(inviterName)}" width="44" height="44" style="display:block;border-radius:50%;object-fit:cover;border:2px solid #E2E8F0;" />
                  </td>
                  <td valign="top">
                    <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:4px;">
                      Operations Briefing &bull; ${escapeHtml(inviterName)}
                    </div>
                    <div style="font-size:13px;line-height:20px;color:#475569;">
                      ${escapeHtml(leadMessage)}
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Section 1: Protocols & Guidelines -->
              <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#4338CA;letter-spacing:0.05em;margin-bottom:12px;">
                1. Protocols &amp; Service Flow Guidelines
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <tr>
                  ${protocols
                    .map(
                      (p) => `
                    <td width="48%" valign="top" style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:14px;">
                      <div style="font-size:20px;margin-bottom:6px;">${p.icon || '📌'}</div>
                      <div style="font-size:13px;font-weight:700;color:#0F172A;margin-bottom:4px;">${escapeHtml(p.title)}</div>
                      <div style="font-size:11px;line-height:16px;color:#64748B;">${escapeHtml(p.desc)}</div>
                    </td>`,
                    )
                    .join('<td width="4%"></td>')}
                </tr>
              </table>

              <!-- Section 2: Training (Optional) -->
              ${
                options.trainingEvent
                  ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:14px;padding:16px 20px;">
                <tr>
                  <td valign="middle">
                    <div style="font-size:11px;font-weight:800;color:#92400E;text-transform:uppercase;margin-bottom:2px;">
                      2. Mandatory Team Training Session
                    </div>
                    <div style="font-size:14px;font-weight:800;color:#78350F;margin-bottom:2px;">
                      ${escapeHtml(options.trainingEvent.title)}
                    </div>
                    <div style="font-size:12px;color:#92400E;">
                      ${escapeHtml(options.trainingEvent.timeAndVenue)}
                    </div>
                  </td>
                  <td align="right" valign="middle">
                    <a href="${escapeHtml(options.trainingEvent.ctaUrl || '#')}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 18px;font-size:12px;font-weight:700;color:#FFFFFF;background:#4338CA;border-radius:8px;text-decoration:none;">
                      Confirm
                    </a>
                  </td>
                </tr>
              </table>`
                  : ''
              }

              <!-- Section 3: Key Dates & Milestones -->
              <div style="font-size:12px;font-weight:800;text-transform:uppercase;color:#4338CA;letter-spacing:0.05em;margin-bottom:12px;">
                3. Key Dates &amp; Operational Milestones
              </div>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;overflow:hidden;">
                ${milestones
                  .map(
                    (m, idx) => `
                  <tr>
                    <td style="padding:12px 18px;border-bottom:${idx < milestones.length - 1 ? '1px solid #E2E8F0' : 'none'};">
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr>
                          <td width="40%" style="font-size:12px;font-weight:700;color:#64748B;">
                            ${escapeHtml(m.date)}
                          </td>
                          <td style="font-size:13px;font-weight:700;color:#0F172A;">
                            ${escapeHtml(m.title)}
                          </td>
                          <td align="right">
                            <span style="font-size:10px;font-weight:800;padding:3px 8px;border-radius:6px;background:#EEF2FF;color:#4338CA;">
                              ${escapeHtml(m.tag || 'Service')}
                            </span>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>`,
                  )
                  .join('')}
              </table>

              <!-- Handbook Download Button -->
              ${
                options.handbookDownloadUrl
                  ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:28px;">
                <tr>
                  <td align="center">
                    <a href="${escapeHtml(options.handbookDownloadUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:14px;font-weight:700;color:#FFFFFF;background:#4338CA;border-radius:12px;text-decoration:none;box-shadow:0 4px 14px rgba(67,56,202,0.35);">
                      📥 Download 2026 Ushering Handbook (PDF) &rarr;
                    </a>
                  </td>
                </tr>
              </table>`
                  : ''
              }

              <!-- Divider -->
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:0 0 24px;">

              <!-- Inviter Signature Block -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="56" valign="middle" style="padding-right:14px;">
                    <img src="${escapeHtml(inviterPhoto)}" alt="${escapeHtml(inviterName)}" width="52" height="52" style="display:block;border-radius:50%;object-fit:cover;border:2px solid #E2E8F0;" />
                  </td>
                  <td valign="middle">
                    <div style="font-size:15px;font-weight:700;color:#0F172A;line-height:20px;">
                      ${escapeHtml(inviterName)}
                    </div>
                    <div style="font-size:12px;color:#64748B;line-height:18px;">
                      ${escapeHtml(inviterTitle)}
                    </div>
                    <div style="font-size:12px;color:#4338CA;line-height:18px;">
                      <a href="mailto:${escapeHtml(inviterEmail)}" style="color:#4338CA;text-decoration:none;">${escapeHtml(inviterEmail)}</a>
                    </div>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:28px 36px;background-color:#F8FAFC;border-top:1px solid #E2E8F0;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;line-height:18px;">
                <a href="${BRAND.churchMapsUrl}" target="_blank" rel="noopener noreferrer" style="color:#334155;font-weight:700;text-decoration:underline;">
                  ${BRAND.churchName} &bull; ${BRAND.churchAddress}
                </a>
              </p>
              <p style="margin:0 0 10px;font-size:12px;line-height:18px;color:#64748B;">
                You are receiving this official operational bulletin as an active team member of the Ushering &amp; Orderliness Unit.
              </p>
              <p style="margin:0 0 12px;font-size:11px;color:#94A3B8;">
                Notification Reference: <span style="font-family:monospace;font-weight:700;color:#475569;">Ref: ${refCode}</span>
              </p>
              <p style="margin:0 0 14px;font-size:12px;line-height:18px;">
                <a href="#" style="color:#4338CA;text-decoration:none;font-weight:500;">Notification Preferences</a>
                &nbsp;&nbsp;&bull;&nbsp;&nbsp;
                <a href="${BRAND.poweredByUrl}/privacy" target="_blank" rel="noopener noreferrer" style="color:#4338CA;text-decoration:none;font-weight:500;">Privacy Policy</a>
                &nbsp;&nbsp;&bull;&nbsp;&nbsp;
                <a href="#" style="color:#4338CA;text-decoration:none;font-weight:500;">Unsubscribe</a>
              </p>
              <div style="margin-top:14px;padding-top:14px;border-top:1px solid #E2E8F0;font-size:12px;color:#64748B;">
                Powered by <a href="${BRAND.poweredByUrl}" target="_blank" rel="noopener noreferrer" style="color:#4338CA;font-weight:700;text-decoration:none;">${BRAND.poweredByName}</a>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

// =========================================================================
// STANDARD COMPATIBILITY EMAIL WRAPPERS
// =========================================================================

/** "Verify your email" — sent when a member self-registers with a password. */
export function renderVerificationEmail(firstName: string, verifyUrl: string) {
  return renderBrandedEmail({
    category: 'notification',
    heading: 'Confirm your email address',
    preview: 'Confirm your email to finish setting up your TFHC Orderliness account.',
    recipientName: firstName,
    paragraphs: [
      'Thanks for registering for TFHC Orderliness. Confirm this email address to activate your account and sign in.',
      "If you didn't create an account, you can ignore this message.",
    ],
    cta: { label: 'Confirm email address', url: verifyUrl },
    footnote: 'This link expires in 24 hours. You can request a new one from the sign-in page.',
  });
}

/** "Reset your password" — sent from the forgot-password flow. */
export function renderPasswordResetEmail(firstName: string, resetUrl: string) {
  return renderBrandedEmail({
    category: 'reminder',
    heading: 'Reset your password',
    preview: 'Use the link below to choose a new password.',
    recipientName: firstName,
    paragraphs: [
      'We received a request to reset the password on your TFHC Orderliness account. Choose a new password using the button below.',
      "If you didn't request this, no action is needed — your password stays the same.",
    ],
    cta: { label: 'Choose a new password', url: resetUrl },
    footnote: 'This link expires in 1 hour and can only be used once.',
  });
}

export function renderNotificationEmail(options: {
  recipientName: string;
  title: string;
  message: string;
  additionalInfo?: string;
  ctaUrl?: string;
  ctaLabel?: string;
  metadata?: { label: string; value: string }[];
}) {
  const paragraphs = [options.message];
  if (options.additionalInfo) {
    paragraphs.push(options.additionalInfo);
  }

  return renderBrandedEmail({
    category: 'notification',
    heading: options.title,
    preview: options.message.slice(0, 120),
    recipientName: options.recipientName,
    paragraphs,
    details: options.metadata,
    cta: options.ctaUrl ? { label: options.ctaLabel || 'View Details', url: options.ctaUrl } : undefined,
  });
}

export function renderReminderEmail(options: {
  recipientName: string;
  eventTitle: string;
  timeAndVenue: string;
  reminderMessage: string;
  actionUrl?: string;
  actionLabel?: string;
  details?: { label: string; value: string }[];
}) {
  return renderRosterReminderEmail({
    recipientName: options.recipientName,
    serviceTitle: options.eventTitle,
    callTime: options.timeAndVenue,
    confirmUrl: options.actionUrl,
  });
}

export function renderAlertEmail(options: {
  recipientName: string;
  alertHeadline: string;
  alertBody: string;
  urgencyNote?: string;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: { label: string; value: string }[];
}) {
  const paragraphs = [options.alertBody];
  if (options.urgencyNote) {
    paragraphs.push(options.urgencyNote);
  }

  return renderBrandedEmail({
    category: 'alert',
    heading: options.alertHeadline,
    preview: `Urgent Alert: ${options.alertHeadline}`,
    recipientName: options.recipientName,
    paragraphs,
    details: options.metadata,
    cta: options.actionUrl ? { label: options.actionLabel || 'Respond to Alert', url: options.actionUrl, tone: 'danger' } : undefined,
  });
}

export function renderWarningEmail(options: {
  recipientName: string;
  warningSubject: string;
  warningDetails: string;
  correctiveAction: string;
  deadlineDate?: string;
  resolutionUrl?: string;
  metadata?: { label: string; value: string }[];
}) {
  const paragraphs = [
    options.warningDetails,
    `Required Action: ${options.correctiveAction}`,
  ];
  if (options.deadlineDate) {
    paragraphs.push(`Please complete this resolution before ${options.deadlineDate}.`);
  }

  return renderBrandedEmail({
    category: 'warning',
    heading: options.warningSubject,
    preview: `Notice: ${options.warningSubject}`,
    recipientName: options.recipientName,
    paragraphs,
    details: options.metadata,
    cta: options.resolutionUrl ? { label: 'Resolve in Portal', url: options.resolutionUrl, tone: 'danger' } : undefined,
  });
}

export function renderApprovalEmail(options: {
  recipientName: string;
  decisionTitle: string;
  status: 'APPROVED' | 'REJECTED' | 'PENDING_REVIEW';
  summaryMessage: string;
  reviewerNotes?: string;
  portalUrl?: string;
  details?: { label: string; value: string }[];
}) {
  return renderApprovalNotificationEmail({
    recipientName: options.recipientName,
    requestTitle: options.decisionTitle,
    requesterName: options.recipientName,
    requestType: options.decisionTitle,
    effectiveDate: new Date().toLocaleDateString(),
    justification: options.summaryMessage,
    approveUrl: options.portalUrl || '#',
    rejectUrl: options.portalUrl ? `${options.portalUrl}?reject=1` : '#',
  });
}

export function renderQueryEmail(options: {
  recipientName: string;
  querySubject: string;
  queryMessage: string;
  senderName: string;
  responseUrl?: string;
  details?: { label: string; value: string }[];
}) {
  return renderMemberQueryAvailabilityEmail({
    recipientName: options.recipientName,
    eventName: options.querySubject,
    eventDescription: options.queryMessage,
    actionUrl: options.responseUrl || '#',
  });
}
