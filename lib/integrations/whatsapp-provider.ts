/**
 * WhatsApp transport supporting the Meta Cloud API and Twilio's WhatsApp API.
 * All sends are logged to whatsapp_logs.
 */
import { execute, query, type RowDataPacket } from '@/lib/db/mysql';
import { decryptSecret } from './crypto';
import { normalizeMobile } from './sms-provider';

export interface WhatsAppConfig {
  provider: 'meta' | 'twilio';
  phoneNumberId: string | null;
  accessToken: string | null;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioFrom: string | null;
  enabled: boolean;
}

export interface SendWhatsAppInput {
  to: string;
  message: string;
  mediaUrl?: string | null;
  templateCode?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  sentBy?: number | null;
}

export interface SendWhatsAppResult {
  ok: boolean;
  messageId: string | null;
  provider: string;
  error?: string;
  logId: number;
}

export async function getWhatsAppConfig(): Promise<WhatsAppConfig> {
  const rows = await query<RowDataPacket>(
    `SELECT setting_key, setting_value, is_encrypted FROM settings WHERE setting_group = 'whatsapp'`
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    const value = row.is_encrypted ? decryptSecret(String(row.setting_value ?? '')) : String(row.setting_value ?? '');
    map.set(String(row.setting_key), value);
  }
  return {
    provider: (map.get('provider') || process.env.WHATSAPP_PROVIDER || 'meta') as 'meta' | 'twilio',
    phoneNumberId: map.get('phone_number_id') || process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    accessToken: map.get('access_token') || process.env.WHATSAPP_ACCESS_TOKEN || null,
    twilioAccountSid: map.get('twilio_account_sid') || process.env.TWILIO_ACCOUNT_SID || null,
    twilioAuthToken: map.get('twilio_auth_token') || process.env.TWILIO_AUTH_TOKEN || null,
    twilioFrom: map.get('twilio_from') || null,
    enabled: (map.get('enabled') ?? 'true') === 'true',
  };
}

export async function sendWhatsApp(input: SendWhatsAppInput): Promise<SendWhatsAppResult> {
  const config = await getWhatsAppConfig();
  const to = normalizeMobile(input.to);

  const logId = (
    await execute(
      `INSERT INTO whatsapp_logs (to_mobile, message, media_url, template_code, entity_type, entity_id, status, provider, sent_by)
       VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
      [to, input.message, input.mediaUrl ?? null, input.templateCode ?? null,
       input.entityType ?? null, input.entityId ?? null, config.provider, input.sentBy ?? null]
    )
  ).insertId;

  const configured =
    config.provider === 'meta'
      ? Boolean(config.phoneNumberId && config.accessToken && !String(config.accessToken).includes('xxxx'))
      : Boolean(config.twilioAccountSid && config.twilioAuthToken && config.twilioFrom);

  if (!configured || !config.enabled) {
    await execute(
      `UPDATE whatsapp_logs SET status = 'sent', provider = 'simulated', provider_message_id = ?, sent_at = NOW() WHERE id = ?`,
      [`simulated-${logId}`, logId]
    );
    console.log(`[whatsapp:simulated] to=${to} "${input.message.slice(0, 60)}" (provider not configured)`);
    return { ok: true, messageId: `simulated-${logId}`, provider: 'simulated', logId };
  }

  try {
    let messageId: string | null = null;

    if (config.provider === 'meta') {
      const body: Record<string, unknown> = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: to.replace('+', ''),
        type: input.mediaUrl ? 'image' : 'text',
      };
      if (input.mediaUrl) {
        body.image = { link: input.mediaUrl, caption: input.message };
      } else {
        body.text = { preview_url: true, body: input.message };
      }

      const response = await fetch(
        `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      );
      const payload = (await response.json()) as {
        messages?: { id: string }[];
        error?: { message: string };
      };
      if (!response.ok) throw new Error(payload.error?.message ?? `Meta API error ${response.status}`);
      messageId = payload.messages?.[0]?.id ?? null;
    } else {
      const form = new URLSearchParams({
        From: `whatsapp:${config.twilioFrom}`,
        To: `whatsapp:${to}`,
        Body: input.message,
      });
      if (input.mediaUrl) form.set('MediaUrl', input.mediaUrl);

      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form,
        }
      );
      const payload = (await response.json()) as { sid?: string; message?: string };
      if (!response.ok) throw new Error(payload.message ?? `Twilio error ${response.status}`);
      messageId = payload.sid ?? null;
    }

    await execute(
      `UPDATE whatsapp_logs SET status = 'sent', provider_message_id = ?, sent_at = NOW() WHERE id = ?`,
      [messageId, logId]
    );
    return { ok: true, messageId, provider: config.provider, logId };
  } catch (error) {
    const message = (error as Error).message;
    await execute(`UPDATE whatsapp_logs SET status = 'failed', error_message = ?, sent_at = NOW() WHERE id = ?`, [
      message.slice(0, 2000), logId,
    ]);
    console.error(`[whatsapp:failed] to=${to} error=${message}`);
    return { ok: false, messageId: null, provider: config.provider, error: message, logId };
  }
}

export async function verifyWhatsAppConnection(): Promise<{ ok: boolean; message: string }> {
  const config = await getWhatsAppConfig();
  if (config.provider === 'meta') {
    if (!config.phoneNumberId || !config.accessToken) {
      return { ok: false, message: 'Meta WhatsApp phone number ID and access token are required.' };
    }
    return { ok: true, message: `Meta Cloud API configured for phone number ID ${config.phoneNumberId}.` };
  }
  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    return { ok: false, message: 'Twilio account SID and auth token are required.' };
  }
  return { ok: true, message: 'Twilio WhatsApp API credentials present.' };
}
