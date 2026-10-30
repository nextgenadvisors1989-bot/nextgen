/**
 * CAPAR (Corrective Action Plan Acknowledgement Report) use cases.
 *
 * An auditor writes the report: facility header, then one row per finding under an admin-editable category (Act / Rule
 * typed by hand, minimum requirement, finding, photo, root cause, action plan, timeline, evidence). A verifier marks each
 * finding Eligible / Not Eligible and approves the report or returns it with comments. Everything here is scoped by role:
 *   admin     every report
 *   auditor   the reports they wrote
 *   verifier  submitted reports assigned to them
 *   employer  approved reports about their own company
 */
import { searchProvisions } from '@/services/act-provision.service';
import { checklistGroups, listGroups, reportGroupIds, setReportGroups } from '@/services/capar-checklist.service';
import { localToday } from '@/lib/utils/dates';
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { notifyUser } from '@/lib/notifications/notification-service';
import { assertPermission } from '@/lib/auth/permission-check';
import { saveUploads, archiveFile, type UploadInput } from '@/lib/files/file-service';
import { nextDocumentNumber } from '@/lib/utils/report-number';
import { buildPagination, parsePagination } from '@/lib/utils/pagination';
import { z } from 'zod';
import { submitSchema } from '@/lib/validations/capar.validation';
import {
  caparCreateSchema, caparUpdateSchema, categorySchema, categoryUpdateSchema, decisionSchema, findingSchema,
  verifyFindingSchema, CAPAR_FILE_KINDS,
} from '@/lib/validations/capar.validation';
import * as repo from '@/repositories/capar.repository';
import type { AuthUser } from '@/types/user';

export type CaparRole = 'admin' | 'auditor' | 'verifier' | 'employer';
export interface Actor { user: AuthUser; ip?: string | null }

function fail(code: string, message: string, extra: Record<string, unknown> = {}): never {
  throw Object.assign(new Error(message), { code, ...extra });
}

export function caparRoleOf(user: AuthUser): CaparRole {
  const slugs = user.roles.map((role) => role.slug);
  if (slugs.includes('super_admin') || slugs.includes('admin')) return 'admin';
  if (slugs.includes('auditor')) return 'auditor';
  if (slugs.includes('verifier')) return 'verifier';
  if (slugs.includes('employer')) return 'employer';
  return fail('FORBIDDEN', 'Your account cannot open CAPAR reports');
}

/* ───────────────────────────── scoping ───────────────────────────── */

type Report = repo.Row;

/** Loads a report the caller is allowed to see, or refuses. */
async function loadScoped(user: AuthUser, id: number): Promise<{ report: Report; role: CaparRole }> {
  const role = caparRoleOf(user);
  const report = await repo.findReport(id);
  if (!report) return fail('NOT_FOUND', 'CAPAR report not found');
  if (role === 'auditor' && Number(report.auditor_id) !== Number(user.auditorId)) {
    return fail('FORBIDDEN', 'This CAPAR report was written by another auditor');
  }
  if (role === 'verifier' && (Number(report.verifier_id) !== user.id || report.status === 'Draft')) {
    return fail('FORBIDDEN', 'This CAPAR report is not assigned to you for review');
  }
  if (role === 'employer' && (Number(report.employer_id) !== Number(user.employerId) || report.status === 'Draft')) {
    return fail('NOT_FOUND', 'CAPAR report not found');
  }
  return { report, role };
}

// The auditor can keep correcting a report after submitting it; a change sends the row they touched back to the verifier. Approved reports are locked.
const EDITABLE = ['Draft', 'Returned', 'Submitted', 'Under Review'];
const SUBMITTABLE = ['Draft', 'Returned'];
const RESPONDABLE = ['Submitted', 'Under Review'];
const IN_REVIEW = ['Submitted', 'Under Review'];

function isOwner(user: AuthUser, report: Report) {
  return Number(report.auditor_id) === Number(user.auditorId);
}

/**
 * Details an auditor cannot type over because they come from records the administrator keeps: the facility, its address, the auditor printed
 * name and the firm, and (for a report started from an audit) the audit date and the verifier chosen for it.
 */
function lockedFields(role: CaparRole, report: Report): string[] {
  if (role !== 'auditor') return [];
  const locked = ['facility_name', 'facility_address', 'auditor_print_name', 'audit_firm', 'audit_type_id'];
  if (report.assignment_id) locked.push('audit_date');
  if (report.assignment_id && report.verifier_id) locked.push('verifier_id');
  return locked;
}

function canEdit(user: AuthUser, role: CaparRole, report: Report) {
  return EDITABLE.includes(String(report.status)) && (role === 'admin' || (role === 'auditor' && isOwner(user, report)));
}

function mustEdit(user: AuthUser, role: CaparRole, report: Report) {
  if (canEdit(user, role, report)) return;
  if (EDITABLE.includes(String(report.status))) return fail('FORBIDDEN', 'You cannot change this report');
  return fail('INVALID_STATE', `A ${String(report.status).toLowerCase()} report cannot be edited. Wait for the review, or ask an administrator to reopen it.`);
}

async function log(actor: Actor, report: Report | { id: number; report_number?: unknown; title?: unknown; employer_id?: unknown }, action: string, description: string, extra: { old?: Record<string, unknown>; next?: Record<string, unknown> } = {}) {
  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: report.employer_id ? Number(report.employer_id) : null,
    action, module: 'capar', entityType: 'capar_report', entityId: Number(report.id),
    entityLabel: String(report.report_number ?? report.title ?? ''), description,
    oldValues: extra.old ?? null, newValues: extra.next ?? null, ipAddress: actor.ip ?? null,
  });
}

/* ───────────────────────────── reports: list ───────────────────────────── */

export interface ReportListParams {
  page?: number; limit?: number; search?: string; status?: string; employerId?: number; sortBy?: string; sortDir?: string;
}

export async function listReports(user: AuthUser, params: ReportListParams) {
  assertPermission(user, 'capar.read');
  const role = caparRoleOf(user);
  const { page, limit, offset } = parsePagination({ page: params.page, limit: params.limit });

  const scope: Pick<repo.ReportListFilters, 'auditorId' | 'verifierId' | 'employerId' | 'statuses'> = {};
  if (role === 'auditor') scope.auditorId = Number(user.auditorId ?? 0) || -1;
  if (role === 'verifier') { scope.verifierId = user.id; scope.statuses = ['Submitted', 'Under Review', 'Returned', 'Approved']; }
  if (role === 'employer') { scope.employerId = Number(user.employerId ?? 0) || -1; scope.statuses = ['Submitted', 'Under Review', 'Returned', 'Approved']; }

  const { total, rows } = await repo.listReports({
    ...scope,
    search: params.search?.trim() || undefined,
    status: params.status && params.status !== 'all' ? params.status : undefined,
    employerId: role === 'employer' ? scope.employerId : params.employerId,
    sortBy: params.sortBy, sortDir: params.sortDir, limit, offset,
  });
  const stats = await repo.reportStatusCounts(scope);
  return { data: rows, pagination: buildPagination(total, page, limit), stats: { ...stats, total: Object.values(stats).reduce((sum, n) => sum + n, 0) } };
}

