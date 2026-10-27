/**
 * Compliance register services.
 *
 * The five registers share one lifecycle shape: create → update → (archive via
 * status, or soft delete when nothing references the row). Every mutation writes
 * an activity log, and the places where deleting would orphan orphic references
 * are refused with a `409 IN_USE` naming what still points at the row.
 *
 * The employer side adds two behaviours the specification calls for:
 *   • a document's status is *derived* from its expiry date, so nothing has to be
 *     clicked for a lapsed licence to read as Expired;
 *   • renewing a document records the new validity, clears the reminder stamp so
 *     the expiry job can fire again, and locks in who verified it.
 */
import { randomUUID } from 'node:crypto';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import * as repo from '@/repositories/compliance.repository';
import {
  actCreateSchema, actUpdateSchema, ruleCreateSchema, ruleUpdateSchema,
  regulationCreateSchema, regulationUpdateSchema,
  notificationCreateSchema, notificationUpdateSchema,
  documentCreateSchema, documentUpdateSchema, documentRenewSchema,
  DEFAULT_REMIND_DAYS,
} from '@/lib/validations/compliance.validation';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { notifyMany, usersWithRole } from '@/lib/notifications/notification-service';
import { sendTemplateEmail } from '@/lib/notifications/email-service';
import { APP_URL } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/dates';
import type { AuthUser } from '@/types/user';
import type { SqlValue } from '@/lib/db/query-helpers';

export interface ActorContext {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}

type ServiceError = Error & { code: string; issues?: { field: string; message: string }[] };

const notFound = (resource: string): ServiceError => Object.assign(new Error(`${resource} not found`), { code: 'NOT_FOUND' });
const conflict = (code: string, message: string): ServiceError => Object.assign(new Error(message), { code });
const validationFailed = (issues: { field: string; message: string }[]): ServiceError =>
  Object.assign(new Error('Please correct the highlighted fields'), { code: 'VALIDATION_FAILED', issues });

/* ══════════════════════════════════ acts ═════════════════════════════════ */

export async function listActs(filters: repo.ActListFilters) {
  const [result, stats, states] = await Promise.all([
    repo.findActs(filters),
    repo.actStats(),
    repo.actStates(),
  ]);
  return { ...result, stats, states };
}

export async function actRegister() {
  const [result, stats, states] = await Promise.all([
    repo.findActs({ page: 1, limit: 200, sortBy: 'act_name', sortDir: 'asc' }),
    repo.actStats(),
    repo.actStates(),
  ]);
  return { rows: result.data, stats, states };
}

export async function getActDetail(actId: number) {
  const act = await repo.findActById(actId);
  if (!act) throw notFound('Act');

  const [rules, regulations, notifications, documents] = await Promise.all([
    repo.findRules({ act_id: actId, page: 1, limit: 200, sortBy: 'rule_number', sortDir: 'asc' }),
    repo.findRegulations({ act_id: actId, page: 1, limit: 200 }),
    repo.findNotificationRegister({ act_id: actId, page: 1, limit: 200 }),
    repo.findDocuments({ act_id: actId, page: 1, limit: 200 }),
  ]);

  return {
    act,
    rules: rules.data,
    regulations: regulations.data,
    notifications: notifications.data,
    documents: documents.data,
    counts: {
      rules: rules.pagination.total,
      regulations: regulations.pagination.total,
      notifications: notifications.pagination.total,
      documents: documents.pagination.total,
    },
  };
}

export async function actOptions() {
  return repo.actOptions();
}

export async function createAct(payload: unknown, actor: ActorContext) {
  const input = actCreateSchema.parse(payload);
  const existing = await queryOne<RowDataPacket>(
    `SELECT id, act_name FROM compliance_acts
      WHERE deleted_at IS NULL AND act_name = ? AND COALESCE(act_year, 0) = COALESCE(?, 0) LIMIT 1`,
    [input.act_name, input.act_year ?? null]
  );
  if (existing) throw conflict('DUPLICATE', `"${String(existing.act_name)}" is already in the register`);

  const actId = await repo.createAct({
    ...input,
    created_by: actor.user.id,
    updated_by: actor.user.id,
  } as unknown as Record<string, SqlValue>);

  await writeActivityLog({
    userId: actor.user.id,
    action: 'created',
    module: 'compliance_act',
    entityType: 'compliance_act',
    entityId: actId,
    description: `Act ${input.act_name} added to the register`,
    newValues: { jurisdiction: input.jurisdiction, act_year: input.act_year },
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });

  return { actId, actName: input.act_name };
}

