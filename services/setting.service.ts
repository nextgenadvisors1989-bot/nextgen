/**
 * Settings service — reads the catalogue for the screens, writes edits with
 * encryption and auditing, and runs the integration tests, backups and
 * scheduled jobs that live under the same administration roof.
 *
 * Two rules govern every write here:
 *   · a secret is encrypted before it reaches the database and masked on the
 *     way out, so a plaintext key never leaves the settings table;
 *   · a change is written to `activity_logs` with the old and new value, except
 *     for secrets, where only "replaced" / "cleared" is recorded.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, statSync, unlinkSync, readdirSync, copyFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { getPool } from '@/lib/db/mysql';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { encryptSecret, decryptSecret, maskSecret } from '@/lib/integrations/crypto';
import { sendTemplateEmail } from '@/lib/notifications/email-service';
import { sendTemplateSms } from '@/lib/notifications/sms-service';
import { sendTemplateWhatsApp } from '@/lib/notifications/whatsapp-service';
import { TEMPLATES } from '@/lib/notifications/notification-templates';
import { runAllReminderJobs } from '@/lib/notifications/reminder-jobs';
import { APP_URL } from '@/lib/utils/constants';
import {
  SETTING_GROUPS, definitionsFor, sectionsFor, SETTING_GROUP_LABELS, type SettingGroup,
} from '@/lib/settings/definitions';
import {
  allSettings, backupById, backupHistory, backupStats, completeBackupRun, configurationCoverage,
  databaseSizeMb, databaseTableNames, databaseTableCount, deleteBackupRun, deliveryLogs, deliveryStats,
  deliveryTemplates, failBackupRun, insertBackupRun, recordJobRun, recentDeliveryFailures,
  scheduledJobByCode, scheduledJobs, settingStats, settingsForGroup, publicSettings, unknownSettingGroups,
  updateScheduledJob, upsertSetting, type SettingRow,
} from '@/repositories/setting.repository';
import { runScheduledPublishing } from '@/services/cms.service';
import type { AuthUser } from '@/types/user';
import {
  type DeliveryLogQuery,
} from '@/lib/validations/setting.validation';

const execFileAsync = promisify(execFile);

type ServiceError = Error & { code: string; details?: Record<string, unknown> };

function fail(code: string, message: string, details?: Record<string, unknown>): never {
  throw Object.assign(new Error(message), { code, details }) as ServiceError;
}

function actorOf(actor: { user: AuthUser; ip?: string | null }) {
  return {
    userId: actor.user.id,
    userName: actor.user.fullName,
    userRole: actor.user.primaryRole,
    employerId: actor.user.employerId,
    ipAddress: actor.ip ?? null,
  };
}

/* ─────────────────────────────── reading ─────────────────────────────── */

export interface ResolvedSetting {
  key: string;
  group: SettingGroup;
  label: string;
  value: string;
  /** What the screen shows: secrets are masked, never returned in the clear. */
  displayValue: string;
  isSet: boolean;
  isSecret: boolean;
  valueType: string;
  description: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
  /** True when the value differs from what the seeds ship. */
  customised: boolean;
}

/** Every group at once — used by the overview tiles and the settings screens. */
export async function getAllSettings(): Promise<Record<SettingGroup, ResolvedSetting[]>> {
  const rows = await allSettings();
  const byGroupKey = new Map<string, SettingRow>();
  for (const row of rows) byGroupKey.set(`${row.setting_group}.${row.setting_key}`, row as SettingRow);

  const detailed = new Map<string, SettingRow>();
  for (const group of SETTING_GROUPS) {
    for (const row of await settingsForGroup(group)) detailed.set(`${group}.${row.setting_key}`, row);
  }

  const output = {} as Record<SettingGroup, ResolvedSetting[]>;
  for (const group of SETTING_GROUPS) {
    output[group] = definitionsFor(group).map((definition) => {
      const row = detailed.get(`${group}.${definition.key}`);
      const raw = row?.setting_value ?? null;
      const decrypted = definition.secret && raw ? decryptSecret(String(raw)) : (raw ?? '');
      const value = decrypted ?? '';
      return {
        key: definition.key,
        group,
        label: definition.label,
        value: definition.secret ? '' : value,
        displayValue: definition.secret ? (raw ? maskSecret(value || '••••••••') : '') : value,
        isSet: value !== '' && value !== null,
        isSecret: Boolean(definition.secret),
        valueType: definition.type,
        description: definition.description ?? row?.description ?? null,
        updatedAt: row?.updated_at ?? null,
        updatedByName: row?.updated_by_name ?? null,
        customised: value !== '' && value !== definition.fallback && row !== undefined,
      };
    });
  }
  return output;
}