/* ───────────────────────────── reports: detail ───────────────────────────── */

export async function getReportDetail(user: AuthUser, id: number) {
  assertPermission(user, 'capar.read');
  const { report, role } = await loadScoped(user, id);

  let findings = await repo.listFindings(id);
  // The employer sees the findings that stood up in review, not the verifier's working notes.
  if (role === 'employer') {
    findings = findings
      .filter((finding) => finding.verification_status !== 'Not Eligible')
      .map((finding) => ({ ...finding, verification_remark: null, verified_by_name: null }));
  }
  const files = await repo.listFindingFiles(findings.map((finding) => Number(finding.id)));
  const messages = await query<RowDataPacket>(
    'SELECT id, finding_id, sender_role, sender_name, subject, body, created_at FROM capar_finding_messages WHERE report_id = ? ORDER BY id', [id]);
  const messageFiles = messages.length
    ? await query<RowDataPacket>(
        `SELECT mf.message_id, f.id AS file_id, f.original_name, f.mime_type, f.size_bytes
           FROM capar_message_files mf JOIN files f ON f.id = mf.file_id AND f.deleted_at IS NULL
          WHERE mf.message_id IN (${messages.map(() => '?').join(',')}) ORDER BY f.id`, messages.map((message) => Number(message.id)))
    : [];
  const withFiles = findings.map((finding) => ({
    ...finding,
    employer_signature_data: undefined,
    employer_signed: Boolean(finding.employer_signature_kind),
    messages: messages.filter((message) => Number(message.finding_id) === Number(finding.id)).map((message) => ({
      ...message,
      files: messageFiles.filter((file) => Number(file.message_id) === Number(message.id)).map((file) => ({ file_id: Number(file.file_id), name: String(file.original_name), mime_type: file.mime_type ? String(file.mime_type) : null, size: Number(file.size_bytes), url: `/api/files/${Number(file.file_id)}/download` })),
    })),
    files: files
      .filter((file) => Number(file.finding_id) === Number(finding.id))
      .map((file) => ({ ...file, storage_path: undefined, url: `/api/files/${file.file_id}/download` })),
  }));

  const editable = canEdit(user, role, report);
  const inReview = IN_REVIEW.includes(String(report.status));
  const reviewer = (role === 'admin' || role === 'verifier') && inReview;
  const can = {
    edit: editable,
    submit: editable && SUBMITTABLE.includes(String(report.status)) && (user.permissions.includes('*') || user.permissions.includes('capar.update')),
    delete: editable && report.status === 'Draft' && (user.permissions.includes('*') || user.permissions.includes('capar.delete')),
    // The verifier step is gone: the employer answers and the auditor closes the report.
    verify: false,
    decide: false,
    reopen: role === 'admin' && report.status === 'Approved',
    // The employer answers each finding; the auditor (or an administrator) reviews the answers. Both can write on a finding until the report closes.
    respond: role === 'employer' && RESPONDABLE.includes(String(report.status)),
    review: (role === 'admin' || (role === 'auditor' && isOwner(user, report))) && RESPONDABLE.includes(String(report.status)),
    message: (role === 'employer' || role === 'admin' || (role === 'auditor' && isOwner(user, report))) && RESPONDABLE.includes(String(report.status)),
    download: user.permissions.includes('*') || user.permissions.includes('capar.download'),
  };

  const [categories, events, checklist, groups, picked] = await Promise.all([
    repo.listCategories(false),
    role === 'employer' ? Promise.resolve([]) : repo.listEvents(id),
    checklistGroups(),
    listGroups(),
    reportGroupIds(id),
  ]);

  return {
    report: { ...report, auditor_signature_path: undefined, signature_data: undefined, has_signature: Boolean(report.signature_data), review_comments: role === 'employer' ? null : report.review_comments },
    findings: withFiles,
    categories,
    checklist,
    groups: groups.map((group) => ({ ...group, selected: picked.includes(group.id) })),
    events,
    role,
    can,
    locked: lockedFields(role, report),
    branding: {
      logoUrl: report.logo_file_id ? `/api/files/${report.logo_file_id}/download` : null,
      letterheadUrl: report.letterhead_file_id ? `/api/files/${report.letterhead_file_id}/download` : null,
    },
  };
}

/** The report a caller may download as PDF (the same scope rules as opening it), or a refusal. */
export async function reportForDownload(actor: Actor, id: number) {
  assertPermission(actor.user, 'capar.download');
  const { report } = await loadScoped(actor.user, id);
  await log(actor, report, 'exported', `CAPAR ${String(report.report_number)} downloaded as PDF`);
  return report;
}

/* ───────────────────────────── reports: create / update / delete ───────────────────────────── */

async function companyName(): Promise<string> {
  const row = await queryOne<RowDataPacket>("SELECT setting_value FROM settings WHERE setting_group = 'company' AND setting_key = 'company_name'");
  return String(row?.setting_value ?? '').trim();
}