export async function updateAct(actId: number, payload: unknown, actor: ActorContext) {
  const existing = await repo.findActById(actId);
  if (!existing) throw notFound('Act');
  const input = actUpdateSchema.parse(payload);

  const duplicate = await queryOne<RowDataPacket>(
    `SELECT id FROM compliance_acts
      WHERE deleted_at IS NULL AND id <> ? AND act_name = ? AND COALESCE(act_year, 0) = COALESCE(?, 0) LIMIT 1`,
    [actId, input.act_name, input.act_year ?? null]
  );
  if (duplicate) throw conflict('DUPLICATE', 'Another act with this name and year already exists');

  await repo.updateAct(actId, { ...input, updated_by: actor.user.id } as unknown as Record<string, SqlValue>);
  await writeActivityLog({
    userId: actor.user.id,
    action: 'updated',
    module: 'compliance_act',
    entityType: 'compliance_act',
    entityId: actId,
    description: `Act ${input.act_name} updated`,
    newValues: { status: input.status },
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { actId, status: input.status };
}

export async function deleteAct(actId: number, actor: ActorContext) {
  const act = await repo.findActById(actId);
  if (!act) throw notFound('Act');
  const usage = await repo.actUsage(actId);
  if (usage.rules + usage.regulations + usage.notifications + usage.documents > 0) {
    throw conflict(
      'IN_USE',
      `${String(act.act_name)} still holds ${usage.rules} rule(s), ${usage.regulations} regulation(s), ` +
      `${usage.notifications} notification(s) and ${usage.documents} employer document(s) — set its status to repealed instead`
    );
  }
  await repo.softDeleteAct(actId, actor.user.id);
  await writeActivityLog({
    userId: actor.user.id,
    action: 'deleted',
    module: 'compliance_act',
    entityType: 'compliance_act',
    entityId: actId,
    description: `Act ${String(act.act_name)} removed from the register`,
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { actId, deleted: true };
}

/* ══════════════════════════════════ rules ════════════════════════════════ */

export async function listRules(filters: repo.RuleListFilters) {
  const [result, stats, acts] = await Promise.all([
    repo.findRules(filters),
    repo.ruleStats(),
    repo.actOptions(),
  ]);
  return { ...result, stats, actOptions: acts };
}

export async function ruleRegister(limit = 200) {
  const [result, stats, acts] = await Promise.all([
    repo.findRules({ page: 1, limit, sortBy: 'created_at', sortDir: 'desc' }),
    repo.ruleStats(),
    repo.actOptions(),
  ]);
  return { rows: result.data, stats, actOptions: acts };
}

export async function getRuleDetail(ruleId: number) {
  const rule = await repo.findRuleById(ruleId);
  if (!rule) throw notFound('Rule');
  const regulations = await repo.findRegulations({ act_id: rule.act_id ? Number(rule.act_id) : null, page: 1, limit: 200 });
  return { rule, regulations: regulations.data };
}

export async function ruleOptions(actId?: number | null) {
  return repo.ruleOptions(actId ?? null);
}

export async function createRule(payload: unknown, actor: ActorContext) {
  const input = ruleCreateSchema.parse(payload);
  const act = await repo.findActById(input.act_id);
  if (!act) throw validationFailed([{ field: 'act_id', message: 'Choose an act that exists in the register' }]);
  if (act.status === 'repealed') {
    throw validationFailed([{ field: 'act_id', message: `${String(act.act_name)} is repealed — obligations cannot be added under it` }]);
  }

  const ruleId = await repo.createRule({ ...input, created_by: actor.user.id, updated_by: actor.user.id } as unknown as Record<string, SqlValue>);
  await writeActivityLog({
    userId: actor.user.id,
    action: 'created',
    module: 'compliance_rule',
    entityType: 'compliance_rule',
    entityId: ruleId,
    description: `Rule ${input.rule_title} created under ${String(act.act_name)}`,
    newValues: { act_id: input.act_id, compliance_type: input.compliance_type, frequency: input.frequency },
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { ruleId, ruleTitle: input.rule_title };
}

export async function updateRule(ruleId: number, payload: unknown, actor: ActorContext) {
  const existing = await repo.findRuleById(ruleId);
  if (!existing) throw notFound('Rule');
  const input = ruleUpdateSchema.parse(payload);
  const act = await repo.findActById(input.act_id);
  if (!act) throw validationFailed([{ field: 'act_id', message: 'Choose an act that exists in the register' }]);

  if (Number(existing.act_id) !== Number(input.act_id)) {
    const usage = await repo.ruleUsage(ruleId);
    if (usage.regulations > 0) {
      throw conflict('IN_USE', `This rule is referenced by ${usage.regulations} regulation(s) — move those first or keep the act unchanged`);
    }
  }

  await repo.updateRule(ruleId, { ...input, updated_by: actor.user.id } as unknown as Record<string, SqlValue>);
  await writeActivityLog({
    userId: actor.user.id,
    action: 'updated',
    module: 'compliance_rule',
    entityType: 'compliance_rule',
    entityId: ruleId,
    description: `Rule ${input.rule_title} updated`,
    newValues: { status: input.status },
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { ruleId, status: input.status };
}

export async function deleteRule(ruleId: number, actor: ActorContext) {
  const rule = await repo.findRuleById(ruleId);
  if (!rule) throw notFound('Rule');
  const usage = await repo.ruleUsage(ruleId);
  if (usage.regulations > 0) {
    throw conflict('IN_USE', `${String(rule.rule_title)} is referenced by ${usage.regulations} regulation(s) — set it inactive instead`);
  }
  await repo.softDeleteRule(ruleId, actor.user.id);
  await writeActivityLog({
    userId: actor.user.id,
    action: 'deleted',
    module: 'compliance_rule',
    entityType: 'compliance_rule',
    entityId: ruleId,
    description: `Rule ${String(rule.rule_title)} removed`,
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { ruleId, deleted: true };
}

/* ═══════════════════════════════ regulations ═════════════════════════════ */

export async function listRegulations(filters: repo.RegulationListFilters) {
  const [result, stats, acts] = await Promise.all([
    repo.findRegulations(filters),
    repo.regulationStats(),
    repo.actOptions(),
  ]);
  return { ...result, stats, actOptions: acts };
}

export async function regulationRegister(limit = 200) {
  const [result, stats, acts] = await Promise.all([
    repo.findRegulations({ page: 1, limit, sortBy: 'created_at', sortDir: 'desc' }),
    repo.regulationStats(),
    repo.actOptions(),
  ]);
  return { rows: result.data, stats, actOptions: acts };
}

export async function getRegulationDetail(regulationId: number) {
  const regulation = await repo.findRegulationById(regulationId);
  if (!regulation) throw notFound('Regulation');
  return { regulation };
}

export async function createRegulation(payload: unknown, actor: ActorContext) {
  const input = regulationCreateSchema.parse(payload);
  if (input.act_id) {
    const act = await repo.findActById(input.act_id);
    if (!act) throw validationFailed([{ field: 'act_id', message: 'Choose an act that exists in the register' }]);
  }
  if (input.rule_id) {
    const rule = await repo.findRuleById(input.rule_id);
    if (!rule) throw validationFailed([{ field: 'rule_id', message: 'Choose a rule that exists in the register' }]);
    if (input.act_id && Number(rule.act_id) !== Number(input.act_id)) {
      throw validationFailed([{ field: 'rule_id', message: 'The chosen rule belongs to a different act' }]);
    }
  }

  const regulationId = await repo.createRegulation({
    ...input,
    created_by: actor.user.id,
    updated_by: actor.user.id,
  } as unknown as Record<string, SqlValue>);

  await writeActivityLog({
    userId: actor.user.id,
    action: 'created',
    module: 'compliance_regulation',
    entityType: 'compliance_regulation',
    entityId: regulationId,
    description: `Regulation ${input.regulation_name} added`,
    newValues: { act_id: input.act_id, rule_id: input.rule_id },
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { regulationId, regulationName: input.regulation_name };
}

export async function updateRegulation(regulationId: number, payload: unknown, actor: ActorContext) {
  const existing = await repo.findRegulationById(regulationId);
  if (!existing) throw notFound('Regulation');
  const input = regulationUpdateSchema.parse(payload);
  if (input.rule_id) {
    const rule = await repo.findRuleById(input.rule_id);
    if (!rule) throw validationFailed([{ field: 'rule_id', message: 'Choose a rule that exists in the register' }]);
    if (input.act_id && Number(rule.act_id) !== Number(input.act_id)) {
      throw validationFailed([{ field: 'rule_id', message: 'The chosen rule belongs to a different act' }]);
    }
  }
  await repo.updateRegulation(regulationId, { ...input, updated_by: actor.user.id } as unknown as Record<string, SqlValue>);
  await writeActivityLog({
    userId: actor.user.id,
    action: 'updated',
    module: 'compliance_regulation',
    entityType: 'compliance_regulation',
    entityId: regulationId,
    description: `Regulation ${input.regulation_name} updated`,
    newValues: { status: input.status },
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { regulationId, status: input.status };
}

export async function deleteRegulation(regulationId: number, actor: ActorContext) {
  const regulation = await repo.findRegulationById(regulationId);
  if (!regulation) throw notFound('Regulation');
  await repo.softDeleteRegulation(regulationId, actor.user.id);
  await writeActivityLog({
    userId: actor.user.id,
    action: 'deleted',
    module: 'compliance_regulation',
    entityType: 'compliance_regulation',
    entityId: regulationId,
    description: `Regulation ${String(regulation.regulation_name)} removed`,
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { regulationId, deleted: true };
}

/* ═══════════════════════════ gazette notifications ══════════════════════ */

export async function listNotificationRegister(filters: repo.NotificationRegisterFilters) {
  const [result, stats, acts] = await Promise.all([
    repo.findNotificationRegister(filters),
    repo.notificationRegisterStats(),
    repo.actOptions(),
  ]);
  return { ...result, stats, actOptions: acts };
}

export async function notificationRegister(limit = 200) {
  const [result, stats, acts] = await Promise.all([
    repo.findNotificationRegister({ page: 1, limit }),
    repo.notificationRegisterStats(),
    repo.actOptions(),
  ]);
  return { rows: result.data, stats, actOptions: acts };
}

export async function getNotificationRegisterRow(notificationId: number) {
  const notification = await repo.findNotificationRegisterById(notificationId);
  if (!notification) throw notFound('Notification');
  return { notification };
}

export async function createNotificationRegisterRow(payload: unknown, actor: ActorContext) {
  const input = notificationCreateSchema.parse(payload);
  if (input.act_id) {
    const act = await repo.findActById(input.act_id);
    if (!act) throw validationFailed([{ field: 'act_id', message: 'Choose an act that exists in the register' }]);
  }
  const duplicate = await queryOne<RowDataPacket>(
    'SELECT id FROM compliance_notifications WHERE deleted_at IS NULL AND notification_number = ? LIMIT 1',
    [input.notification_number]
  );
  if (duplicate) throw conflict('DUPLICATE', `Notification ${input.notification_number} is already registered`);

  const notificationId = await repo.createNotificationRegisterRow({
    ...input,
    created_by: actor.user.id,
    updated_by: actor.user.id,
  } as unknown as Record<string, SqlValue>);

  await writeActivityLog({
    userId: actor.user.id,
    action: 'created',
    module: 'compliance_notification',
    entityType: 'compliance_notification',
    entityId: notificationId,
    description: `Gazette notification ${input.notification_number} registered`,
    newValues: { act_id: input.act_id, effective_date: input.effective_date },
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { notificationId, notificationNumber: input.notification_number };
}

export async function updateNotificationRegisterRow(notificationId: number, payload: unknown, actor: ActorContext) {
  const existing = await repo.findNotificationRegisterById(notificationId);
  if (!existing) throw notFound('Notification');
  const input = notificationUpdateSchema.parse(payload);
  await repo.updateNotificationRegisterRow(notificationId, { ...input, updated_by: actor.user.id } as unknown as Record<string, SqlValue>);
  await writeActivityLog({
    userId: actor.user.id,
    action: 'updated',
    module: 'compliance_notification',
    entityType: 'compliance_notification',
    entityId: notificationId,
    description: `Notification ${input.notification_number} updated`,
    newValues: { status: input.status },
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { notificationId, status: input.status };
}

export async function deleteNotificationRegisterRow(notificationId: number, actor: ActorContext) {
  const existing = await repo.findNotificationRegisterById(notificationId);
  if (!existing) throw notFound('Notification');
  await repo.softDeleteNotificationRegisterRow(notificationId, actor.user.id);
  await writeActivityLog({
    userId: actor.user.id,
    action: 'deleted',
    module: 'compliance_notification',
    entityType: 'compliance_notification',
    entityId: notificationId,
    description: `Notification ${String(existing.notification_number)} removed`,
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { notificationId, deleted: true };
}

/* ═════════════════════════════ documents (register) ═════════════════════ */

export async function listDocuments(filters: repo.DocumentListFilters) {
  const [result, stats, types, acts, employers] = await Promise.all([
    repo.findDocuments(filters),
    repo.documentStats(filters.employer_id ?? null),
    repo.documentTypeBreakdown(filters.employer_id ?? null),
    repo.actOptions(),
    repo.employerPicker(),
  ]);
  return {
    ...result,
    stats,
    types,
    actOptions: acts,
    employerOptions: employers.map((row) => ({
      value: String(row.id),
      label: `${String(row.company_name)} (${String(row.employer_code)})`,
      hint: row.city ? String(row.city) : undefined,
    })),
  };
}

export async function documentRegister(employerId?: number | null) {
  const [result, stats, types, expiring] = await Promise.all([
    repo.findDocuments({ employer_id: employerId ?? null, page: 1, limit: 200 }),
    repo.documentStats(employerId ?? null),
    repo.documentTypeBreakdown(employerId ?? null),
    repo.expiringDocuments(90, 25),
  ]);
  return { rows: result.data, stats, types, expiring };
}

export async function getDocumentDetail(documentId: number) {
  const document = await repo.findDocumentById(documentId);
  if (!document) throw notFound('Document');
  const [acts, units] = await Promise.all([
    repo.actOptions(),
    repo.unitPicker(Number(document.employer_id)),
  ]);
  return { document, actOptions: acts, unitOptions: units.map((row) => ({ value: String(row.id), label: String(row.unit_name) })) };
}

export async function documentOptions(employerId?: number | null) {
  const [employers, acts] = await Promise.all([repo.employerPicker(), repo.actOptions()]);
  const units = employerId ? await repo.unitPicker(employerId) : [];
  return {
    employerOptions: employers.map((row) => ({
      value: String(row.id),
      label: `${String(row.company_name)} (${String(row.employer_code)})`,
      hint: row.city ? String(row.city) : undefined,
    })),
    unitOptions: units.map((row) => ({ value: String(row.id), label: String(row.unit_name) })),
    actOptions: acts,
    documentTypes: ['Licence', 'Certificate', 'Permit', 'Registration', 'Return', 'Approval', 'Agreement', 'Insurance', 'Other'],
    statuses: ['Valid', 'Expiring Soon', 'Expired', 'Applied for Renewal', 'Not Applicable'],
    defaultRemindDays: DEFAULT_REMIND_DAYS,
  };
}

/** The derived status for a set of dates, in one place for creates and renewals. */
function statusFor(expiryDate: string | null, remindDays: number, current: string): string {
  if (['Applied for Renewal', 'Not Applicable'].includes(current)) return current;
  if (!expiryDate) return 'Valid';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const days = Math.round((expiry.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return 'Expired';
  if (days <= remindDays) return 'Expiring Soon';
  return 'Valid';
}

function addDays(date: string, days: number): string {
  const base = new Date(`${date}T00:00:00`);
  base.setDate(base.getDate() + days);
  return base.toISOString().slice(0, 10);
}

export async function createDocument(payload: unknown, actor: ActorContext) {
  const input = documentCreateSchema.parse(payload);
  const employer = await queryOne<RowDataPacket>('SELECT id, company_name FROM employers WHERE id = ? AND deleted_at IS NULL', [input.employer_id]);
  if (!employer) throw validationFailed([{ field: 'employer_id', message: 'Choose an employer that exists' }]);

  if (input.unit_id) {
    const unit = await queryOne<RowDataPacket>('SELECT id FROM company_units WHERE id = ? AND employer_id = ? AND deleted_at IS NULL', [input.unit_id, input.employer_id]);
    if (!unit) throw validationFailed([{ field: 'unit_id', message: 'That unit does not belong to the chosen employer' }]);
  }

  const duplicate = await repo.findDuplicateDocument(input.employer_id, input.document_type, input.document_number);
  if (duplicate) {
    throw conflict('DUPLICATE', `${String(duplicate.document_name)} already records document number ${String(duplicate.document_number)}`);
  }

  // A validity period is enough on its own once the issue date is known.
  const expiry = input.expiry_date ?? (input.issue_date && input.validity_period_days ? addDays(input.issue_date, input.validity_period_days) : null);
  const status = statusFor(expiry, input.remind_days_before, input.is_verified ? 'Valid' : 'Valid');

  const documentId = await repo.createDocument({
    ...input,
    uuid: randomUUID(),
    expiry_date: expiry,
    compliance_status: status,
    verified_by: input.is_verified ? actor.user.id : null,
    verified_at: input.is_verified ? new Date() : null,
    created_by: actor.user.id,
    updated_by: actor.user.id,
  } as unknown as Record<string, SqlValue>);

  await writeActivityLog({
    userId: actor.user.id,
    action: 'created',
    module: 'compliance_document',
    entityType: 'compliance_document',
    entityId: documentId,
    description: `${input.document_name} added to the legal register for ${String(employer.company_name)}`,
    newValues: { employer_id: input.employer_id, document_type: input.document_type, expiry_date: expiry },
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });

  return {
    documentId,
    documentName: input.document_name,
    complianceStatus: status,
    daysToExpiry: expiry ? Math.round((new Date(`${expiry}T00:00:00`).getTime() - Date.now()) / 86_400_000) : null,
  };
}

export async function updateDocument(documentId: number, payload: unknown, actor: ActorContext) {
  const existing = await repo.findDocumentById(documentId);
  if (!existing) throw notFound('Document');
  const input = documentUpdateSchema.parse(payload);

  if (input.unit_id) {
    const unit = await queryOne<RowDataPacket>('SELECT id FROM company_units WHERE id = ? AND employer_id = ? AND deleted_at IS NULL', [input.unit_id, input.employer_id]);
    if (!unit) throw validationFailed([{ field: 'unit_id', message: 'That unit does not belong to the chosen employer' }]);
  }

  const expiry = input.expiry_date ?? (input.issue_date && input.validity_period_days ? addDays(input.issue_date, input.validity_period_days) : null);
  const previousStatus = String(existing.compliance_status);
  const status = statusFor(expiry, input.remind_days_before, previousStatus);

  // Verification is a deliberate act: stamp who did it, and stop re-notifying
  // if the dates actually moved (a renewal invalidates the old reminder).
  const datesChanged = String(existing.expiry_date ?? '') !== String(expiry ?? '');
  await repo.updateDocument(documentId, {
    ...input,
    expiry_date: expiry,
    compliance_status: status,
    reminder_sent_at: datesChanged ? null : existing.reminder_sent_at,
    verified_by: input.is_verified ? actor.user.id : null,
    verified_at: input.is_verified ? (existing.verified_at ?? new Date()) : null,
    updated_by: actor.user.id,
  } as unknown as Record<string, SqlValue>);

  await writeActivityLog({
    userId: actor.user.id,
    action: 'updated',
    module: 'compliance_document',
    entityType: 'compliance_document',
    entityId: documentId,
    description: `${input.document_name} updated`,
    oldValues: { status: previousStatus, expiry_date: existing.expiry_date },
    newValues: { status, expiry_date: expiry },
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });

  return { documentId, complianceStatus: status, previousStatus };
}

/**
 * Renewal: new issue/expiry dates, the reminder stamp cleared so the expiry job
 * can fire again for the next cycle, and the renewal recorded in the activity
 * log with both the old and the new validity.
 */
export async function renewDocument(documentId: number, payload: unknown, actor: ActorContext) {
  const existing = await repo.findDocumentById(documentId);
  if (!existing) throw notFound('Document');
  const input = documentRenewSchema.parse(payload);

  const issueDate = input.issue_date ?? (existing.issue_date ? String(existing.issue_date) : null);
  const expiryDate = input.expiry_date ?? (issueDate && input.validity_period_days ? addDays(issueDate, input.validity_period_days) : null);
  if (!expiryDate) {
    throw validationFailed([{ field: 'expiry_date', message: 'The renewed document needs its new expiry date' }]);
  }

  const status = statusFor(expiryDate, Number(existing.remind_days_before ?? DEFAULT_REMIND_DAYS), 'Valid');
  await repo.updateDocument(documentId, {
    issue_date: issueDate,
    expiry_date: expiryDate,
    validity_period_days: input.validity_period_days ?? existing.validity_period_days,
    document_number: input.document_number ?? existing.document_number,
    fee_amount: input.fee_amount ?? existing.fee_amount,
    notes: input.notes ?? existing.notes,
    compliance_status: status,
    reminder_sent_at: null,
    is_verified: true,
    verified_by: actor.user.id,
    verified_at: new Date(),
    updated_by: actor.user.id,
  } as unknown as Record<string, SqlValue>);

  await writeActivityLog({
    userId: actor.user.id,
    action: 'renewed',
    module: 'compliance_document',
    entityType: 'compliance_document',
    entityId: documentId,
    description: `${String(existing.document_name)} renewed to ${expiryDate}`,
    oldValues: { expiry_date: existing.expiry_date },
    newValues: { expiry_date: expiryDate, status },
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });

  return { documentId, expiryDate, complianceStatus: status };
}

/**
 * Verification is its own action because it is evidence: who checked the
 * certificate against the original, and when.
 */
export async function verifyDocument(documentId: number, isVerified: boolean, actor: ActorContext) {
  const existing = await repo.findDocumentById(documentId);
  if (!existing) throw notFound('Document');

  await repo.updateDocument(documentId, {
    is_verified: isVerified,
    verified_by: isVerified ? actor.user.id : null,
    verified_at: isVerified ? new Date() : null,
    updated_by: actor.user.id,
  } as unknown as Record<string, SqlValue>);

  await writeActivityLog({
    userId: actor.user.id,
    action: isVerified ? 'verified' : 'unverified',
    module: 'compliance_document',
    entityType: 'compliance_document',
    entityId: documentId,
    description: isVerified
      ? `${String(existing.document_name)} marked verified`
      : `${String(existing.document_name)} verification withdrawn`,
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { documentId, isVerified };
}

export async function deleteDocument(documentId: number, actor: ActorContext) {
  const existing = await repo.findDocumentById(documentId);
  if (!existing) throw notFound('Document');
  await repo.softDeleteDocument(documentId, actor.user.id);
  await writeActivityLog({
    userId: actor.user.id,
    action: 'deleted',
    module: 'compliance_document',
    entityType: 'compliance_document',
    entityId: documentId,
    description: `${String(existing.document_name)} removed from the legal register`,
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });
  return { documentId, deleted: true };
}

/**
 * Reminds the people who own an expiring document right now — the admin button
 * beside `npm run send:reminders`. The nightly job uses the same notification
 * path; this is the manual nudge for a document somebody just noticed.
 */
export async function remindDocument(documentId: number, actor: ActorContext) {
  const document = await repo.findDocumentById(documentId);
  if (!document) throw notFound('Document');
  if (!document.expiry_date) throw conflict('INVALID_STATE', 'This document has no expiry date to remind about');

  const daysToExpiry = Number(document.days_to_expiry ?? 0);
  const admins = [...new Set([...(await usersWithRole('admin')), ...(await usersWithRole('super_admin'))])];
  const recipients = await queryOne<RowDataPacket>(
    `SELECT COALESCE(e.compliance_contact_email, e.email) AS email,
            COALESCE(e.compliance_contact_person, e.contact_person_name) AS contact_person
     FROM employers e WHERE e.id = ?`,
    [Number(document.employer_id)]
  );
  const templateData = {
    recipient_name: String(recipients?.contact_person ?? 'Team'),
    employer_name: String(document.company_name ?? ''),
    document_name: String(document.document_name),
    document_type: String(document.document_type),
    document_number: String(document.document_number ?? '—'),
    issuing_authority: String(document.issuing_authority ?? '—'),
    expiry_date: formatDate(String(document.expiry_date)),
    days_remaining: daysToExpiry,
    renewal_responsibility: String(document.renewal_responsibility ?? 'Compliance Officer'),
    document_url: `${APP_URL}/admin/compliance/documents/${documentId}`,
  };
  const subject = `${document.document_name} expires in ${daysToExpiry} day(s)`;

  let emailed = 0;
  if (recipients?.email) {
    const result = await sendTemplateEmail({
      to: String(recipients.email),
      templateCode: 'compliance.document_expiring',
      data: templateData,
      entityType: 'compliance_document',
      entityId: documentId,
      sentBy: actor.user.id,
    });
    if (result.ok) emailed += 1;
  }

  if (admins.length) {
    await notifyMany(admins, {
      title: subject,
      message: `${String(document.company_name ?? 'An employer')} — ${String(document.document_name)} expires ${formatDate(String(document.expiry_date))}.`,
      type: 'action_required',
      category: 'COMPLIANCE',
      actionUrl: `/admin/compliance/documents/${documentId}`,
      actionLabel: 'Open document',
      entityType: 'compliance_document',
      entityId: documentId,
      channels: ['in_app'],
    });
  }

  await repo.updateDocument(documentId, { reminder_sent_at: new Date(), updated_by: actor.user.id } as unknown as Record<string, SqlValue>);
  await writeActivityLog({
    userId: actor.user.id,
    action: 'reminded',
    module: 'compliance_document',
    entityType: 'compliance_document',
    entityId: documentId,
    description: `Expiry reminder sent for ${String(document.document_name)} (${daysToExpiry} day(s) left)`,
    ipAddress: actor.ip ?? undefined,
    userAgent: actor.userAgent ?? undefined,
  });

  return { documentId, emailed, notified: admins.length, daysToExpiry };
}

/* ═════════════════════ employer-facing (own company only) ═══════════════ */

const forbidden = (message: string): ServiceError => Object.assign(new Error(message), { code: 'FORBIDDEN' });

/**
 * The employer panel never passes an employer id: it is taken from the session
 * and every read is scoped by it, so one company can never see another's
 * licences even by editing a URL.
 */
export async function listEmployerDocuments(employerId: number, filters: repo.DocumentListFilters) {
  const scoped = { ...filters, employer_id: employerId };
  const [result, stats, types, expiring, employer] = await Promise.all([
    repo.findDocuments(scoped),
    repo.documentStats(employerId),
    repo.documentTypeBreakdown(employerId),
    repo.expiringDocuments(90, 10),
    queryOne<RowDataPacket>('SELECT id, company_name, employer_code FROM employers WHERE id = ?', [employerId]),
  ]);
  return {
    ...result,
    stats,
    types,
    employer,
    expiring: expiring.filter((row) => Number(row.employer_id) === employerId),
  };
}

export async function employerComplianceOverview(employerId: number) {
  const [stats, types, expiring, units] = await Promise.all([
    repo.documentStats(employerId),
    repo.documentTypeBreakdown(employerId),
    repo.expiringDocuments(120, 50),
    repo.unitPicker(employerId),
  ]);
  return {
    stats,
    types,
    expiring: expiring.filter((row) => Number(row.employer_id) === employerId).slice(0, 8),
    unitOptions: units.map((row) => ({ value: String(row.id), label: String(row.unit_name) })),
  };
}

/** Employer-created rows always carry the session's employer id. */
export async function createEmployerDocument(employerId: number, payload: unknown, actor: ActorContext) {
  const body = payload && typeof payload === 'object' ? { ...(payload as Record<string, unknown>) } : {};
  return createDocument({ ...body, employer_id: employerId }, actor);
}

async function assertEmployerOwnsDocument(employerId: number, documentId: number) {
  const document = await repo.findDocumentById(documentId);
  if (!document) throw notFound('Document');
  if (Number(document.employer_id) !== Number(employerId)) {
    throw forbidden('This document belongs to another company');
  }
  return document;
}

export async function updateEmployerDocument(employerId: number, documentId: number, payload: unknown, actor: ActorContext) {
  await assertEmployerOwnsDocument(employerId, documentId);
  const body = payload && typeof payload === 'object' ? { ...(payload as Record<string, unknown>) } : {};
  return updateDocument(documentId, { ...body, employer_id: employerId }, actor);
}

export async function renewEmployerDocument(employerId: number, documentId: number, payload: unknown, actor: ActorContext) {
  await assertEmployerOwnsDocument(employerId, documentId);
  return renewDocument(documentId, payload, actor);
}

export async function deleteEmployerDocument(employerId: number, documentId: number, actor: ActorContext) {
  await assertEmployerOwnsDocument(employerId, documentId);
  return deleteDocument(documentId, actor);
}

export async function getEmployerDocumentDetail(employerId: number, documentId: number) {
  const document = await assertEmployerOwnsDocument(employerId, documentId);
  const acts = await repo.actOptions();
  const units = await repo.unitPicker(employerId);
  return {
    document,
    actOptions: acts,
    unitOptions: units.map((row) => ({ value: String(row.id), label: String(row.unit_name) })),
  };
}