export async function getGroupSettings(group: SettingGroup) {
  const all = await getAllSettings();
  return {
    group,
    label: SETTING_GROUP_LABELS[group],
    sections: sectionsFor(group),
    values: Object.fromEntries(all[group].map((entry) => [entry.key, entry.displayValue])),
    fields: all[group],
  };
}

/** Overview screen: what is configured, what is not, and the platform's health. */
export async function getSettingsOverview() {
  const [stats, coverage, unknownGroups, tables, sizeMb, jobs] = await Promise.all([
    settingStats(),
    configurationCoverage(),
    unknownSettingGroups(),
    databaseTableCount(),
    databaseSizeMb(),
    scheduledJobs(),
  ]);

  const all = await getAllSettings();
  const groups = SETTING_GROUPS.map((group) => {
    const fields = all[group];
    const required = fields.filter((field) => !field.isSecret || field.isSet);
    const configured = fields.filter((field) => field.isSet);
    return {
      group,
      label: SETTING_GROUP_LABELS[group],
      fields: fields.length,
      configured: configured.length,
      secrets: fields.filter((field) => field.isSecret).length,
      secretsSet: fields.filter((field) => field.isSecret && field.isSet).length,
      lastUpdated: fields.reduce<string | null>((latest, field) => {
        if (!field.updatedAt) return latest;
        return !latest || field.updatedAt > latest ? field.updatedAt : latest;
      }, null),
      complete: configured.length >= Math.max(1, Math.floor(required.length * 0.6)),
    };
  });

  return {
    stats: { ...stats, tables, sizeMb, coverage },
    groups,
    unknownGroups: unknownGroups.map((row) => String(row.setting_group)),
    jobs: jobs.map((row) => ({
      id: Number(row.id),
      code: String(row.job_code),
      name: String(row.job_name),
      type: String(row.job_type),
      cron: row.cron_expression ? String(row.cron_expression) : null,
      active: Boolean(Number(row.is_active)),
      lastRunAt: row.last_run_at ?? null,
      lastStatus: String(row.last_run_status),
      lastMessage: row.last_run_message ? String(row.last_run_message) : null,
      nextRunAt: row.next_run_at ?? null,
      description: row.description ? String(row.description) : null,
    })),
  };
}

/** The value of one setting, decrypted — for services, never for a screen. */
export async function getSettingValue(group: SettingGroup, key: string): Promise<string | null> {
  const rows = await settingsForGroup(group);
  const row = rows.find((entry) => String(entry.setting_key) === key);
  if (!row) return null;
  const raw = row.setting_value;
  if (raw === null) return null;
  return Boolean(Number(row.is_encrypted)) ? decryptSecret(String(raw)) : String(raw);
}

/** Public settings for the public site and generated documents. */
export async function getPublicSettings() {
  return publicSettings();
}

/* ─────────────────────────────── writing ─────────────────────────────── */