export async function createReport(actor: Actor, input: unknown) {
  assertPermission(actor.user, 'capar.create');
  const role = caparRoleOf(actor.user);
  if (role !== 'admin' && role !== 'auditor') fail('FORBIDDEN', 'Only an auditor can write a CAPAR report');
  const data = caparCreateSchema.parse(input);

  let auditorId: number | null = role === 'auditor' ? Number(actor.user.auditorId ?? 0) || null : (data.auditor_id ?? null);
  if (role === 'auditor' && !auditorId) fail('FORBIDDEN', 'Your login is not linked to an auditor profile yet. Ask the administrator to link it (Users > Link to an auditor).');
  const assignment = data.assignment_id ? await repo.assignmentForHeader(data.assignment_id) : null;
  // An auditor reports on an audit the administrator assigned to them; the audit decides the company, unit, date and verifier.
  if (role === 'auditor' && !data.assignment_id) fail('VALIDATION_FAILED', 'Choose the audit you are reporting on. Only audits the administrator assigned to you are listed.', { issues: [{ field: 'assignment_id', message: 'Choose the audit' }] });
  if (data.assignment_id) {
    if (!assignment) fail('INVALID_REFERENCE', 'That audit assignment does not exist');
    if (data.employer_id && Number(assignment!.employer_id) !== data.employer_id) fail('VALIDATION_FAILED', 'That audit assignment belongs to a different employer');
    if (role === 'auditor' && Number(assignment!.auditor_id) !== auditorId) fail('FORBIDDEN', 'That audit is assigned to another auditor');
    if (!auditorId) auditorId = Number(assignment!.auditor_id);
  }
  const employerId = assignment ? Number(assignment.employer_id) : data.employer_id;
  if (!employerId) fail('VALIDATION_FAILED', 'Select the employer', { issues: [{ field: 'employer_id', message: 'Select the employer' }] });
  if (!auditorId) fail('VALIDATION_FAILED', 'Choose the auditor who is writing this report');
  const auditor = await repo.auditorById(auditorId!);
  if (!auditor) fail('INVALID_REFERENCE', 'That auditor does not exist');

  if (role === 'auditor' && !data.audit_type_id) fail('VALIDATION_FAILED', 'Choose the audit you are going to report on', { issues: [{ field: 'audit_type_id', message: 'Choose the audit type' }] });
  if (role === 'auditor' && !String(data.audit_purpose ?? '').trim()) fail('VALIDATION_FAILED', 'Say why this audit is being done', { issues: [{ field: 'audit_purpose', message: 'Enter the purpose of the audit' }] });
  const auditType = data.audit_type_id ? await queryOne<RowDataPacket>('SELECT id, name FROM audit_types WHERE id = ? AND deleted_at IS NULL', [data.audit_type_id]) : null;
  if (data.audit_type_id && !auditType) fail('INVALID_REFERENCE', 'That audit type is not in the list');

  const employer = await repo.employerForHeader(employerId!);
  if (!employer) fail('INVALID_REFERENCE', 'That employer does not exist');
  // The employer's Audit Documents pack is NOT required to start: the auditor is only reminded when it has not been submitted.
  const fromAssignment = role === 'auditor';
  const unitId = (fromAssignment ? null : data.unit_id) ?? (assignment?.unit_id ? Number(assignment.unit_id) : null);
  const unit = unitId ? await repo.unitForHeader(unitId, employerId!) : null;
  if (unitId && !unit) fail('INVALID_REFERENCE', 'That unit does not belong to this employer');

  const facilityName = (fromAssignment ? undefined : data.facility_name) ?? (unit ? `${employer!.company_name} - ${unit.unit_name}` : String(employer!.company_name));
  const employerAddress = [employer!.address_line_1, employer!.address_line_2, employer!.city, employer!.state, employer!.pincode]
    .filter(Boolean).join(', ');
  const today = localToday();
  const auditDate = (fromAssignment ? undefined : data.audit_date) ?? (assignment?.start_date ? String(assignment.start_date) : today);
  const firm = (fromAssignment ? undefined : data.audit_firm) ?? (await companyName()) ?? null;

  const reportNumber = await nextDocumentNumber('capar');
  const id = await repo.insertReport({
    uuid: crypto.randomUUID(),
    report_number: reportNumber,
    title: data.title ?? `CAPAR - ${facilityName} - ${auditDate}`,
    employer_id: employerId,
    unit_id: unitId,
    assignment_id: data.assignment_id ?? null,
    audit_type_id: auditType ? Number(auditType.id) : null,
    buyer_standards: auditType && String(auditType.name).startsWith('International Buyer') ? data.buyer_standards ?? null : null,
    audit_purpose: data.audit_purpose ?? null,
    auditor_id: auditorId,
    verifier_id: (fromAssignment ? undefined : data.verifier_id) ?? (assignment?.verifier_id ? Number(assignment.verifier_id) : null),
    facility_name: facilityName,
    facility_address: (fromAssignment ? undefined : data.facility_address) ?? (unit?.address ? String(unit.address) : employerAddress) ?? null,
    representative_name: data.representative_name ?? (employer!.contact_person_name ? String(employer!.contact_person_name) : null),
    representative_title: data.representative_title ?? (employer!.contact_person_designation ? String(employer!.contact_person_designation) : null),
    audit_date: auditDate,
    audit_firm: firm || null,
    auditor_print_name: (fromAssignment ? undefined : data.auditor_print_name) ?? String(auditor!.name),
    standard_reference: data.standard_reference ?? null,
    status: 'Draft',
    created_by: actor.user.id,
    updated_by: actor.user.id,
  });
  const created = await repo.findReport(id);
  await log(actor, created!, 'created', `CAPAR ${reportNumber} started for ${facilityName}`);
  return created!;
}

export async function updateReport(actor: Actor, id: number, input: unknown) {
  assertPermission(actor.user, 'capar.update');
  const { report, role } = await loadScoped(actor.user, id);
  mustEdit(actor.user, role, report);
  const parsed = caparUpdateSchema.parse(input) as Record<string, unknown>;
  for (const key of lockedFields(role, report)) delete parsed[key];
  const data = parsed as ReturnType<typeof caparUpdateSchema.parse>;
  if (data.verifier_id) {
    const verifiers = await repo.lookupVerifiers();
    if (!verifiers.some((verifier) => Number(verifier.id) === data.verifier_id)) fail('VALIDATION_FAILED', 'Choose a verifier from the list');
  }
  const { group_ids: groupIds, ...fields } = data as typeof data & { group_ids?: number[] };
  if (groupIds) await setReportGroups(id, groupIds);
  if (Object.keys(fields).length) await repo.updateReport(id, { ...fields, updated_by: actor.user.id });
  const updated = await repo.findReport(id);
  await log(actor, updated!, 'updated', `CAPAR ${String(report.report_number)} details updated`);
  return updated!;
}

export async function deleteReport(actor: Actor, id: number) {
  assertPermission(actor.user, 'capar.delete');
  const { report, role } = await loadScoped(actor.user, id);
  if (report.status !== 'Draft') fail('INVALID_STATE', 'Only a draft report can be deleted');
  mustEdit(actor.user, role, report);
  await repo.softDeleteReport(id);
  await log(actor, report, 'deleted', `CAPAR ${String(report.report_number)} deleted`);
}

/* ───────────────────────────── findings ───────────────────────────── */

