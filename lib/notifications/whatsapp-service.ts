/** Template-driven WhatsApp facade. */
import { sendWhatsApp } from '@/lib/integrations/whatsapp-provider';
import { getTemplate, renderTemplate, findMissingVariables } from './notification-templates';
import { APP_NAME, APP_URL } from '@/lib/utils/constants';

export interface TemplateWhatsAppInput {
  to: string;
  templateCode: string;
  data?: Record<string, unknown>;
  /** Bypasses the template body — used by the settings screen's test button. */
  rawMessage?: string | null;
  mediaUrl?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  sentBy?: number | null;
}

export async function sendTemplateWhatsApp(input: TemplateWhatsAppInput) {
  const template = getTemplate(input.templateCode);
  if (!template) throw new Error(`Unknown WhatsApp template: ${input.templateCode}`);

  const data: Record<string, unknown> = {
    platform_name: APP_NAME,
    login_url: `${APP_URL}/login`,
    ...(input.data ?? {}),
  };
  const message = input.rawMessage?.trim() || renderTemplate(template.body, data);
  const missing = input.rawMessage ? [] : findMissingVariables(template.body, data);
  if (missing.length) console.warn(`[whatsapp] template "${template.code}" empty variables: ${missing.join(', ')}`);

  return sendWhatsApp({
    to: input.to,
    message,
    mediaUrl: input.mediaUrl,
    templateCode: template.code,
    entityType: input.entityType,
    entityId: input.entityId,
    sentBy: input.sentBy,
  });
}

export { sendWhatsApp };