export async function updateSettings(
  group: SettingGroup,
  values: Record<string, string | number | boolean | null>,
  note: string | null,
  actor: { user: AuthUser; ip?: string | null },
  validate: (group: SettingGroup, values: Record<string, string | number | boolean | null>) =>
    { entries: { key: string; value: string | null; isEncrypted: boolean; label: string }[]; errors: { field: string; message: string }[] }
) {
  const { entries, errors } = validate(group, values);
  if (errors.length) fail('VALIDATION_FAILED', errors[0].message, { issues: errors });
  if (!entries.length) fail('NO_CHANGE', 'No settings were sent');

  const current = await settingsForGroup(group);
  const currentByKey = new Map(current.map((row) => [String(row.setting_key), row]));

  const changed: { key: string; label: string; from: string | null; to: string | null; secret: boolean }[] = [];
  const unchanged: string[] = [];

  for (const entry of entries) {
    const existing = currentByKey.get(entry.key);
    const existingRaw = existing?.setting_value ?? null;
    const wasEncrypted = Boolean(Number(existing?.is_encrypted ?? 0));

    // A secret submitted as null is an explicit "remove this", and it is
    // audited as such — without ever writing the old value down.
    if (entry.isEncrypted && entry.value === null) {
      if (!existingRaw) {
        unchanged.push(entry.key);
        continue;
      }
      await upsertSetting({
        group,
        key: entry.key,
        value: '',
        isEncrypted: false,
        label: entry.label,
        userId: actor.user.id,
      });
      changed.push({ key: entry.key, label: entry.label, from: '••••••', to: null, secret: true });
      continue;
    }

    // A secret submitted empty means "keep what is stored".
    if (entry.isEncrypted && (entry.value === '' || entry.value === undefined)) {
      unchanged.push(entry.key);
      continue;
    }

    if (entry.isEncrypted) {
      // Replacing a secret: only the fact of the change is audited.
      if (existingRaw && decryptSecret(String(existingRaw)) === entry.value) {
        unchanged.push(entry.key);
        continue;
      }
      await upsertSetting({
        group,
        key: entry.key,
        value: encryptSecret(String(entry.value)),
        isEncrypted: true,
        label: entry.label,
        userId: actor.user.id,
      });
      changed.push({ key: entry.key, label: entry.label, from: existingRaw ? '••••••' : null, to: '••••••', secret: true });
      continue;
    }

    const previous = wasEncrypted && existingRaw ? decryptSecret(String(existingRaw)) : existingRaw;
    const next = entry.value;
    if ((previous ?? null) === (next ?? null)) {
      unchanged.push(entry.key);
      continue;
    }

    await upsertSetting({
      group,
      key: entry.key,
      value: next,
      isEncrypted: false,
      label: entry.label,
      userId: actor.user.id,
    });
    changed.push({ key: entry.key, label: entry.label, from: previous, to: next, secret: false });
  }

  if (!changed.length) fail('NO_CHANGE', 'Those values are already saved');

  await writeActivityLog({
    ...actorOf(actor),
    action: 'updated',
    module: 'settings',
    entityType: 'settings',
    entityId: null,
    entityLabel: `${SETTING_GROUP_LABELS[group]} settings`,
    description: `${SETTING_GROUP_LABELS[group]} settings updated — ${changed.map((entry) => entry.key).join(', ')}${
      note ? ` (${note})` : ''
    }`,
    oldValues: Object.fromEntries(changed.filter((entry) => !entry.secret).map((entry) => [entry.key, entry.from])),
    newValues: Object.fromEntries(changed.filter((entry) => !entry.secret).map((entry) => [entry.key, entry.to])),
  });

  return {
    group,
    label: SETTING_GROUP_LABELS[group],
    changed: changed.map((entry) => ({ key: entry.key, label: entry.label, secret: entry.secret })),
    unchanged: unchanged.length,
    // Any cached transport must pick the new credentials up immediately.
    reconnectRequired: changed.some((entry) => entry.secret) || group === 'email' || group === 'sms' || group === 'whatsapp',
  };
}

/** Called after an integration change so the next send rebuilds its transport. */
export async function resetIntegrationCache(group: SettingGroup) {
  if (group !== 'email') return;
  const { resetEmailTransportCache } = await import('@/lib/integrations/email-provider');
  resetEmailTransportCache();
}

/* ─────────────────────────── integration tests ─────────────────────────── */

export async function sendTestEmail(input: {
  to?: string | null;
  subject?: string | null;
  actor: { user: AuthUser; ip?: string | null };
}) {
  const to = input.to?.trim() || process.env.SMTP_TEST_TO || actorReceiver(input.actor);
  const result = await sendTemplateEmail({
    to,
    templateCode: 'system.test',
    data: {
      recipient_name: input.actor.user.fullName,
      sent_by_name: input.actor.user.fullName,
      sent_at: new Date().toISOString(),
      subject_line: input.subject || 'ComplianceOS email delivery test',
      app_url: APP_URL,
    },
    entityType: 'settings',
    entityId: null,
    sentBy: input.actor.user.id,
  });

  await writeActivityLog({
    ...actorOf(input.actor),
    action: result.ok ? 'tested' : 'failed',
    module: 'settings',
    entityType: 'settings',
    entityLabel: 'Email integration test',
    description: `Test email to ${to} — ${result.ok ? `delivered via ${result.provider}` : `failed: ${result.error ?? 'unknown error'}`}`,
    status: result.ok ? 'success' : 'failed',
  });

  return {
    channel: 'email',
    to,
    ok: result.ok,
    provider: result.provider,
    logId: result.logId,
    messageId: result.messageId,
    error: result.error ?? null,
    simulated: result.provider === 'simulated',
    message: result.ok
      ? result.provider === 'simulated'
        ? 'SMTP is not configured, so the message was rendered and logged as simulated. Add the SMTP host and password, then run the test again.'
        : `Sent through ${result.provider} — check the inbox for ${to}.`
      : `Delivery failed: ${result.error ?? 'unknown error'}`,
  };
}