async function checkFindingRefs(data: { category_id?: number | null; evidence_item_id?: number | null; act_id?: number | null; provision_id?: number | null; resource_id?: number | null }, reportId?: number, findingId?: number) {
  if (data.evidence_item_id) {
    const item = await queryOne<RowDataPacket>("SELECT id FROM evidence_items WHERE id = ? AND deleted_at IS NULL", [data.evidence_item_id]);
    if (!item) fail('INVALID_REFERENCE', 'That checklist item no longer exists');
    const taken = await queryOne<RowDataPacket>(
      'SELECT id FROM capar_findings WHERE report_id = ? AND evidence_item_id = ? AND deleted_at IS NULL AND id <> ?', [reportId ?? 0, data.evidence_item_id, findingId ?? 0]);
    if (taken) fail('DUPLICATE', 'This checklist item already has a row in the report. Open it and edit it.');
  }
  if (data.provision_id) {
    const row = await queryOne<RowDataPacket>('SELECT id FROM act_provisions WHERE id = ? AND deleted_at IS NULL', [data.provision_id]);
    if (!row) fail('INVALID_REFERENCE', 'That Act provision is no longer in the library');
  }
  if (data.category_id) {
    const category = await repo.findCategory(data.category_id);
    if (!category) fail('INVALID_REFERENCE', 'That category no longer exists');
  }
  if (data.act_id) {
    const row = await queryOne<RowDataPacket>('SELECT id FROM compliance_acts WHERE id = ? AND deleted_at IS NULL', [data.act_id]);
    if (!row) fail('INVALID_REFERENCE', 'That Act is not in the register');
  }
  if (data.resource_id) {
    const row = await queryOne<RowDataPacket>('SELECT id FROM cms_resources WHERE id = ? AND deleted_at IS NULL', [data.resource_id]);
    if (!row) fail('INVALID_REFERENCE', 'That document is not in the library');
  }
}

async function loadFinding(reportId: number, findingId: number) {
  const finding = await repo.findFinding(findingId);
  if (!finding || Number(finding.report_id) !== reportId) return fail('NOT_FOUND', 'Finding not found');
  return finding;
}

/**
 * The auditor's working status for a row. "Not findings" means nothing was found, so the result is No Violation. "Verified" means the row is
 * complete and the auditor signs it off (name and time recorded); a violation must then carry what was found, the root cause, the action plan and a timeline.
 * Moving a row back to Incomplete clears the sign-off.
 */
function itemStatusRules(user: AuthUser, current: Record<string, unknown>, data: Record<string, unknown>): Record<string, unknown> {
  const status = data.item_status as string | undefined;
  if (!status) return {};
  const merged = (key: string) => (data[key] !== undefined ? data[key] : current[key]);
  const out: Record<string, unknown> = {};
  if (status === 'Not findings') {
    out.outcome = 'No Violation';
  }
  if (status === 'Verified') {
    const outcome = (data.outcome ?? current.outcome ?? 'Violation') as string;
    if (outcome === 'Violation') {
      const missing: { field: string; message: string }[] = [];
      for (const [key, label] of [['finding', 'what was found'], ['root_cause', 'the root cause'], ['action_plan', 'the action plan'], ['timeline_date', 'a timeline']] as const) {
        if (!String(merged(key) ?? '').trim()) missing.push({ field: key, message: `Fill in ${label} before the row is verified` });
      }
      if (missing.length) throw Object.assign(new Error('This row is not complete yet.'), { code: 'VALIDATION_FAILED', issues: missing });
    }
    if (current.item_status !== 'Verified') {
      out.signed_by = user.fullName;
      out.signed_at = new Date();
    }
  } else {
    out.signed_by = null;
    out.signed_at = null;
  }
  return out;
}

export async function addFinding(actor: Actor, reportId: number, input: unknown) {
  assertPermission(actor.user, 'capar.update');
  const { report, role } = await loadScoped(actor.user, reportId);
  mustEdit(actor.user, role, report);
  const data = findingSchema.parse(input);
  await checkFindingRefs(data, reportId);
  const sortOrder = await repo.nextFindingOrder(reportId);
  const id = await repo.insertFinding(reportId, { ...data, ...itemStatusRules(actor.user, {}, data), sort_order: sortOrder });
  await repo.updateReport(reportId, { updated_by: actor.user.id });
  await log(actor, report, 'updated', `Finding added to CAPAR ${String(report.report_number)}`);
  return repo.findFinding(id);
}

export async function updateFinding(actor: Actor, reportId: number, findingId: number, input: unknown) {
  assertPermission(actor.user, 'capar.update');
  const { report, role } = await loadScoped(actor.user, reportId);
  mustEdit(actor.user, role, report);
  const finding = await loadFinding(reportId, findingId);
  const data = findingSchema.parse(input);
  await checkFindingRefs(data, reportId, findingId);

  const patch: Record<string, unknown> = { ...data, ...itemStatusRules(actor.user, finding, data) };
  // Closing an action stamps the date; reopening it clears it.
  if (data.action_status === 'Closed' && finding.action_status !== 'Closed' && data.closed_on === undefined) {
    patch.closed_on = localToday();
  }
  if (data.action_status && data.action_status !== 'Closed' && data.closed_on === undefined) patch.closed_on = null;
  // A change after the verifier returned the report, or while it is in review, has to be looked at again.
  if ((report.status === 'Returned' || IN_REVIEW.includes(String(report.status))) && finding.verification_status !== 'Pending') {
    patch.verification_status = 'Pending';
    patch.verified_by = null;
    patch.verified_at = null;
  }
  if (RESPONDABLE.includes(String(report.status)) && finding.response_status !== 'Pending') {
    patch.response_status = 'Pending';
    patch.response_review_note = null;
  }
  await repo.updateFinding(findingId, patch);
  await repo.updateReport(reportId, { updated_by: actor.user.id });
  if (RESPONDABLE.includes(String(report.status))) await recomputeStatus(report.id as number, actor);
  return repo.findFinding(findingId);
}

export async function deleteFinding(actor: Actor, reportId: number, findingId: number) {
  assertPermission(actor.user, 'capar.update');
  const { report, role } = await loadScoped(actor.user, reportId);
  mustEdit(actor.user, role, report);
  await loadFinding(reportId, findingId);
  await repo.softDeleteFinding(findingId);
  await repo.updateReport(reportId, { updated_by: actor.user.id });
  await log(actor, report, 'updated', `Finding removed from CAPAR ${String(report.report_number)}`);
  if (RESPONDABLE.includes(String(report.status))) await recomputeStatus(Number(report.id), actor);
}

/* ───────────────────────────── finding files (photos / evidence) ───────────────────────────── */

