/**
 * SMS transport supporting Twilio and MSG91. Every attempt is logged to sms_logs.
 */
import { execute } from '@/lib/db/mysql';
import { query } from '@/lib/db/mysql';
import type { RowDataPacket } from 'mysql2/promise';
import { decryptSecret } from './crypto';

export interface SmsConfig {
  provider: 'twilio' | 'msg91';
  accountSid: string | null;
  authToken: string | null;
  senderId: string | null;
  msg91AuthKey: string | null;
  msg91SenderId: string | null;
  enabled: boolean;
}

export interface SendSmsInput {
  to: string;
  message: string;
  templateCode?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  messageType?: 'transactional' | 'promotional' | 'otp';
  sentBy?: number | null;
}

export interface SendSmsResult {
  ok: boolean;
  messageId: string | null;
  provider: string;
  segments: number;
  error?: string;
  logId: number;
}

export async function getSmsConfig(): Promise<SmsConfig> {
  const rows = await query<RowDataPacket>(
    `SELECT setting_key, setting_value, is_encrypted FROM settings WHERE setting_group = 'sms'`
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    const value = row.is_encrypted ? decryptSecret(String(row.setting_value ?? '')) : String(row.setting_value ?? '');
    map.set(String(row.setting_key), value);
  }
  const provider = (map.get('provider') || process.env.SMS_PROVIDER || 'twilio') as 'twilio' | 'msg91';
  return {
    provider,
    accountSid: map.get('twilio_account_sid') || process.env.TWILIO_ACCOUNT_SID || null,
    authToken: map.get('twilio_auth_token') || process.env.TWILIO_AUTH_TOKEN || null,
    senderId: map.get('sender_id') || process.env.TWILIO_SENDER_ID || null,
    msg91AuthKey: map.get('msg91_auth_key') || process.env.MSG91_AUTH_KEY || null,
    msg91SenderId: map.get('msg91_sender_id') || process.env.MSG91_SENDER_ID || null,
    enabled: (map.get('enabled') ?? 'true') === 'true',
  };
}

/** GSM-7 is 160 chars, UCS-2 (Tamil etc.) is 70. */
export function countSegments(message: string): number {
  const isUnicode = /[^\u0000-\u007F]/.test(message);
  const perSegment = isUnicode ? 70 : 160;
  return Math.max(Math.ceil(message.length / perSegment), 1);
}

export function normalizeMobile(mobile: string): string {
  const digits = mobile.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return digits;
}

export async function sendSms(input: SendSmsInput): Promise<SendSmsResult> {
  const config = await getSmsConfig();
  const to = normalizeMobile(input.to);
  const segments = countSegments(input.message);

  const logId = (
    await execute(
      `INSERT INTO sms_logs (to_mobile, message, template_code, entity_type, entity_id, message_type,
                             status, provider, segments, sent_by)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
      [to, input.message, input.templateCode ?? null, input.entityType ?? null, input.entityId ?? null,
       input.messageType ?? 'transactional', config.provider, segments, input.sentBy ?? null]
    )
  ).insertId;

  const credentialsPresent =
    config.provider === 'twilio'
      ? Boolean(config.accountSid && config.authToken && !String(config.authToken).includes('xxxx'))
      : Boolean(config.msg91AuthKey && !String(config.msg91AuthKey).includes('xxxx'));

  if (!credentialsPresent || !config.enabled) {
    await execute(
      `UPDATE sms_logs SET status = 'sent', provider = 'simulated', provider_message_id = ?, sent_at = NOW() WHERE id = ?`,
      [`simulated-${logId}`, logId]
    );
    console.log(`[sms:simulated] to=${to} "${input.message.slice(0, 60)}" (provider not configured)`);
    return { ok: true, messageId: `simulated-${logId}`, provider: 'simulated', segments, logId };
  }

  try {
    let messageId: string | null = null;

    if (config.provider === 'twilio') {
      const body = new URLSearchParams({ From: config.senderId ?? '', To: to, Body: input.message });
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        }
      );
      const payload = (await response.json()) as { sid?: string; message?: string };
      if (!response.ok) throw new Error(payload.message ?? `Twilio error ${response.status}`);
      messageId = payload.sid ?? null;
    } else {
      const response = await fetch('https://api.msg91.com/api/v5/flow/', {
        method: 'POST',
        headers: { authkey: config.msg91AuthKey as string, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: config.msg91SenderId ?? config.senderId,
          mobiles: to.replace('+', ''),
          message: input.message,
        }),
      });
      const payload = (await response.json()) as { message?: string; request_id?: string; type?: string };
      if (!response.ok) throw new Error(payload.message ?? `MSG91 error ${response.status}`);
      messageId = payload.request_id ?? null;
    }

    await execute(
      `UPDATE sms_logs SET status = 'sent', provider_message_id = ?, sent_at = NOW() WHERE id = ?`,
      [messageId, logId]
    );
    return { ok: true, messageId, provider: config.provider, segments, logId };
  } catch (error) {
    const message = (error as Error).message;
    await execute(`UPDATE sms_logs SET status = 'failed', error_message = ?, sent_at = NOW() WHERE id = ?`, [
      message.slice(0, 2000), logId,
    ]);
    console.error(`[sms:failed] to=${to} error=${message}`);
    return { ok: false, messageId: null, provider: config.provider, segments, error: message, logId };
  }
}

export async function verifySmsConnection(): Promise<{ ok: boolean; message: string }> {
  const config = await getSmsConfig();
  const present =
    config.provider === 'twilio'
      ? Boolean(config.accountSid && config.authToken)
      : Boolean(config.msg91AuthKey);
  if (!present) return { ok: false, message: `No ${config.provider} credentials configured yet.` };
  return { ok: true, message: `${config.provider} credentials present. Send a test SMS to confirm delivery.` };
}
