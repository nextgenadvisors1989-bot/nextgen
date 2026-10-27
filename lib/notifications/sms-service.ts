/** Template-driven SMS facade. */
import { sendSms, countSegments } from '@/lib/integrations/sms-provider';
import { getTemplate, renderTemplate, findMissingVariables } from './notification-templates';
import { APP_NAME, APP_URL } from '@/lib/utils/constants';

export interface TemplateSmsInput {
  to: string;
  templateCode: string;
  data?: Record<string, unknown>;
  /** Bypasses the template body — used by the settings screen's test button. */
  rawMessage?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  sentBy?: number | null;
}

export async function sendTemplateSms(input: TemplateSmsInput) {
  const template = getTemplate(input.templateCode);
  if (!template) throw new Error(`Unknown SMS template: ${input.templateCode}`);

  const data: Record<string, unknown> = {
    platform_name: APP_NAME,
    login_url: `${APP_URL}/login`,
    ...(input.data ?? {}),
  };
  const message = input.rawMessage?.trim() || renderTemplate(template.body, data);
  const missing = input.rawMessage ? [] : findMissingVariables(template.body, data);
  if (missing.length) console.warn(`[sms] template "${template.code}" empty variables: ${missing.join(', ')}`);

  return sendSms({
    to: input.to,
    message,
    templateCode: template.code,
    entityType: input.entityType,
    entityId: input.entityId,
    sentBy: input.sentBy,
  });
}

export { sendSms, countSegments };
