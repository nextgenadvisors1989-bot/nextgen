/**
 * Settings contracts.
 *
 * The payload shape is uniform: a map of `key → value` for one group. Values
 * arrive from HTML form controls, so everything is coerced against the
 * catalogue in `lib/settings/definitions.ts` — a key that is not in the
 * catalogue is rejected rather than silently stored, and each type is validated
 * for what it actually is (a number is a number, an email is an email).
 *
 * Secret fields are the one exception: `null` clears the stored secret, an empty
 * string or an absent key keeps it, and a non-empty string replaces it.
 */
import { z } from 'zod';
import { SETTING_GROUPS, SETTING_INDEX, type SettingGroup } from '@/lib/settings/definitions';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const settingGroupSchema = z.enum(SETTING_GROUPS);

export const settingUpdateSchema = z.object({
  values: z.record(z.string().min(1).max(150), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  /** Free-text note recorded in the audit trail alongside the change. */
  note: z.string().trim().max(300).optional().nullable(),
});

export type SettingUpdateInput = z.infer<typeof settingUpdateSchema>;

/** Validates one group's payload and returns the normalised rows to persist. */
export function validateSettingPayload(
  group: SettingGroup,
  values: Record<string, string | number | boolean | null>
): {
  entries: { key: string; value: string | null; isEncrypted: boolean; label: string }[];
  errors: { field: string; message: string }[];
} {
  const errors: { field: string; message: string }[] = [];
  const entries: { key: string; value: string | null; isEncrypted: boolean; label: string }[] = [];

  for (const [key, raw] of Object.entries(values)) {
    const definition = SETTING_INDEX[`${group}.${key}`];
    if (!definition) {
      errors.push({ field: key, message: `“${key}” is not a ${group} setting` });
      continue;
    }

    // Secrets: null clears, '' keeps the stored value (the service handles that).
    if (definition.secret) {
      if (raw === null) {
        // An explicit null is the operator asking to remove the stored secret,
        // so it must reach the service as a null rather than an empty string.
        entries.push({ key, value: null, isEncrypted: true, label: definition.label });
        continue;
      }
      if (raw === '' || raw === undefined) continue;
      entries.push({ key, value: String(raw), isEncrypted: true, label: definition.label });
      continue;
    }

    const text = raw === null ? '' : String(raw).trim();

    switch (definition.type) {
      case 'boolean': {
        const normalised = ['true', '1', 'yes', 'on'].includes(text.toLowerCase()) ? 'true' : 'false';
        entries.push({ key, value: normalised, isEncrypted: false, label: definition.label });
        break;
      }
      case 'number': {
        const numeric = Number(text);
        if (text === '' || Number.isNaN(numeric)) {
          errors.push({ field: key, message: `${definition.label} must be a number` });
          break;
        }
        if (definition.min !== undefined && numeric < definition.min) {
          errors.push({ field: key, message: `${definition.label} must be at least ${definition.min}` });
          break;
        }
        if (definition.max !== undefined && numeric > definition.max) {
          errors.push({ field: key, message: `${definition.label} must not exceed ${definition.max}` });
          break;
        }
        entries.push({ key, value: String(numeric), isEncrypted: false, label: definition.label });
        break;
      }
      case 'select': {
        const allowed = (definition.options ?? []).map((option) => option.value);
        if (allowed.length && !allowed.includes(text)) {
          errors.push({ field: key, message: `${definition.label} must be one of: ${allowed.join(', ')}` });
          break;
        }
        entries.push({ key, value: text, isEncrypted: false, label: definition.label });
        break;
      }
      case 'email': {
        if (text && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) {
          errors.push({ field: key, message: `${definition.label} must be a valid email address` });
          break;
        }
        entries.push({ key, value: text || null, isEncrypted: false, label: definition.label });
        break;
      }
      case 'url': {
        if (text && !/^https?:\/\/[^\s]+$/i.test(text)) {
          errors.push({ field: key, message: `${definition.label} must start with http:// or https://` });
          break;
        }
        entries.push({ key, value: text || null, isEncrypted: false, label: definition.label });
        break;
      }
      default: {
        if (text === '' && definition.type === 'text' && definition.section === 'Statutory') {
          entries.push({ key, value: null, isEncrypted: false, label: definition.label });
          break;
        }
        entries.push({ key, value: text === '' ? null : text, isEncrypted: false, label: definition.label });
      }
    }
  }

  // Group-level sanity: an email provider without a host cannot deliver.
  if (group === 'email') {
    const host = values.smtp_host === undefined ? undefined : String(values.smtp_host ?? '').trim();
    const port = values.smtp_port === undefined ? undefined : String(values.smtp_port ?? '').trim();
    if (host === '' && port && port !== '587') {
      errors.push({ field: 'smtp_host', message: 'Set the SMTP host before changing the port' });
    }
  }

  return { entries, errors };
}

/* ─────────────────────────── integration tests ─────────────────────────── */

export const connectionTestSchema = z.object({
  /** Where the test message goes. Defaults to the signed-in administrator. */
  to: z.string().trim().min(3).max(190).optional().nullable(),
  message: z.string().trim().min(1).max(600).optional().nullable(),
});

export const emailTestSchema = z.object({
  to: z.string().trim().min(3).max(190).optional().nullable(),
  subject: z.string().trim().min(1).max(200).optional().nullable(),
});

export const smsTestSchema = z.object({
  to: z.string().trim().min(6).max(20),
  message: z.string().trim().min(1).max(600).optional(),
});

export const whatsappTestSchema = z.object({
  to: z.string().trim().min(6).max(20),
  message: z.string().trim().min(1).max(1000).optional(),
});

/* ─────────────────────────────── backups ───────────────────────────────── */

export const backupRunSchema = z.object({
  type: z.enum(['full', 'schema', 'data']).optional().default('full'),
  note: z.string().trim().max(200).optional().nullable(),
});

export const backupListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  status: z.enum(['all', 'running', 'completed', 'failed']).optional().default('all'),
  triggered_by: z.enum(['all', 'manual', 'scheduled']).optional().default('all'),
});

/* ────────────────────────── delivery logs ──────────────────────────────── */

export const deliveryChannelSchema = z.enum(['email', 'sms', 'whatsapp']);

export const deliveryLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  search: z.string().trim().max(200).optional().nullable(),
  status: z.enum(['all', 'queued', 'sent', 'failed', 'skipped']).optional().default('all'),
  template_code: z.string().trim().max(100).optional().nullable(),
  from_date: z.string().trim().regex(DATE_PATTERN).optional().nullable(),
  to_date: z.string().trim().regex(DATE_PATTERN).optional().nullable(),
  sortDir: z.enum(['asc', 'desc']).optional().default('desc'),
});

export type DeliveryLogQuery = z.infer<typeof deliveryLogQuerySchema>;

/* ─────────────────────────── scheduled jobs ────────────────────────────── */

export const jobUpdateSchema = z.object({
  is_active: z.boolean(),
  /** Optional cron override for operators who run their own scheduler. */
  cron_expression: z.string().trim().max(100).optional().nullable(),
});

export const JOB_TYPE_LABELS: Record<string, string> = {
  REMINDER: 'Reminder',
  REPORT: 'Report',
  BACKUP: 'Backup',
  SYNC: 'Synchronisation',
  CLEANUP: 'Cleanup',
  NOTIFICATION: 'Notification',
};