export async function attachFiles(actor: Actor, reportId: number, findingId: number, files: UploadInput[], kindInput: string, caption: string | null) {
  assertPermission(actor.user, 'capar.upload');
  const { report, role } = await loadScoped(actor.user, reportId);
  mustEdit(actor.user, role, report);
  await loadFinding(reportId, findingId);
  const kind = (CAPAR_FILE_KINDS as readonly string[]).includes(kindInput) ? kindInput : 'Photo';
  const saved = await saveUploads(
    files,
    { entityType: 'CAPAR', entityId: reportId, category: kind === 'Photo' ? 'CAPAR photo' : 'CAPAR evidence', accessLevel: 'private', description: caption },
    { user: actor.user, ip: actor.ip ?? null }
  );
  for (const file of saved) {
    await repo.insertFindingFile({ finding_id: findingId, file_id: file.id, kind, caption, created_by: actor.user.id });
  }
  await repo.updateReport(reportId, { updated_by: actor.user.id });
  return saved;
}

/* ───────────────────────────── the employer's answers and the auditor's review ───────────────────────────── */

const messageSchema = z.object({
  subject: z.string().trim().min(3, 'Write a subject').max(200),
  body: z.string().trim().min(2, 'Write your message').max(4000),
});
const respondSchema = z.object({
  response_text: z.string().trim().min(5, 'Say what has been done to fix this').max(6000),
  signature_kind: z.enum(['drawn', 'typed']),
  signature_data: z.string().min(2, 'Sign before you submit').max(400000),
});
const reviewSchema = z.object({
  decision: z.enum(['approve', 'decline']),
  note: z.string().trim().max(2000).optional().nullable(),
});

async function notifyEmployerUsers(report: Report, input: { title: string; message: string; channels?: ('in_app' | 'email')[] }) {
  const users = await query<RowDataPacket>('SELECT DISTINCT user_id FROM employer_users WHERE employer_id = ?', [Number(report.employer_id)]);
  for (const row of users) {
    await notifyUser({
      userId: Number(row.user_id), title: input.title, message: input.message, type: 'action_required', category: 'REPORT', priority: 'high',
      actionUrl: `/employer/capar/${Number(report.id)}`, actionLabel: 'Open the report', entityType: 'capar_report', entityId: Number(report.id),
      channels: input.channels ?? ['in_app', 'email'],
    }).catch(() => undefined);
  }
}

async function notifyAuditorUser(report: Report, input: { title: string; message: string }) {
  if (!report.auditor_user_id) return;
  await notifyUser({
    userId: Number(report.auditor_user_id), title: input.title, message: input.message, type: 'action_required', category: 'REPORT', priority: 'high',
    actionUrl: `/auditor/capar/${Number(report.id)}`, actionLabel: 'Open the report', entityType: 'capar_report', entityId: Number(report.id),
    channels: ['in_app', 'email'],
  }).catch(() => undefined);
}

/**
 * The report's state follows its rows. When every finding that is a violation has been approved the report is closed; otherwise it is
 * "Under Review" while an answer from the employer is waiting for the auditor, and "Submitted" (pending) while the employer has to answer.
 */
async function recomputeStatus(reportId: number, actor: Actor) {
  const report = await repo.findReport(reportId);
  if (!report || !RESPONDABLE.includes(String(report.status))) return;
  const rows = await query<RowDataPacket>("SELECT response_status FROM capar_findings WHERE report_id = ? AND outcome = 'Violation' AND deleted_at IS NULL", [reportId]);
  if (rows.length && rows.every((row) => row.response_status === 'Approved')) {
    await repo.updateReport(reportId, { status: 'Approved', approved_at: new Date(), reviewed_at: new Date(), updated_by: actor.user.id });
    await repo.insertEvent({ report_id: reportId, action: 'Approved', comments: 'Every finding was answered and approved. The report is closed.', actor_id: actor.user.id, actor_name: actor.user.fullName });
    await log(actor, report, 'approved', `CAPAR ${String(report.report_number)} closed: every finding approved`);
    await notifyEmployerUsers(report, { title: 'CAPAR report closed', message: `${String(report.title)} (${String(report.report_number)}) is closed. Every finding was approved.`, channels: ['in_app', 'email'] });
    await notifyAuditorUser(report, { title: 'CAPAR report closed', message: `${String(report.title)} (${String(report.report_number)}) is closed. Every finding was approved.` });
    return;
  }
  const next = rows.some((row) => row.response_status === 'Employer Submitted') ? 'Under Review' : 'Submitted';
  if (next !== report.status) await repo.updateReport(reportId, { status: next, updated_by: actor.user.id });
}

export async function addMessage(actor: Actor, reportId: number, findingId: number, input: unknown, uploads: UploadInput[] = []) {
  assertPermission(actor.user, 'capar.read');
  const { report, role } = await loadScoped(actor.user, reportId);
  if (role === 'verifier') fail('FORBIDDEN', 'You cannot write on this report');
  if (role === 'auditor' && !isOwner(actor.user, report)) fail('FORBIDDEN', 'This CAPAR report was written by another auditor');
  if (report.status === 'Approved') fail('INVALID_STATE', 'This report is closed.');
  if (!RESPONDABLE.includes(String(report.status))) fail('INVALID_STATE', 'The report has not been sent to the employer yet.');
  await loadFinding(reportId, findingId);
  const data = messageSchema.parse(input);
  const side = role === 'employer' ? 'employer' : 'auditor';
  const messageId = await repo.query_insertMessage({ report_id: reportId, finding_id: findingId, sender_role: side, sender_id: actor.user.id, sender_name: actor.user.fullName, subject: data.subject, body: data.body });
  if (uploads.length) {
    const saved = await saveUploads(uploads, { entityType: 'CAPAR', entityId: reportId, category: 'CAPAR message', accessLevel: 'private' }, { user: actor.user, ip: actor.ip ?? null });
    for (const file of saved) await execute('INSERT IGNORE INTO capar_message_files (message_id, file_id) VALUES (?, ?)', [messageId, file.id]);
  }
  const note = { title: `Message on ${String(report.report_number)}: ${data.subject}`, message: `${actor.user.fullName}: ${data.body.slice(0, 300)}${uploads.length ? ` (${uploads.length} file${uploads.length === 1 ? '' : 's'} attached)` : ''}` };
  if (side === 'employer') await notifyAuditorUser(report, note); else await notifyEmployerUsers(report, note);
  return { id: messageId };
}