function actorReceiver(actor: { user: AuthUser }) {
  return actor.user.email;
}

export async function sendTestSms(input: {
  to: string;
  message?: string | null;
  actor: { user: AuthUser; ip?: string | null };
}) {
  const message = input.message?.trim() ||
    `ComplianceOS test message to ${input.actor.user.fullName}. If you received this, SMS delivery is working.`;
  const result = await sendTemplateSms({
    to: input.to,
    templateCode: 'sms.otp',
    data: { otp_code: message, platform_name: 'ComplianceOS' },
    rawMessage: message,
    entityType: 'settings',
    sentBy: input.actor.user.id,
  });

  await writeActivityLog({
    ...actorOf(input.actor),
    action: result.ok ? 'tested' : 'failed',
    module: 'settings',
    entityType: 'settings',
    entityLabel: 'SMS integration test',
    description: `Test SMS to ${input.to} — ${result.ok ? `accepted by ${result.provider}` : `failed: ${result.error ?? 'unknown error'}`}`,
    status: result.ok ? 'success' : 'failed',
  });

  return {
    channel: 'sms',
    to: input.to,
    ok: result.ok,
    provider: result.provider,
    segments: result.segments,
    logId: result.logId,
    error: result.error ?? null,
    simulated: result.provider === 'simulated',
    message: result.ok
      ? result.provider === 'simulated'
        ? `No SMS credentials are configured, so the message (${result.segments} segment(s)) was logged as simulated.`
        : `Accepted by ${result.provider} — ${result.segments} segment(s) on the way to ${input.to}.`
      : `Delivery failed: ${result.error ?? 'unknown error'}`,
  };
}

export async function sendTestWhatsApp(input: {
  to: string;
  message?: string | null;
  actor: { user: AuthUser; ip?: string | null };
}) {
  const message = input.message?.trim() ||
    `ComplianceOS test message to ${input.actor.user.fullName}. If you received this, WhatsApp delivery is working.`;
  const result = await sendTemplateWhatsApp({
    to: input.to,
    templateCode: 'whatsapp.welcome',
    data: { platform_name: 'ComplianceOS', recipient_name: input.actor.user.fullName, login_url: `${APP_URL}/login` },
    rawMessage: message,
    entityType: 'settings',
    sentBy: input.actor.user.id,
  });

  await writeActivityLog({
    ...actorOf(input.actor),
    action: result.ok ? 'tested' : 'failed',
    module: 'settings',
    entityType: 'settings',
    entityLabel: 'WhatsApp integration test',
    description: `Test WhatsApp message to ${input.to} — ${result.ok ? `accepted by ${result.provider}` : `failed: ${result.error ?? 'unknown error'}`}`,
    status: result.ok ? 'success' : 'failed',
  });

  return {
    channel: 'whatsapp',
    to: input.to,
    ok: result.ok,
    provider: result.provider,
    logId: result.logId,
    error: result.error ?? null,
    simulated: result.provider === 'simulated',
    message: result.ok
      ? result.provider === 'simulated'
        ? 'No WhatsApp credentials are configured, so the message was logged as simulated.'
        : `Accepted by ${result.provider} — the message is on its way to ${input.to}.`
      : `Delivery failed: ${result.error ?? 'unknown error'}`,
  };
}

