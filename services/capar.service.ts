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
import { assertPackDownloaded } from '@/services/evidence.service';
import { localToday } from '@/lib/utils/dates';
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { notifyUser } from '@/lib/notifications/notification-service';
import { assertPermission } from '@/lib/auth/permission-check';
import { saveUploads, archiveFile, type UploadInput } from '@/lib/files/file-service';
import { nextDocumentNumber } from '@/lib/utils/report-number';
import { buildPagination, parsePagination } from '@/lib/utils/pagination';
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
  if (role === 'employer' && (Number(report.employer_id) !== Number(user.employerId) || report.status !== 'Approved')) {
    return fail('NOT_FOUND', 'CAPAR report not found');
  }
  return { report, role };
}

const EDITABLE = ['Draft', 'Returned'];
const IN_REVIEW = ['Submitted', 'Under Review'];

function isOwner(user: AuthUser, report: Report) {
  return Number(report.auditor_id) === Number(user.auditorId);
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
  if (role === 'employer') { scope.employerId = Number(user.employerId ?? 0) || -1; scope.statuses = ['Approved']; }

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
  const withFiles = findings.map((finding) => ({
    ...finding,
    files: files
      .filter((file) => Number(file.finding_id) === Number(finding.id))
      .map((file) => ({ ...file, storage_path: undefined, url: `/api/files/${file.file_id}/download` })),
  }));

  const editable = canEdit(user, role, report);
  const inReview = IN_REVIEW.includes(String(report.status));
  const reviewer = (role === 'admin' || role === 'verifier') && inReview;
  const can = {
    edit: editable,
    submit: editable && user.permissions.includes('*') || (editable && user.permissions.includes('capar.update')),
    delete: editable && report.status === 'Draft' && (user.permissions.includes('*') || user.permissions.includes('capar.delete')),
    verify: reviewer && (user.permissions.includes('*') || user.permissions.includes('capar.verify')),
    decide: reviewer && (user.permissions.includes('*') || user.permissions.includes('capar.approve')),
    reopen: role === 'admin' && report.status === 'Approved',
    download: user.permissions.includes('*') || user.permissions.includes('capar.download'),
  };

  const [categories, events] = await Promise.all([
    repo.listCategories(false),
    role === 'employer' ? Promise.resolve([]) : repo.listEvents(id),
  ]);

  return {
    report: { ...report, auditor_signature_path: undefined, review_comments: role === 'employer' ? null : report.review_comments },
    findings: withFiles,
    categories,
    events,
    role,
    can,
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
  const assignment = data.assignment_id ? await repo.assignmentForHeader(data.assignment_id) : null;
  if (data.assignment_id) {
    if (!assignment) fail('INVALID_REFERENCE', 'That audit assignment does not exist');
    if (Number(assignment!.employer_id) !== data.employer_id) fail('VALIDATION_FAILED', 'That audit assignment belongs to a different employer');
    if (role === 'auditor' && Number(assignment!.auditor_id) !== auditorId) fail('FORBIDDEN', 'That audit is assigned to another auditor');
    if (!auditorId) auditorId = Number(assignment!.auditor_id);
  }
  if (!auditorId) fail('VALIDATION_FAILED', 'Choose the auditor who is writing this report');
  const auditor = await repo.auditorById(auditorId!);
  if (!auditor) fail('INVALID_REFERENCE', 'That auditor does not exist');

  const employer = await repo.employerForHeader(data.employer_id);
  if (!employer) fail('INVALID_REFERENCE', 'That employer does not exist');
  // Before the audit starts the auditor must have read the pack the employer submitted (when the administrator gave this auditor any sections).
  if (role === 'auditor') await assertPackDownloaded(actor.user, data.employer_id);
  const unitId = data.unit_id ?? (assignment?.unit_id ? Number(assignment.unit_id) : null);
  const unit = unitId ? await repo.unitForHeader(unitId, data.employer_id) : null;
  if (unitId && !unit) fail('INVALID_REFERENCE', 'That unit does not belong to this employer');

  const facilityName = data.facility_name ?? (unit ? `${employer!.company_name} - ${unit.unit_name}` : String(employer!.company_name));
  const employerAddress = [employer!.address_line_1, employer!.address_line_2, employer!.city, employer!.state, employer!.pincode]
    .filter(Boolean).join(', ');
  const today = localToday();
  const auditDate = data.audit_date ?? (assignment?.start_date ? String(assignment.start_date) : today);
  const firm = data.audit_firm ?? (await companyName()) ?? null;

  const reportNumber = await nextDocumentNumber('capar');
  const id = await repo.insertReport({
    uuid: crypto.randomUUID(),
    report_number: reportNumber,
    title: data.title ?? `CAPAR - ${facilityName} - ${auditDate}`,
    employer_id: data.employer_id,
    unit_id: unitId,
    assignment_id: data.assignment_id ?? null,
    auditor_id: auditorId,
    verifier_id: data.verifier_id ?? (assignment?.verifier_id ? Number(assignment.verifier_id) : null),
    facility_name: facilityName,
    facility_address: data.facility_address ?? (unit?.address ? String(unit.address) : employerAddress) ?? null,
    representative_name: data.representative_name ?? (employer!.contact_person_name ? String(employer!.contact_person_name) : null),
    representative_title: data.representative_title ?? (employer!.contact_person_designation ? String(employer!.contact_person_designation) : null),
    audit_date: auditDate,
    audit_firm: firm || null,
    auditor_print_name: data.auditor_print_name ?? String(auditor!.name),
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
  const data = caparUpdateSchema.parse(input);
  if (data.verifier_id) {
    const verifiers = await repo.lookupVerifiers();
    if (!verifiers.some((verifier) => Number(verifier.id) === data.verifier_id)) fail('VALIDATION_FAILED', 'Choose a verifier from the list');
  }
  await repo.updateReport(id, { ...data, updated_by: actor.user.id });
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

async function checkFindingRefs(data: { category_id?: number | null; act_id?: number | null; provision_id?: number | null; resource_id?: number | null }) {
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
  await checkFindingRefs(data);
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
  await checkFindingRefs(data);

  const patch: Record<string, unknown> = { ...data, ...itemStatusRules(actor.user, finding, data) };
  // Closing an action stamps the date; reopening it clears it.
  if (data.action_status === 'Closed' && finding.action_status !== 'Closed' && data.closed_on === undefined) {
    patch.closed_on = localToday();
  }
  if (data.action_status && data.action_status !== 'Closed' && data.closed_on === undefined) patch.closed_on = null;
  // A change after the verifier returned the report has to be looked at again.
  if (report.status === 'Returned' && finding.verification_status !== 'Pending') {
    patch.verification_status = 'Pending';
    patch.verified_by = null;
    patch.verified_at = null;
  }
  await repo.updateFinding(findingId, patch);
  await repo.updateReport(reportId, { updated_by: actor.user.id });
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
}

/* ───────────────────────────── finding files (photos / evidence) ───────────────────────────── */

export async function attachFiles(actor: Actor, reportId: number, findingId: number, files: UploadInput[], kindInput: string, caption: string | null) {
  assertPermission(actor.user, 'capar.upload');
  const { report, role } = await loadScoped(actor.user, reportId);
  mustEdit(actor.user, role, report);
  await loadFinding(reportId, findingId);
  const kind = (CAPAR_FILE_KINDS as readonly string[]).includes(kindInput) ? kindInput : 'Photo';
  if (kind === 'Photo' && files.some((file) => !/^image\//i.test(file.mimeType))) {
    fail('VALIDATION_FAILED', 'A non-compliance photo must be an image (JPG or PNG)');
  }
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

export async function submitReport(actor: Actor, id: number) {
  assertPermission(actor.user, 'capar.update');
  const { report, role } = await loadScoped(actor.user, id);
  mustEdit(actor.user, role, report);

  const findings = await repo.listFindings(id);
  const problems: { field: string; message: string }[] = [];
  if (!report.audit_date) problems.push({ field: 'audit_date', message: 'Enter the audit date' });
  if (!report.verifier_id) problems.push({ field: 'verifier_id', message: 'Choose the verifier who will review this report' });
  if (!findings.length) problems.push({ field: 'findings', message: 'Add at least one finding (or a "No Violation" row) before submitting' });
  findings.forEach((finding, index) => {
    if (finding.outcome === 'Violation' && !String(finding.finding ?? '').trim()) {
      problems.push({ field: `finding.${finding.id}`, message: `Finding ${index + 1} has no description` });
    }
  });
  if (problems.length) fail('VALIDATION_FAILED', problems[0].message, { issues: problems });

  const resubmission = report.status === 'Returned';
  await repo.updateReport(id, {
    status: 'Submitted', submitted_at: new Date(), reviewed_at: null, updated_by: actor.user.id,
    revision_count: resubmission ? Number(report.revision_count ?? 0) + 1 : Number(report.revision_count ?? 0),
  });
  await repo.insertEvent({ report_id: id, action: 'Submitted', comments: null, actor_id: actor.user.id, actor_name: actor.user.fullName });
  await log(actor, report, 'submitted', `CAPAR ${String(report.report_number)} submitted for verification`);

  await notifyUser({
    userId: Number(report.verifier_id),
    title: 'CAPAR report awaiting your review',
    message: `${String(report.title)} (${String(report.report_number)}) was submitted by ${String(report.auditor_name)}.`,
    type: 'action_required', category: 'REPORT', priority: 'high',
    actionUrl: `/verifier/capar/${id}`, actionLabel: 'Review report', entityType: 'capar_report', entityId: id,
    channels: ['in_app'],
  }).catch(() => undefined);
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
    const rows = await query<RowDataPacket>(
      `SELECT id, company_name, employer_code, city FROM employers
        WHERE deleted_at IS NULL AND status = 'active' AND (company_name LIKE ? OR employer_code LIKE ?)
        ORDER BY company_name LIMIT 50`,
      [term, term]
    );
    return rows.map((row) => ({ value: String(row.id), label: String(row.company_name), hint: [row.employer_code, row.city].filter(Boolean).join(' · ') }));
  }
  if (type === 'units' && params.employerId) {
    const rows = await query<RowDataPacket>('SELECT id, unit_name, location FROM company_units WHERE employer_id = ? AND deleted_at IS NULL ORDER BY unit_name', [params.employerId]);
    return rows.map((row) => ({ value: String(row.id), label: String(row.unit_name), hint: row.location ? String(row.location) : undefined }));
  }
  if (type === 'assignments' && params.employerId) {
    const rows = await repo.lookupAssignments(params.employerId, role === 'auditor' ? Number(user.auditorId ?? 0) : null);
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