export async function attachEmployerFiles(actor: Actor, reportId: number, findingId: number, files: UploadInput[]) {
  assertPermission(actor.user, 'capar.read');
  const { report, role } = await loadScoped(actor.user, reportId);
  if (role !== 'employer') fail('FORBIDDEN', 'Only the employer attaches the proof of a fix');
  if (!RESPONDABLE.includes(String(report.status))) fail('INVALID_STATE', 'This report is not open for answers.');
  const finding = await loadFinding(reportId, findingId);
  if (!['Pending', 'Declined'].includes(String(finding.response_status))) fail('INVALID_STATE', 'This finding has already been answered.');
  if (!files.length) fail('VALIDATION_FAILED', 'Choose at least one file');
  const saved = await saveUploads(files, { entityType: 'CAPAR', entityId: reportId, category: 'CAPAR employer proof', accessLevel: 'employer' }, { user: actor.user, ip: actor.ip ?? null });
  for (const file of saved) await repo.insertFindingFile({ finding_id: findingId, file_id: file.id, kind: 'Evidence', caption: null, created_by: actor.user.id, source: 'employer' });
  return saved;
}

export async function respondToFinding(actor: Actor, reportId: number, findingId: number, input: unknown) {
  assertPermission(actor.user, 'capar.read');
  const { report, role } = await loadScoped(actor.user, reportId);
  if (role !== 'employer') fail('FORBIDDEN', 'Only the employer answers a finding');
  if (!RESPONDABLE.includes(String(report.status))) fail('INVALID_STATE', 'This report is not open for answers.');
  const finding = await loadFinding(reportId, findingId);
  if (finding.outcome !== 'Violation') fail('INVALID_STATE', 'Only a finding with an issue needs an answer.');
  if (!['Pending', 'Declined'].includes(String(finding.response_status))) fail('INVALID_STATE', 'This finding has already been answered.');
  const parsed = respondSchema.safeParse(input ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({ field: String(issue.path[0] ?? 'form'), message: issue.message }));
    fail('VALIDATION_FAILED', issues[0].message, { issues });
  }
  const data = parsed.data;
  await repo.updateFinding(findingId, {
    response_status: 'Employer Submitted', response_text: data.response_text, employer_signature_kind: data.signature_kind, employer_signature_data: data.signature_data,
    employer_signed_by: actor.user.fullName, employer_signed_at: new Date(), response_review_note: null,
  });
  await recomputeStatus(reportId, actor);
  await log(actor, report, 'updated', `Employer answered a finding of CAPAR ${String(report.report_number)}`);
  await notifyAuditorUser(report, { title: 'The employer has answered a finding', message: `${actor.user.fullName} submitted the fix for a finding in ${String(report.report_number)}. Approve or decline it.` });
  return repo.findFinding(findingId);
}

export async function reviewFinding(actor: Actor, reportId: number, findingId: number, input: unknown) {
  assertPermission(actor.user, 'capar.update');
  const { report, role } = await loadScoped(actor.user, reportId);
  if (role !== 'auditor' && role !== 'admin') fail('FORBIDDEN', 'Only the auditor reviews the employer answers');
  if (role === 'auditor' && !isOwner(actor.user, report)) fail('FORBIDDEN', 'This CAPAR report was written by another auditor');
  if (!RESPONDABLE.includes(String(report.status))) fail('INVALID_STATE', 'This report is closed or has not been sent yet.');
  const finding = await loadFinding(reportId, findingId);
  if (finding.response_status !== 'Employer Submitted') fail('INVALID_STATE', 'There is no answer from the employer to review on this finding.');
  const data = reviewSchema.parse(input ?? {});
  const note = (data.note ?? '').trim();
  if (data.decision === 'decline' && note.length < 3) fail('VALIDATION_FAILED', 'Say what is still missing', { issues: [{ field: 'note', message: 'Say what is still missing' }] });
  await repo.updateFinding(findingId, {
    response_status: data.decision === 'approve' ? 'Approved' : 'Declined', response_reviewed_by: actor.user.fullName, response_reviewed_at: new Date(), response_review_note: note || null,
  });
  await recomputeStatus(reportId, actor);
  const closed = (await repo.findReport(reportId))?.status === 'Approved';
  if (!closed) {
    await notifyEmployerUsers(report, data.decision === 'approve'
      ? { title: 'A finding was approved', message: `The auditor approved your answer on a finding in ${String(report.report_number)}.` }
      : { title: 'A finding was declined', message: `The auditor declined your answer on a finding in ${String(report.report_number)}: ${note}` });
  }
  return repo.findFinding(findingId);
}


export async function removeFindingFile(actor: Actor, reportId: number, linkId: number) {
  assertPermission(actor.user, 'capar.update');
  const { report, role } = await loadScoped(actor.user, reportId);
  mustEdit(actor.user, role, report);
  const link = await repo.findFindingFile(linkId);
  if (!link || Number(link.report_id) !== reportId) fail('NOT_FOUND', 'Attachment not found');
  await repo.deleteFindingFile(linkId);
  await archiveFile(Number(link!.file_id), { user: actor.user, ip: actor.ip ?? null }).catch(() => false);
}

/** The per-report logo / letterhead override; without one the PDF uses the company's own. */
export async function setBranding(actor: Actor, reportId: number, kind: 'logo' | 'letterhead', file: UploadInput | null) {
  assertPermission(actor.user, 'capar.upload');
  const { report, role } = await loadScoped(actor.user, reportId);
  mustEdit(actor.user, role, report);
  const column = kind === 'logo' ? 'logo_file_id' : 'letterhead_file_id';
  if (!file) {
    await repo.updateReport(reportId, { [column]: null, updated_by: actor.user.id });
    return null;
  }
  if (!/^image\/(png|jpe?g)$/i.test(file.mimeType)) fail('VALIDATION_FAILED', 'Upload the logo or letterhead as a PNG or JPG image');
  const [saved] = await saveUploads(
    [file],
    { entityType: 'CAPAR', entityId: reportId, category: kind === 'logo' ? 'CAPAR logo' : 'CAPAR letterhead', accessLevel: 'private' },
    { user: actor.user, ip: actor.ip ?? null }
  );
  await repo.updateReport(reportId, { [column]: saved.id, updated_by: actor.user.id });
  return saved;
}

/* ───────────────────────────── submit / review ───────────────────────────── */

