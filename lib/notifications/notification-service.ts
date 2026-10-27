/**
 * Notification orchestrator. One call fans out to in-app, email, SMS and
 * WhatsApp according to the recipient's saved preferences, and every dispatch is
 * recorded in notification_logs.
 */
import { randomUUID } from 'node:crypto';
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { sendEmail } from '@/lib/integrations/email-provider';
import { sendSms } from '@/lib/integrations/sms-provider';
import { sendWhatsApp } from '@/lib/integrations/whatsapp-provider';
import { getTemplate, renderTemplate } from './notification-templates';
import { APP_NAME, APP_URL, COMPANY_LEGAL } from '@/lib/utils/constants';

export type NotificationChannel = 'in_app' | 'email' | 'sms' | 'whatsapp';

export interface NotifyInput {
  userId: number;
  title: string;
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | 'action_required';
  category?: 'AUDIT' | 'REPORT' | 'PAYROLL' | 'COMPLIANCE' | 'EMPLOYEE' | 'EMPLOYER' | 'ACCOUNT' | 'SYSTEM' | 'REMINDER';
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  actionUrl?: string | null;
  actionLabel?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  channels?: NotificationChannel[];
  /** Template code for the outbound channels (email/sms/whatsapp). */
  templateCode?: string;
  templateData?: Record<string, unknown>;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export interface NotifyResult {
  notificationId: number;
  delivered: Record<NotificationChannel, boolean>;
  errors: string[];
}

/** Default channel routing per category when the caller doesn't specify. */
const CATEGORY_CHANNELS: Record<string, NotificationChannel[]> = {
  ACCOUNT: ['in_app', 'email', 'sms', 'whatsapp'],
  AUDIT: ['in_app', 'email', 'whatsapp'],
  REPORT: ['in_app', 'email'],
  PAYROLL: ['in_app', 'email', 'sms'],
  COMPLIANCE: ['in_app', 'email', 'whatsapp'],
  LEAVE: ['in_app', 'email', 'sms'],
  EMPLOYEE: ['in_app', 'email'],
  EMPLOYER: ['in_app', 'email'],
  SYSTEM: ['in_app'],
  REMINDER: ['in_app', 'email'],
};

export async function getUserPreferences(userId: number): Promise<Map<string, Record<NotificationChannel, boolean>>> {
  const rows = await query<RowDataPacket>(
    `SELECT category, in_app, email, sms, whatsapp FROM notification_preferences WHERE user_id = ?`,
    [userId]
  );
  const map = new Map<string, Record<NotificationChannel, boolean>>();
  for (const row of rows) {
    map.set(String(row.category), {
      in_app: Boolean(row.in_app),
      email: Boolean(row.email),
      sms: Boolean(row.sms),
      whatsapp: Boolean(row.whatsapp),
    });
  }
  return map;
}

interface RecipientRow extends RowDataPacket {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  mobile: string | null;
}

/**
 * Sends a notification across every requested channel that the user's
 * preferences allow, and writes an audit row per channel attempt.
 */
export async function notifyUser(input: NotifyInput): Promise<NotifyResult> {
  const category = input.category ?? 'SYSTEM';
  const requested = input.channels ?? CATEGORY_CHANNELS[category] ?? ['in_app'];
  const preferences = await getUserPreferences(input.userId);
  const pref = preferences.get(category);

  const channels = requested.filter((channel) => {
    if (channel === 'in_app') return true; // always keep the in-app record
    if (!pref) return channel === 'email'; // sensible default: email only
    return pref[channel];
  });

  const delivered: Record<NotificationChannel, boolean> = { in_app: false, email: false, sms: false, whatsapp: false };
  const errors: string[] = [];

  const notificationId = await insert(
    `INSERT INTO notifications (uuid, user_id, title, message, type, category, priority, action_url,
                                action_label, entity_type, entity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(), input.userId, input.title.slice(0, 255), input.message, input.type ?? 'info',
      category, input.priority ?? 'normal', input.actionUrl ?? null, input.actionLabel ?? null,
      input.entityType ?? null, input.entityId ?? null,
    ]
  );
  delivered.in_app = true;

  const shouldSendExternally = channels.some((c) => c !== 'in_app');
  if (!shouldSendExternally) {
    return { notificationId, delivered, errors };
  }

  const recipient = await queryOne<RecipientRow>(
    'SELECT id, email, first_name, last_name, mobile FROM users WHERE id = ?',
    [input.userId]
  );
  if (!recipient) {
    errors.push('Recipient user not found');
    return { notificationId, delivered, errors };
  }

  const template = input.templateCode ? getTemplate(input.templateCode) : null;
  const templateData: Record<string, unknown> = {
    platform_name: APP_NAME,
    login_url: `${APP_URL}/login`,
    recipient_name: `${recipient.first_name} ${recipient.last_name}`.trim(),
    company_address: COMPANY_LEGAL.address,
    company_email: COMPANY_LEGAL.email,
    company_phone: COMPANY_LEGAL.phone,
    ...(input.templateData ?? {}),
  };

  for (const channel of channels) {
    if (channel === 'in_app') continue;

    let status: 'sent' | 'failed' = 'sent';
    let providerMessageId: string | null = null;
    let errorMessage: string | null = null;

    try {
      if (channel === 'email') {
        const subject = template?.subject ? renderTemplate(template.subject, templateData) : input.title;
        const html = template ? renderTemplate(template.body, templateData) : simpleEmail(input.title, input.message, input.actionUrl);
        const result = await sendEmail({
          to: recipient.email,
          subject,
          html,
          templateCode: template?.code ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          attachments: input.attachments,
        });
        status = result.ok ? 'sent' : 'failed';
        providerMessageId = result.messageId;
        errorMessage = result.error ?? null;
      } else if (channel === 'sms') {
        if (!recipient.mobile) throw new Error('Recipient has no mobile number on file');
        const body = template ? renderTemplate(template.body, templateData) : `${input.title}: ${input.message}`;
        const result = await sendSms({
          to: recipient.mobile,
          message: body,
          templateCode: template?.code ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
        });
        status = result.ok ? 'sent' : 'failed';
        providerMessageId = result.messageId;
        errorMessage = result.error ?? null;
        await execute('UPDATE notifications SET sms_sent = ? WHERE id = ?', [result.ok ? 1 : 0, notificationId]);
      } else if (channel === 'whatsapp') {
        if (!recipient.mobile) throw new Error('Recipient has no mobile number on file');
        const body = template ? renderTemplate(template.body, templateData) : `${input.title}\n\n${input.message}`;
        const result = await sendWhatsApp({
          to: recipient.mobile,
          message: body,
          templateCode: template?.code ?? null,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
        });
        status = result.ok ? 'sent' : 'failed';
        providerMessageId = result.messageId;
        errorMessage = result.error ?? null;
        await execute('UPDATE notifications SET whatsapp_sent = ? WHERE id = ?', [result.ok ? 1 : 0, notificationId]);
      }
      delivered[channel] = status === 'sent';
      if (channel === 'email' && status === 'sent') {
        await execute('UPDATE notifications SET email_sent = 1 WHERE id = ?', [notificationId]);
      }
    } catch (error) {
      status = 'failed';
      errorMessage = (error as Error).message;
      errors.push(`${channel}: ${errorMessage}`);
    }

    await insert(
      `INSERT INTO notification_logs (notification_id, user_id, channel, template_code, recipient, subject,
                                      body, status, provider_message_id, error_message, sent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        notificationId, input.userId, channel, template?.code ?? null,
        channel === 'email' ? recipient.email : recipient.mobile,
        template?.subject ? renderTemplate(template.subject, templateData) : input.title,
        template ? renderTemplate(template.body, templateData).slice(0, 5000) : input.message,
        status, providerMessageId, errorMessage,
      ]
    );
  }