/** One "send a test to me" button that reports every channel's configuration. */
export async function integrationStatus() {
  const [email, sms, whatsapp] = await Promise.all([
    import('@/lib/integrations/email-provider').then((module) => module.getEmailConfig()),
    import('@/lib/integrations/sms-provider').then((module) => module.getSmsConfig()),
    import('@/lib/integrations/whatsapp-provider').then((module) => module.getWhatsAppConfig()),
  ]);

  return {
    email: {
      configured: Boolean(email.host && email.password && !String(email.password).includes('xxxx')),
      enabled: email.enabled,
      detail: email.host ? `${email.host}:${email.port}${email.secure ? ' (SSL)' : ' (STARTTLS)'} as ${email.fromEmail ?? '—'}` : 'No SMTP host set',
    },
    sms: {
      configured: sms.provider === 'twilio'
        ? Boolean(sms.accountSid && sms.authToken && !String(sms.authToken).includes('xxxx'))
        : Boolean(sms.msg91AuthKey && !String(sms.msg91AuthKey).includes('xxxx')),
      enabled: sms.enabled,
      detail: sms.provider === 'twilio' ? `Twilio · sender ${sms.senderId ?? '—'}` : `MSG91 · sender ${sms.msg91SenderId ?? '—'}`,
    },
    whatsapp: {
      configured: whatsapp.provider === 'meta'
        ? Boolean(whatsapp.phoneNumberId && whatsapp.accessToken && !String(whatsapp.accessToken).includes('xxxx'))
        : Boolean(whatsapp.twilioAccountSid && whatsapp.twilioAuthToken && whatsapp.twilioFrom),
      enabled: whatsapp.enabled,
      detail: whatsapp.provider === 'meta'
        ? `Meta Cloud API · number ${whatsapp.phoneNumberId ?? '—'}`
        : `Twilio WhatsApp · from ${whatsapp.twilioFrom ?? '—'}`,
    },
    templates: {
      email: Object.values(TEMPLATES).filter((template) => template.channel === 'email').length,
      sms: Object.values(TEMPLATES).filter((template) => template.channel === 'sms').length,
      whatsapp: Object.values(TEMPLATES).filter((template) => template.channel === 'whatsapp').length,
      inApp: Object.values(TEMPLATES).filter((template) => template.channel === 'in_app').length,
    },
  };
}

/* ───────────────────────────── delivery logs ───────────────────────────── */

export async function getDeliveryLogs(channel: 'email' | 'sms' | 'whatsapp', filters: DeliveryLogQuery) {
  const [result, stats, templates, failures] = await Promise.all([
    deliveryLogs(channel, filters),
    deliveryStats(channel),
    deliveryTemplates(channel),
    recentDeliveryFailures(channel),
  ]);
  return { ...result, stats, templates, failures };
}

/* ──────────────────────────── scheduled jobs ──────────────────────────── */

export async function listJobs() {
  const rows = await scheduledJobs();
  return rows.map((row) => ({
    id: Number(row.id),
    code: String(row.job_code),
    name: String(row.job_name),
    description: row.description ? String(row.description) : null,
    cron: row.cron_expression ? String(row.cron_expression) : null,
    type: String(row.job_type),
    active: Boolean(Number(row.is_active)),
    lastRunAt: row.last_run_at ?? null,
    lastStatus: String(row.last_run_status),
    lastMessage: row.last_run_message ? String(row.last_run_message) : null,
    nextRunAt: row.next_run_at ?? null,
  }));
}

export async function toggleJob(
  jobCode: string,
  input: { is_active: boolean; cron_expression?: string | null },
  actor: { user: AuthUser; ip?: string | null }
) {
  const job = await scheduledJobByCode(jobCode);
  if (!job) fail('NOT_FOUND', 'That scheduled job does not exist');
  if (job.last_run_status === 'running' && !input.is_active) fail('INVALID_STATE', 'That job is running — wait for it to finish');

  await updateScheduledJob(jobCode, input);
  await writeActivityLog({
    ...actorOf(actor),
    action: 'updated',
    module: 'settings',
    entityType: 'scheduled_jobs',
    entityId: Number(job.id),
    entityLabel: String(job.job_name),
    description: `Scheduled job ${job.job_name} ${input.is_active ? 'enabled' : 'disabled'}${
      input.cron_expression ? ` (schedule ${input.cron_expression})` : ''
    }`,
    oldValues: { is_active: Boolean(Number(job.is_active)), cron_expression: job.cron_expression },
    newValues: { is_active: input.is_active, cron_expression: input.cron_expression ?? job.cron_expression },
  });
  return { jobCode, active: input.is_active };
}

