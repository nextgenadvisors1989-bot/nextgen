/**
 * Public contact form handling: persist the enquiry, thank the sender, and
 * alert the administrators so nothing sits unread.
 */
import { insert, query, type RowDataPacket } from '@/lib/db/mysql';
import { contactEnquirySchema } from '@/lib/validations/contact.validation';
import { sendEmail } from '@/lib/integrations/email-provider';
import { notifyMany, usersWithRole } from '@/lib/notifications/notification-service';
import { escapeHtml } from '@/lib/utils/formatting';
import { APP_NAME, APP_URL, COMPANY_LEGAL } from '@/lib/utils/constants';

/**
 * The form posts lowercase keys; the column is an ENUM with display values. An unmapped key is
 * silently stored as '' by MariaDB outside strict mode, so every key is translated explicitly.
 */
const ENQUIRY_TYPE_COLUMN: Record<string, string> = {
  demo: 'Demo Request', sales: 'Sales', support: 'Support', partnership: 'Partnership', careers: 'Careers', other: 'General',
};

export interface ContactSubmitContext {
  ip?: string | null;
  userAgent?: string | null;
  sourcePage?: string;
}

export async function submitContactEnquiry(input: unknown, context: ContactSubmitContext = {}) {
  const parsed = contactEnquirySchema.parse(input);

  // Honeypot tripped — accept silently so the bot does not retry, but store nothing.
  if (parsed.website) {
    return { enquiryId: null, spam: true as const };
  }

  const enquiryId = await insert(
    `INSERT INTO contact_enquiries
       (name, email, mobile, company_name, subject, message, enquiry_type, source_page, status, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
    [
      parsed.name, parsed.email, parsed.mobile, parsed.company_name, parsed.subject,
      parsed.message, ENQUIRY_TYPE_COLUMN[parsed.enquiry_type] ?? 'General', context.sourcePage ?? '/contact', context.ip ?? null,
    ]
  );

  const adminIds = await usersWithRole('admin');
  const adminEmails = await query<{ email: string } & RowDataPacket>(
    `SELECT u.email
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE r.slug IN ('admin', 'super_admin') AND u.deleted_at IS NULL AND u.status = 'active'
      ORDER BY u.email`
  );

  // Internal alert (in-app + email) so an administrator picks it up quickly.
  if (adminIds.length) {
    await notifyMany(adminIds, {
      title: `New ${parsed.enquiry_type} enquiry`,
      message: `${parsed.name}${parsed.company_name ? ` (${parsed.company_name})` : ''} — ${parsed.subject}`,
      type: 'info',
      category: 'SYSTEM',
      actionUrl: `/admin/contact-enquiries/${enquiryId}`,
      actionLabel: 'Open enquiry',
      entityType: 'contact_enquiry',
      entityId: enquiryId,
      channels: ['in_app', 'email'],
    });
  }

  if (adminEmails.length) {
    await sendEmail({
      to: adminEmails.map((row) => row.email),
      subject: `[${APP_NAME}] New ${parsed.enquiry_type} enquiry — ${parsed.subject}`,
      html: internalEnquiryHtml(parsed as Record<string, unknown>, enquiryId),
      templateCode: 'contact.enquiry.internal',
      entityType: 'contact_enquiry',
      entityId: enquiryId,
    });
  }

  // Acknowledgement to the person who wrote in.
  await sendEmail({
    to: parsed.email,
    subject: `We have received your enquiry — ${APP_NAME}`,
    html: acknowledgementHtml(parsed.name, parsed.subject),
    templateCode: 'contact.enquiry.acknowledgement',
    entityType: 'contact_enquiry',
    entityId: enquiryId,
  });

  return { enquiryId, spam: false as const };
}

function acknowledgementHtml(name: string, subject: string): string {
  return shell(`
    <p>Dear ${escapeHtml(name)},</p>
    <p>Thank you for contacting ${escapeHtml(APP_NAME)}. We have received your enquiry about
       <strong>${escapeHtml(subject)}</strong> and a member of our team will respond within one working day.</p>
    <p>If your requirement is urgent, call us on ${escapeHtml(COMPANY_LEGAL.phone)} during business hours
       (Monday to Saturday, 9:30 am to 6:30 pm IST).</p>
    <p class="muted">This is an automated acknowledgement — please reply to this email if you need to add anything
       to your enquiry.</p>`);
}

function internalEnquiryHtml(input: Record<string, unknown>, enquiryId: number): string {
  return shell(`
    <p>A new enquiry has been submitted from the public website.</p>
    <table>
      <tr><th style="width:30%">Enquiry ID</th><td>#${enquiryId}</td></tr>
      <tr><th>Type</th><td>${escapeHtml(String(input.enquiry_type ?? 'demo'))}</td></tr>
      <tr><th>Name</th><td>${escapeHtml(String(input.name ?? ''))}</td></tr>
      <tr><th>Company</th><td>${escapeHtml(String(input.company_name ?? '—'))}</td></tr>
      <tr><th>Email</th><td>${escapeHtml(String(input.email ?? ''))}</td></tr>
      <tr><th>Mobile</th><td>${escapeHtml(String(input.mobile ?? '—'))}</td></tr>
      <tr><th>Subject</th><td>${escapeHtml(String(input.subject ?? ''))}</td></tr>
      <tr><th>Message</th><td>${escapeHtml(String(input.message ?? '')).replace(/\n/g, '<br />')}</td></tr>
    </table>
    <a href="${APP_URL}/admin/contact-enquiries/${enquiryId}" class="button">Open in the admin panel</a>`);
}

/** Shared HTML shell — matches the styling of the templated notification emails. */
function shell(inner: string): string {
  return `<!doctype html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { margin:0; padding:0; background:#f5f5f5; font-family: system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:#1e293b; }
  .wrapper { max-width:600px; margin:0 auto; padding:24px 16px; }
  .card { background:#ffffff; border-radius:8px; border:1px solid #e2e8f0; overflow:hidden; }
  .header { background:#1e293b; color:#ffffff; padding:20px 24px; font-size:18px; font-weight:600; }
  .body { padding:24px; font-size:14px; line-height:1.7; }
  table { border-collapse:collapse; width:100%; margin:16px 0; }
  th, td { border:1px solid #e2e8f0; padding:8px 10px; text-align:left; font-size:13px; }
  th { background:#f8fafc; }
  .button { display:inline-block; background:#3b82f6; color:#ffffff !important; padding:10px 18px; border-radius:8px; text-decoration:none; font-weight:600; margin-top:12px; }
  .muted { color:#64748b; font-size:12px; }
  .footer { padding:18px 24px; font-size:12px; color:#64748b; border-top:1px solid #e2e8f0; }
</style></head>
<body><div class="wrapper"><div class="card">
  <div class="header">${escapeHtml(APP_NAME)}</div>
  <div class="body">${inner}</div>
  <div class="footer">${escapeHtml(COMPANY_LEGAL.name)}<br />${escapeHtml(COMPANY_LEGAL.address)}<br />
    ${escapeHtml(COMPANY_LEGAL.email)} · ${escapeHtml(COMPANY_LEGAL.phone)}</div>
</div></div></body></html>`;
}