  return { notificationId, delivered, errors };
}

/** Fans a notification out to many users (e.g. all admins). */
export async function notifyMany(userIds: number[], input: Omit<NotifyInput, 'userId'>): Promise<NotifyResult[]> {
  const results: NotifyResult[] = [];
  for (const userId of [...new Set(userIds.filter(Boolean))]) {
    results.push(await notifyUser({ ...input, userId }));
  }
  return results;
}

/** Resolves every active user holding a given role — used for admin fan-out. */
export async function usersWithRole(roleSlug: string): Promise<number[]> {
  const rows = await query<{ user_id: number }>(
    `SELECT ur.user_id
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       JOIN users u ON u.id = ur.user_id
      WHERE r.slug = ? AND u.status = 'active' AND u.deleted_at IS NULL`,
    [roleSlug]
  );
  return rows.map((r) => r.user_id);
}

export async function markNotificationsRead(userId: number, ids?: number[]): Promise<number> {
  if (ids && ids.length) {
    const placeholders = ids.map(() => '?').join(', ');
    const result = await execute(
      `UPDATE notifications SET is_read = 1, read_at = NOW()
        WHERE user_id = ? AND is_read = 0 AND id IN (${placeholders})`,
      [userId, ...ids]
    );
    return result.affectedRows;
  }
  const result = await execute(
    'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0',
    [userId]
  );
  return result.affectedRows;
}

export async function getUnreadCount(userId: number): Promise<number> {
  const row = await queryOne<RowDataPacket>(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND is_read = 0 AND deleted_at IS NULL',
    [userId]
  );
  return Number(row?.total ?? 0);
}

export async function listNotifications(userId: number, params: { page?: number; limit?: number; unreadOnly?: boolean; category?: string }) {
  const where = ['user_id = ?', 'deleted_at IS NULL'];
  const values: unknown[] = [userId];
  if (params.unreadOnly) where.push('is_read = 0');
  if (params.category) { where.push('category = ?'); values.push(params.category); }

  const limit = Math.min(params.limit ?? 20, 100);
  const page = Math.max(params.page ?? 1, 1);
  const offset = (page - 1) * limit;
  const whereSql = where.join(' AND ');

  const total = await queryOne<RowDataPacket>(`SELECT COUNT(*) AS total FROM notifications WHERE ${whereSql}`, values);
  const data = await query(
    `SELECT * FROM notifications WHERE ${whereSql} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`,
    values
  );
  const count = Number(total?.total ?? 0);
  return {
    data,
    unreadCount: await getUnreadCount(userId),
    pagination: { total: count, page, limit, totalPages: Math.max(Math.ceil(count / limit), 1), from: offset + 1, to: Math.min(offset + limit, count) },
  };
}

function simpleEmail(title: string, message: string, actionUrl?: string | null): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;color:#1e293b;background:#f5f5f5;margin:0;padding:20px;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;">
    <div style="background:#3b82f6;color:#ffffff;padding:20px;text-align:center;"><h1 style="margin:0;font-size:20px;">${APP_NAME}</h1></div>
    <div style="padding:30px;">
      <h2 style="margin-top:0;font-size:18px;">${title}</h2>
      <p>${message}</p>
      ${actionUrl ? `<a href="${actionUrl}" style="display:inline-block;background:#3b82f6;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;margin-top:16px;">Open</a>` : ''}
    </div>
    <div style="background:#f8fafc;padding:20px;text-align:center;font-size:12px;color:#64748b;">
      ${COMPANY_LEGAL.address}<br>${COMPANY_LEGAL.email} | ${COMPANY_LEGAL.phone}
    </div>
  </div>
</body></html>`;
}