export async function submitReport(actor: Actor, id: number, input: unknown) {
  assertPermission(actor.user, 'capar.update');
  const { report, role } = await loadScoped(actor.user, id);
  mustEdit(actor.user, role, report);
  if (!SUBMITTABLE.includes(String(report.status))) fail('INVALID_STATE', 'This report has already been submitted. Your changes are saved as you make them.');
  const signed = submitSchema.safeParse(input ?? {});
  if (!signed.success) fail('VALIDATION_FAILED', 'Sign the report before you submit it', { issues: [{ field: 'signature', message: 'Draw or type your signature' }] });

  const findings = await repo.listFindings(id);
  const picked = await reportGroupIds(id);
  const problems: { field: string; message: string }[] = [];
  if (!report.audit_date) problems.push({ field: 'audit_date', message: 'Enter the audit date' });
  if (!picked.length && !report.others_selected) problems.push({ field: 'groups', message: 'Tick at least one category on the left to report' });
  if (!findings.length) problems.push({ field: 'findings', message: 'Add at least one finding (or a "No issue" row) before submitting' });
  findings.forEach((finding, index) => {
    if (finding.outcome === 'Violation' && !String(finding.finding ?? '').trim()) {
      problems.push({ field: `finding.${finding.id}`, message: `Finding ${index + 1} has no description` });
    }
  });
  if (problems.length) fail('VALIDATION_FAILED', problems[0].message, { issues: problems });

  const resubmission = report.status === 'Returned';
  await repo.updateReport(id, {
    status: 'Submitted', submitted_at: new Date(), reviewed_at: null, updated_by: actor.user.id,
    signature_kind: signed.data.signature_kind, signature_data: signed.data.signature_data, signed_at: new Date(),
    revision_count: resubmission ? Number(report.revision_count ?? 0) + 1 : Number(report.revision_count ?? 0),
  });
  await repo.insertEvent({ report_id: id, action: 'Submitted', comments: null, actor_id: actor.user.id, actor_name: actor.user.fullName });
  await log(actor, report, 'submitted', `CAPAR ${String(report.report_number)} submitted to the employer`);

  const employerUsers = await query<RowDataPacket>('SELECT DISTINCT user_id FROM employer_users WHERE employer_id = ?', [Number(report.employer_id)]);
  for (const row of employerUsers) {
    await notifyUser({
      userId: Number(row.user_id),
      title: 'A CAPAR report is waiting for your response',
      message: `${String(report.auditor_name)} has submitted ${String(report.title)} (${String(report.report_number)}). Please review the findings and respond.`,
      type: 'action_required', category: 'REPORT', priority: 'high',
      actionUrl: `/employer/capar/${id}`, actionLabel: 'Open the report', entityType: 'capar_report', entityId: id,
      channels: ['in_app', 'email'],
    }).catch(() => undefined);
  }
  return repo.findReport(id);
}

export async function verifyFinding(actor: Actor, reportId: number, findingId: number, input: unknown) {
  assertPermission(actor.user, 'capar.verify');
  const { report, role } = await loadScoped(actor.user, reportId);
  if (role !== 'admin' && role !== 'verifier') fail('FORBIDDEN', 'Only the verifier can mark a finding eligible');
  if (!IN_REVIEW.includes(String(report.status))) fail('INVALID_STATE', 'Findings can only be verified while the report is awaiting review');
  await loadFinding(reportId, findingId);
  const data = verifyFindingSchema.parse(input);
  if (data.verification_status === 'Not Eligible' && !data.verification_remark) {
    fail('VALIDATION_FAILED', 'Say why the finding is not eligible', { issues: [{ field: 'verification_remark', message: 'Give a reason' }] });
  }
  const pending = data.verification_status === 'Pending';
  await repo.updateFinding(findingId, {
    verification_status: data.verification_status,
    verification_remark: data.verification_remark ?? null,
    verified_by: pending ? null : actor.user.id,
    verified_at: pending ? null : new Date(),
  });
  if (report.status === 'Submitted') await repo.updateReport(reportId, { status: 'Under Review' });
  return repo.findFinding(findingId);
}

export async function decide(actor: Actor, id: number, input: unknown) {
  assertPermission(actor.user, 'capar.approve');
  const { report, role } = await loadScoped(actor.user, id);
  if (role !== 'admin' && role !== 'verifier') fail('FORBIDDEN', 'Only the verifier can approve or return a report');
  if (!IN_REVIEW.includes(String(report.status))) fail('INVALID_STATE', 'This report is not awaiting review');
  const data = decisionSchema.parse(input);

  if (data.decision === 'return') {
    if (!data.comments) fail('VALIDATION_FAILED', 'Tell the auditor what to correct', { issues: [{ field: 'comments', message: 'Add your comments' }] });
    await repo.updateReport(id, { status: 'Returned', review_comments: data.comments, reviewed_at: new Date(), updated_by: actor.user.id });
    await repo.insertEvent({ report_id: id, action: 'Returned', comments: data.comments, actor_id: actor.user.id, actor_name: actor.user.fullName });
    await log(actor, report, 'rejected', `CAPAR ${String(report.report_number)} returned to the auditor`);
  } else {
    const findings = await repo.listFindings(id);
    const waiting = findings.filter((finding) => finding.verification_status === 'Pending');
    if (waiting.length) {
      fail('VALIDATION_FAILED', `${waiting.length} finding(s) are still waiting for you to mark them Eligible or Not Eligible`, {
        issues: waiting.map((finding) => ({ field: `finding.${finding.id}`, message: 'Mark this finding Eligible or Not Eligible' })),
      });
    }
    await repo.updateReport(id, { status: 'Approved', approved_at: new Date(), reviewed_at: new Date(), review_comments: data.comments ?? null, updated_by: actor.user.id });
    await repo.insertEvent({ report_id: id, action: 'Approved', comments: data.comments ?? null, actor_id: actor.user.id, actor_name: actor.user.fullName });
    await log(actor, report, 'approved', `CAPAR ${String(report.report_number)} approved`);
  }

  if (report.auditor_user_id) {
    await notifyUser({
      userId: Number(report.auditor_user_id),
      title: data.decision === 'approve' ? 'CAPAR report approved' : 'CAPAR report returned to you',
      message: data.decision === 'approve'
        ? `${String(report.report_number)} was approved.`
        : `${String(report.report_number)} needs changes: ${data.comments}`,
      type: data.decision === 'approve' ? 'success' : 'warning', category: 'REPORT', priority: 'normal',
      actionUrl: `/auditor/capar/${id}`, actionLabel: 'Open report', entityType: 'capar_report', entityId: id, channels: ['in_app'],
    }).catch(() => undefined);
  }
  return repo.findReport(id);
}

export async function reopenReport(actor: Actor, id: number) {
  assertPermission(actor.user, 'capar.update');
  const { report, role } = await loadScoped(actor.user, id);
  if (role !== 'admin') fail('FORBIDDEN', 'Only an administrator can reopen an approved report');
  if (report.status !== 'Approved') fail('INVALID_STATE', 'Only an approved report can be reopened');
  await repo.updateReport(id, { status: 'Returned', approved_at: null, updated_by: actor.user.id });
  await repo.insertEvent({ report_id: id, action: 'Reopened', comments: null, actor_id: actor.user.id, actor_name: actor.user.fullName });
  await log(actor, report, 'updated', `CAPAR ${String(report.report_number)} reopened for correction`);
  return repo.findReport(id);
}

