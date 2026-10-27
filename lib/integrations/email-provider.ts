/**
 * Email transport: SMTP (SMTP / SendGrid / Office365) with DB-backed config.
 * Falls back to a "log-only" transport when SMTP is not configured, so the
 * platform stays fully usable in development without sending real mail.
 */
import nodemailer, { type Transporter } from 'nodemailer';
import { queryOne, execute, type RowDataPacket } from '@/lib/db/mysql';
import { decryptSecret } from '@/lib/integrations/crypto';

export interface EmailAttachment {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  attachments?: EmailAttachment[];
  from?: string;
  replyTo?: string;
  templateCode?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  sentBy?: number | null;
}

export interface EmailConfig {
  host: string | null;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromEmail: string | null;
  fromName: string | null;
  replyTo: string | null;
  enabled: boolean;
}

let cachedTransport: { key: string; transporter: Transporter } | null = null;

/** Settings row wins over environment variables (admin-editable at runtime). */
export async function getEmailConfig(): Promise<EmailConfig> {
  const rows = await import('@/lib/db/mysql').then((m) =>
    m.query<RowDataPacket>(
      `SELECT setting_key, setting_value, is_encrypted FROM settings
        WHERE setting_group = 'email'`
    )
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    const value = row.is_encrypted ? decryptSecret(String(row.setting_value ?? '')) : String(row.setting_value ?? '');
    map.set(String(row.setting_key), value);
  }

  const host = map.get('smtp_host') || process.env.SMTP_HOST || null;
  const password = map.get('smtp_password') || process.env.SMTP_PASSWORD || null;

  return {
    host,
    port: Number(map.get('smtp_port') || process.env.SMTP_PORT || 587),
    secure: (map.get('smtp_secure') ?? process.env.SMTP_SECURE ?? 'false') === 'true',
    username: map.get('smtp_username') || process.env.SMTP_USERNAME || null,
    password,
    fromEmail: map.get('from_email') || process.env.SMTP_FROM_EMAIL || 'noreply@localhost',
    fromName: map.get('from_name') || process.env.SMTP_FROM_NAME || 'ComplianceOS',
    replyTo: map.get('reply_to') || process.env.SMTP_REPLY_TO || null,
    enabled: (map.get('enabled') ?? 'true') === 'true',
  };
}

async function getTransport(config: EmailConfig): Promise<Transporter | null> {
  // Treat template placeholders as "not configured" so dev never blocks on SMTP.
  const configured = Boolean(config.host && config.password && !config.password.includes('xxxx'));
  if (!configured || !config.enabled) return null;

  const key = `${config.host}:${config.port}:${config.username}:${config.secure}`;
  if (cachedTransport?.key === key) return cachedTransport.transporter;

  const transporter = nodemailer.createTransport({
    host: config.host as string,
    port: config.port,
    secure: config.secure,
    auth: config.username ? { user: config.username, pass: config.password as string } : undefined,
    pool: true,
    maxConnections: 3,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
  });

  cachedTransport = { key, transporter };
  return transporter;
}

export interface SendEmailResult {
  ok: boolean;
  messageId: string | null;
  provider: string;
  error?: string;
  logId: number;
}

/** Sends an email and always writes to email_logs (sent, failed or simulated). */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = await getEmailConfig();
  const to = Array.isArray(input.to) ? input.to.join(',') : input.to;
  const cc = input.cc ? (Array.isArray(input.cc) ? input.cc.join(',') : input.cc) : null;
  const bcc = input.bcc ? (Array.isArray(input.bcc) ? input.bcc.join(',') : input.bcc) : null;
  const from = input.from || (config.fromName ? `"${config.fromName}" <${config.fromEmail}>` : String(config.fromEmail ?? ''));

  const logId = await execute(
    `INSERT INTO email_logs (to_email, cc_email, bcc_email, from_email, subject, body_html, template_code,
                             entity_type, entity_id, attachments_json, status, provider, sent_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    [
      to.slice(0, 1000), cc, bcc, from, input.subject.slice(0, 500), input.html,
      input.templateCode ?? null, input.entityType ?? null, input.entityId ?? null,
      input.attachments ? JSON.stringify(input.attachments.map((a) => ({ filename: a.filename, contentType: a.contentType }))) : null,
      config.host ? 'smtp' : 'simulated',
      input.sentBy ?? null,
    ]
  ).then((r) => r.insertId);

  try {
    const transporter = await getTransport(config);
    if (!transporter) {
      await execute(
        `UPDATE email_logs SET status = 'sent', provider = 'simulated', message_id = ?, sent_at = NOW()
          WHERE id = ?`,
        [`simulated-${logId}`, logId]
      );
      console.log(`[email:simulated] to=${to} subject="${input.subject}" (SMTP not configured)`);
      return { ok: true, messageId: `simulated-${logId}`, provider: 'simulated', logId };
    }

    const info: { messageId?: string } = await transporter.sendMail({
      from,
      to,
      cc: cc ?? undefined,
      bcc: bcc ?? undefined,
      subject: input.subject,
      html: input.html,
      text: input.text ?? stripHtml(input.html),
      attachments: input.attachments,
      replyTo: input.replyTo || config.replyTo || undefined,
    });

    await execute(
      `UPDATE email_logs SET status = 'sent', message_id = ?, sent_at = NOW() WHERE id = ?`,
      [info.messageId ?? null, logId]
    );
    return { ok: true, messageId: info.messageId ?? null, provider: 'smtp', logId };
  } catch (error) {
    const message = (error as Error).message;
    await execute(
      `UPDATE email_logs SET status = 'failed', error_message = ?, sent_at = NOW() WHERE id = ?`,
      [message.slice(0, 2000), logId]
    );
    console.error(`[email:failed] to=${to} subject="${input.subject}" error=${message}`);
    return { ok: false, messageId: null, provider: 'smtp', error: message, logId };
  }
}

/** Verifies SMTP credentials without sending — powers the "Test Email" button. */
export async function verifyEmailConnection(): Promise<{ ok: boolean; message: string }> {
  const config = await getEmailConfig();
  try {
    const transporter = await getTransport(config);
    if (!transporter) {
      return { ok: false, message: 'SMTP is not configured yet. Fill in the host and password, then save.' };
    }
    await transporter.verify();
    return { ok: true, message: `SMTP connection to ${config.host}:${config.port} verified successfully` };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}

/**
 * Drops the pooled SMTP connection. Called after the email settings change so the
 * next send rebuilds the transport from the new host and credentials instead of
 * reusing a pool that was opened with the old ones.
 */
export function resetEmailTransportCache() {
  if (cachedTransport) {
    try {
      cachedTransport.transporter.close();
    } catch {
      /* the pool may already be closed — nothing to do */
    }
  }
  cachedTransport = null;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|tr|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