/**
 * Runs a job now, from the settings screen.
 *
 * Reminder jobs are idempotent by design (already-notified items are skipped) so
 * they are safe to trigger at any time. The scheduled-publishing sync is the same
 * — it only promotes pages whose moment has passed — so it is runnable here too.
 * Backups and the retention cleanup have their own endpoints on this screen.
 */
export async function runJobNow(jobCode: string, actor: { user: AuthUser; ip?: string | null }) {
  const job = await scheduledJobByCode(jobCode);
  if (!job) fail('NOT_FOUND', 'That scheduled job does not exist');
  const type = String(job.job_type);
  const runnable = type === 'REMINDER' || jobCode === 'cms_scheduled_publish';
  if (!runnable) {
    fail(
      'INVALID_STATE',
      type === 'BACKUP'
        ? 'Run a backup from the Backup screen — it reports the dump file and its size'
        : `Only reminder and publishing jobs can be run on demand (this one is a ${type.toLowerCase()} job)`
    );
  }
  if (!Boolean(Number(job.is_active))) fail('INVALID_STATE', 'Enable the job before running it');

  await recordJobRun(jobCode, { status: 'running' });
  const started = Date.now();
  try {
    const summary = jobCode === 'cms_scheduled_publish'
      ? { ranAt: new Date().toISOString(), jobs: [{ job: 'cms-scheduled-publish', candidates: 0, dispatched: (await runScheduledPublishing()).published, skipped: 0, errors: [] as string[] }] }
      : await runAllReminderJobs();
    const message = summary.jobs
      .map((job) => job.job === 'cms-scheduled-publish'
        ? `${job.dispatched} scheduled page(s) published`
        : `${job.job}: ${job.dispatched}/${job.candidates} dispatched (${job.skipped} already sent)`)
      .join(' · ');
    await recordJobRun(jobCode, {
      status: 'success',
      message,
      nextRunAt: nextRunFor(String(job.cron_expression ?? '')) ?? null,
    });
    await writeActivityLog({
      ...actorOf(actor),
      action: 'executed',
      module: 'settings',
      entityType: 'scheduled_jobs',
      entityId: Number(job.id),
      entityLabel: String(job.job_name),
      description: `Ran ${job.job_name} on demand — ${message}`,
      status: 'success',
      durationMs: Date.now() - started,
    });
    return {
      jobCode,
      status: 'success' as const,
      message,
      jobs: summary.jobs,
      ranAt: summary.ranAt,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = (error as Error).message;
    await recordJobRun(jobCode, { status: 'failed', message });
    await writeActivityLog({
      ...actorOf(actor),
      action: 'executed',
      module: 'settings',
      entityType: 'scheduled_jobs',
      entityId: Number(job.id),
      entityLabel: String(job.job_name),
      description: `Run of ${job.job_name} failed: ${message}`,
      status: 'failed',
      durationMs: Date.now() - started,
    });
    fail('INVALID_STATE', `The job failed: ${message}`);
  }
}

function nextRunFor(cron: string): string | null {
  // The platform stores a display-only cron line; the operator's scheduler owns
  // timing. Compute the next slot for the simple "@daily"-style expressions the
  // seeds use so the screen can show something truthful.
  const daily = /daily|0 8 \* \* \*/i.test(cron);
  const hourly = /hourly|0 \* \* \* \*/i.test(cron);
  const now = new Date();
  if (daily) {
    const next = new Date(now);
    next.setHours(8, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next.toISOString().slice(0, 19).replace('T', ' ');
  }
  if (hourly) {
    const next = new Date(now);
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next.toISOString().slice(0, 19).replace('T', ' ');
  }
  return null;
}

/* ─────────────────────────────── backups ──────────────────────────────── */

export async function getBackups(filters: { page: number; limit: number; status: string; triggered_by: string }) {
  const [result, stats, tableCount] = await Promise.all([
    backupHistory(filters),
    backupStats(),
    databaseTableCount(),
  ]);
  return { ...result, stats, tableCount };
}

export async function getBackupDetail(id: number) {
  const backup = await backupById(id);
  if (!backup) fail('NOT_FOUND', 'That backup record does not exist');
  // `tables_included` is a JSON column, so the driver hands it back already
  // decoded; older rows, or a server whose driver returns the raw text, still
  // arrive as a string. Both shapes are handled here.
  const recorded = backup.tables_included as unknown;
  let tables: string[] = [];
  if (Array.isArray(recorded)) {
    tables = recorded.map((entry) => String(entry));
  } else if (typeof recorded === 'string' && recorded.trim()) {
    try {
      const parsed = JSON.parse(recorded) as unknown;
      tables = Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
    } catch {
      tables = [];
    }
  }
  const fileExists = Boolean(backup.file_path && existsSync(String(backup.file_path)));
  const sizeOnDisk = fileExists && backup.file_path ? statSync(String(backup.file_path)).size : null;
  return { ...backup, tables, fileExists, sizeOnDisk };
}

/**
 * Runs a real `mysqldump` into the configured directory and records the run in
 * `backup_history` (which is what the screen lists). Retention pruning happens
 * after a successful dump, exactly like the CLI script.
 */
export async function runBackupNow(
  input: { type: 'full' | 'schema' | 'data'; note?: string | null },
  actor: { user: AuthUser; ip?: string | null },
  overrides?: { outputDir?: string; keepDays?: number }
) {
  const configuredPath = (await getSettingValue('backup', 'storage_path')) || './storage/backups';
  const outputDir = resolve(overrides?.outputDir ?? configuredPath);
  const keepDays = overrides?.keepDays ?? Number((await getSettingValue('backup', 'retention_days')) ?? 30);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const host = process.env.DB_HOST ?? '127.0.0.1';
  const port = process.env.DB_PORT ?? '3306';
  const user = process.env.DB_USER ?? 'root';
  const password = process.env.DB_PASSWORD ?? '';
  const database = process.env.DB_NAME ?? 'compliance_platform';

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${database}-${input.type}-${stamp}.sql`;
  const filePath = resolve(outputDir, filename);

  const runId = await insertBackupRun({
    name: filename,
    type: input.type,
    filePath,
    triggeredBy: 'manual',
    userId: actor.user.id,
  });

  const args = [
    `--host=${host}`, `--port=${port}`, `--user=${user}`, '--single-transaction',
    '--routines', '--triggers', '--events', '--default-character-set=utf8mb4',
    `--result-file=${filePath}`,
  ];
  if (input.type === 'schema') args.push('--no-data');
  if (input.type === 'data') args.push('--no-create-info');
  if (password) args.unshift(`--password=${password}`);
  args.push(database);

  const started = Date.now();
  try {
    await execFileAsync(process.env.MYSQLDUMP_PATH || 'mysqldump', args, { maxBuffer: 1024 * 1024 * 256 });
    const sizeBytes = statSync(filePath).size;
    const tables = (await databaseTableNames()).map((row) => String(row.name));
    await completeBackupRun(runId, { sizeBytes, tables });

    // Retention: never delete the dump we just wrote.
    let pruned = 0;
    const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
    for (const entry of readdirSync(outputDir)) {
      if (!entry.endsWith('.sql') || entry === filename) continue;
      const full = resolve(outputDir, entry);
      if (statSync(full).mtimeMs < cutoff) {
        unlinkSync(full);
        pruned += 1;
      }
    }

    await writeActivityLog({
      ...actorOf(actor),
      action: 'executed',
      module: 'settings',
      entityType: 'backup_history',
      entityId: runId,
      entityLabel: filename,
      description: `${input.type} backup completed — ${(sizeBytes / 1024).toFixed(0)} kB across ${tables.length} tables${
        pruned ? `, ${pruned} old dump(s) pruned` : ''
      }${input.note ? ` (${input.note})` : ''}`,
      status: 'success',
      durationMs: Date.now() - started,
    });

    return { id: runId, name: filename, filePath, sizeBytes, tables: tables.length, pruned, durationMs: Date.now() - started };
  } catch (error) {
    const message = (error as Error).message.slice(0, 1000);
    await failBackupRun(runId, message);
    await writeActivityLog({
      ...actorOf(actor),
      action: 'executed',
      module: 'settings',
      entityType: 'backup_history',
      entityId: runId,
      entityLabel: filename,
      description: `Backup failed: ${message}`,
      status: 'failed',
      durationMs: Date.now() - started,
    });
    fail('INVALID_STATE', `The backup failed: ${message}. Check that mysqldump is installed and the database credentials are correct.`);
  }
}

export async function removeBackup(id: number, actor: { user: AuthUser; ip?: string | null }) {
  const backup = await backupById(id);
  if (!backup) fail('NOT_FOUND', 'That backup record does not exist');
  if (String(backup.status) === 'running') fail('INVALID_STATE', 'That backup is still running');

  let fileRemoved = false;
  if (backup.file_path && existsSync(String(backup.file_path))) {
    unlinkSync(String(backup.file_path));
    fileRemoved = true;
  }
  await deleteBackupRun(id);

  await writeActivityLog({
    ...actorOf(actor),
    action: 'deleted',
    module: 'settings',
    entityType: 'backup_history',
    entityId: id,
    entityLabel: String(backup.backup_name),
    description: `Backup ${backup.backup_name} removed${fileRemoved ? ' (dump file deleted)' : ''}`,
  });
  return { id, removed: true, fileRemoved };
}

/** Copies the vault into the backup directory — the "include uploads" switch. */
export async function copyUploadsToBackup(actor: { user: AuthUser; ip?: string | null }) {
  const includeUploads = (await getSettingValue('backup', 'include_uploads')) === 'true';
  if (!includeUploads) fail('INVALID_STATE', 'Uploaded files are excluded — enable “Include uploaded files” first');

  const source = resolve(process.env.STORAGE_LOCAL_PATH ?? './storage/uploads');
  const configuredPath = (await getSettingValue('backup', 'storage_path')) || './storage/backups';
  const outputDir = resolve(configuredPath);
  if (!existsSync(source)) fail('NOT_FOUND', `The upload directory ${source} does not exist`);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
  const destination = resolve(outputDir, `uploads-${stamp}`);
  mkdirSync(destination, { recursive: true });

  let copied = 0;
  let bytes = 0;
  const walk = (dir: string, relative: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const from = resolve(dir, entry.name);
      const to = resolve(destination, relative, entry.name);
      if (entry.isDirectory()) {
        mkdirSync(to, { recursive: true });
        walk(from, resolve(relative, entry.name));
      } else {
        copyFileSync(from, to);
        copied += 1;
        bytes += statSync(to).size;
      }
    }
  };
  walk(source, '.');

  await writeActivityLog({
    ...actorOf(actor),
    action: 'executed',
    module: 'settings',
    entityType: 'backup_history',
    entityLabel: `uploads-${stamp}`,
    description: `${copied} uploaded file(s) copied to ${destination} (${(bytes / 1024 / 1024).toFixed(2)} MB)`,
    status: 'success',
  });

  return { copied, bytes, destination };
}

/** Storage health for the backup screen. */
export async function storageHealth() {
  const vaultPath = resolve(process.env.STORAGE_LOCAL_PATH ?? './storage/uploads');
  const configuredPath = (await getSettingValue('backup', 'storage_path')) || './storage/backups';
  const backupPath = resolve(configuredPath);

  const measure = (path: string) => {
    if (!existsSync(path)) return { path, exists: false, files: 0, bytes: 0 };
    let files = 0;
    let bytes = 0;
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = resolve(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else {
          files += 1;
          bytes += statSync(full).size;
        }
      }
    };
    walk(path);
    return { path, exists: true, files, bytes };
  };

  return { vault: measure(vaultPath), backups: measure(backupPath) };
}

export async function filesInBackupDirectory() {
  const configuredPath = (await getSettingValue('backup', 'storage_path')) || './storage/backups';
  const outputDir = resolve(configuredPath);
  if (!existsSync(outputDir)) return [];
  return readdirSync(outputDir)
    .filter((entry) => entry.endsWith('.sql') || entry.startsWith('uploads-'))
    .map((entry) => {
      const full = resolve(outputDir, entry);
      const stat = statSync(full);
      return {
        name: entry,
        path: full,
        directory: stat.isDirectory(),
        bytes: stat.isDirectory() ? null : stat.size,
        modifiedAt: stat.mtime.toISOString().slice(0, 19).replace('T', ' '),
      };
    })
    .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
}
