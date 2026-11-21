/** Template-driven email facade used by business services. */
import { sendEmail, type EmailAttachment } from '@/lib/integrations/email-provider';
import { getTemplate, renderTemplate, findMissingVariables } from './notification-templates';
import { APP_NAME, APP_URL } from '@/lib/utils/constants';
import { getCompanyLegal } from '@/services/company.service';

export interface TemplateEmailInput {
  to: string | string[];
  templateCode: string;
  data?: Record<string, unknown>;
  attachments?: EmailAttachment[];
  entityType?: string | null;
  entityId?: number | null;
  sentBy?: number | null;
}

export async function sendTemplateEmail(input: TemplateEmailInput) {
  const template = getTemplate(input.templateCode);
  if (!template) throw new Error(`Unknown email template: ${input.templateCode}`);

  const company = await getCompanyLegal();
  const data: Record<string, unknown> = {
    platform_name: APP_NAME,
    login_url: `${APP_URL}/login`,
    support_email: company.email,
    company_address: company.address,
    company_email: company.email,
    company_phone: company.phone,
    ...(input.data ?? {}),
  };

  const missing = findMissingVariables(`${template.subject ?? ''}${template.body}`, data);
  if (missing.length) {
    console.warn(`[email] template "${template.code}" rendered with empty variables: ${missing.join(', ')}`);
  }

  return sendEmail({
    to: input.to,
    subject: renderTemplate(template.subject ?? template.name, data),
    html: renderTemplate(template.body, data),
    templateCode: template.code,
    attachments: input.attachments,
    entityType: input.entityType,
    entityId: input.entityId,
    sentBy: input.sentBy,
  });
}

export { sendEmail };