/* ───────────────────────────── categories ───────────────────────────── */

export async function listCategories(user: AuthUser, includeInactive: boolean) {
  assertPermission(user, 'capar_category.read');
  return repo.listCategories(includeInactive && caparRoleOf(user) === 'admin');
}

export async function createCategory(actor: Actor, input: unknown) {
  assertPermission(actor.user, 'capar_category.create');
  const data = categorySchema.parse(input);
  if (await repo.findCategoryByName(data.name)) fail('DUPLICATE', `There is already a category called "${data.name}"`);
  const id = await repo.insertCategory({
    name: data.name, description: data.description ?? null, status: data.status ?? 'active',
    sort_order: data.sort_order ?? (await repo.nextCategoryOrder()), created_by: actor.user.id,
  });
  return repo.findCategory(id);
}

export async function updateCategory(actor: Actor, id: number, input: unknown) {
  assertPermission(actor.user, 'capar_category.update');
  if (!(await repo.findCategory(id))) fail('NOT_FOUND', 'Category not found');
  const data = categoryUpdateSchema.parse(input);
  if (data.name && (await repo.findCategoryByName(data.name, id))) fail('DUPLICATE', `There is already a category called "${data.name}"`);
  await repo.updateCategory(id, data);
  return repo.findCategory(id);
}

/** A category that findings already use is switched off instead of removed, so old reports keep their headings. */
export async function deleteCategory(actor: Actor, id: number) {
  assertPermission(actor.user, 'capar_category.delete');
  if (!(await repo.findCategory(id))) fail('NOT_FOUND', 'Category not found');
  const used = await repo.categoryUsage(id);
  if (used > 0) {
    await repo.updateCategory(id, { status: 'inactive' });
    return { removed: false, deactivated: true, used };
  }
  await repo.softDeleteCategory(id);
  return { removed: true, deactivated: false, used: 0 };
}

/* ───────────────────────────── lookups for the editor ───────────────────────────── */

export async function lookup(user: AuthUser, type: string, params: { q?: string; employerId?: number }) {
  assertPermission(user, 'capar.read');
  const role = caparRoleOf(user);
  if (role === 'employer' || role === 'verifier') fail('FORBIDDEN', 'Not available for your role');
  const q = (params.q ?? '').trim();

  if (type === 'employers') {
    const term = `%${q}%`;
    // An auditor is offered only the companies the administrator has assigned an audit to them for.
    const mine = role === 'auditor';
    const rows = await query<RowDataPacket>(
      `SELECT e.id, e.company_name, e.employer_code, e.city FROM employers e
        WHERE e.deleted_at IS NULL AND e.status = 'active' AND (e.company_name LIKE ? OR e.employer_code LIKE ?)
          ${mine ? "AND EXISTS (SELECT 1 FROM audit_assignments a WHERE a.employer_id = e.id AND a.auditor_id = ? AND a.deleted_at IS NULL AND a.status <> 'Cancelled')" : ''}
        ORDER BY e.company_name LIMIT 50`,
      mine ? [term, term, Number(user.auditorId ?? 0)] : [term, term]
    );
    return rows.map((row) => ({ value: String(row.id), label: String(row.company_name), hint: [row.employer_code, row.city].filter(Boolean).join(' · ') }));
  }
  if (type === 'myaudits') {
    if (role === 'auditor' && !user.auditorId) return [];
    const rows = await repo.lookupMyAudits(role === 'auditor' ? Number(user.auditorId) : null);
    const packs = rows.length
      ? await query<RowDataPacket>(`SELECT DISTINCT employer_id FROM evidence_submissions WHERE employer_id IN (${[...new Set(rows.map((row) => Number(row.employer_id)))].map(() => '?').join(',')})`, [...new Set(rows.map((row) => Number(row.employer_id)))])
      : [];
    const packed = new Set(packs.map((pack) => Number(pack.employer_id)));
    return rows.map((row) => ({
      value: String(row.id),
      label: `${row.company_name}${row.unit_name ? ` - ${row.unit_name}` : ''}`,
      hint: `${row.assignment_number} · ${row.audit_title}`,
      employerId: Number(row.employer_id),
      company: String(row.company_name),
      unit: row.unit_name ? String(row.unit_name) : null,
      auditDate: row.start_date ? String(row.start_date).slice(0, 10) : null,
      verifierId: row.verifier_id ? Number(row.verifier_id) : null,
      verifier: row.verifier_name ? String(row.verifier_name) : null,
      status: String(row.status),
      packSubmitted: packed.has(Number(row.employer_id)),
    }));
  }
  if (type === 'units' && params.employerId) {
    const rows = await query<RowDataPacket>('SELECT id, unit_name, location FROM company_units WHERE employer_id = ? AND deleted_at IS NULL ORDER BY unit_name', [params.employerId]);
    return rows.map((row) => ({ value: String(row.id), label: String(row.unit_name), hint: row.location ? String(row.location) : undefined }));
  }
  if (type === 'assignments' && params.employerId) {
    if (role === 'auditor' && !user.auditorId) return [];
    const rows = await repo.lookupAssignments(params.employerId, role === 'auditor' ? Number(user.auditorId) : null);
    return rows.map((row) => ({ value: String(row.id), label: `${row.assignment_number} - ${row.audit_title}`, hint: String(row.status) }));
  }
  if (type === 'verifiers') {
    const rows = await repo.lookupVerifiers();
    return rows.map((row) => ({ value: String(row.id), label: String(row.name), hint: String(row.email) }));
  }
  if (type === 'acts') {
    const rows = await repo.lookupActs(q);
    return rows.map((row) => ({
      value: String(row.id),
      label: [row.short_name || row.act_name, row.act_year].filter(Boolean).join(' '),
      hint: String(row.act_name),
    }));
  }
  if (type === 'provisions') {
    const rows = await searchProvisions(q);
    return rows.map((row) => ({ value: String(row.id), label: row.label, hint: row.title, text: row.explanation, amendments: row.amendments, actId: row.act_id }));
  }
  if (type === 'resources') {
    const rows = await repo.lookupResources(q);
    return rows.map((row) => ({ value: String(row.id), label: String(row.title), hint: String(row.resource_type) }));
  }
  return fail('VALIDATION_FAILED', 'Unknown lookup');
}
