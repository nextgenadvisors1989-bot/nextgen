/**
 * Audit report lifecycle.
 *
 * The report is versioned, not overwritten. Every meaningful step writes a new
 * `audit_report_versions` row whose `snapshot_json` is the full document body at
 * that moment, so an approved report can always be reproduced exactly as it was
 * signed off — including the scorecard and the finding list.
 *
 *   draft  ──submit──▶ Submitted ──start review──▶ Under Review
 *                                     │
 *                        approve ◀────┼────▶ reject (terminal)
 *                                     └────▶ return → Changes Requested ──resubmit──▶ Submitted
 *
 * Each transition keeps four things in step with the report row:
 *   • the parent assignment's status and progress,
 *   • the verifier queue (`verifier_assignments`) and its audit trail
 *     (`verifier_comments`),
 *   • the notifications — auditor, verifier, administrators and (where the
 *     template allows) the employer,
 *   • the activity log and the field-level audit trail.
 */
import { randomUUID } from 'node:crypto';
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { withTransaction } from '@/lib/db/transactions';
import { applyColumnDefaults } from '@/lib/db/column-defaults';
import * as repo from '@/repositories/audit-report.repository';
import {
  reportBodySchema, reportCreateSchema, reportDraftSchema, reportUpdateSchema, reportSubmitSchema,
  reportReviewSchema, reportCommentSchema, reportResolveSchema, reportVerifierAssignSchema,
  SEVERITY_COUNT_FIELD, type ReportBody,
} from '@/lib/validations/audit-report.validation';
import { writeActivityLog, writeAuditTrail } from '@/lib/logger/activity-log';
import { sendTemplateEmail } from '@/lib/notifications/email-service';
import { notifyMany, notifyUser, usersWithRole } from '@/lib/notifications/notification-service';
import { generateAuditReportPdf } from '@/lib/pdf/audit-report-pdf';
import { attachGeneratedFile, findFile, readFileBytes } from '@/lib/files/file-service';
import { nextDocumentNumber } from '@/lib/utils/report-number';
import { APP_URL } from '@/lib/utils/constants';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import type { AuthUser } from '@/types/user';

export interface ActorContext {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreateReportResult {
  reportId: number;
  reportNumber: string;
  version: number;
  pdfFileId: number | null;
  warnings: string[];
  submitted: boolean;
}

/* ------------------------------------------------------------------ reads */

export function listReports(filters: repo.ReportListFilters & { scoreBand?: string }) {
  const { scoreBand, ...rest } = filters;
  const bounds = bandToRange(scoreBand);
  return repo.findReports({ ...rest, ...bounds });
}

/** Score band → inclusive percentage window (only set when the band is chosen). */
function bandToRange(band?: string): { minScore?: number; maxScore?: number } {
  switch (band) {
    case '90': return { minScore: 90, maxScore: 100 };
    case '75': return { minScore: 75, maxScore: 89.999 };
    case '60': return { minScore: 60, maxScore: 74.999 };
    case '0': return { minScore: 0, maxScore: 59.999 };
    default: return {};
  }
}

export function reportStats(employerId?: number, verifierId?: number) {
  return repo.getReportStats(employerId, verifierId);
}

export function reportCharts(employerId?: number) {
  return Promise.all([repo.scoreTrend(6, employerId), repo.findingsBreakdown(employerId)]);
}

/** Everything the detail page needs in one pass. */
export async function getReportDetail(reportId: number) {
  const report = await repo.findReportById(reportId);
  if (!report) return null;

  const [versions, comments, verification, decisions, counts] = await Promise.all([
    repo.listVersions(reportId),
    repo.listComments(reportId),
    repo.listVerifierAssignments(reportId),
    repo.verifierDecisions(reportId),
    repo.commentCounts(reportId),
  ]);

  const currentVersion = versions.find((version) => Number(version.version) === Number(report.current_version))
    ?? (await repo.latestVersion(reportId));

  return {
    report,
    // The working copy wins: it is what the auditor is looking at right now.
    body: workingBody(report, currentVersion?.snapshot_json),
    draftSavedAt: report.draft_saved_at ?? null,
    versions,
    currentVersion: currentVersion ?? null,
    comments,
    verification,
    decisions,
    commentCounts: {
      total: Number(counts?.total ?? 0),
      corrections: Number(counts?.corrections ?? 0),
      openCorrections: Number(counts?.open_corrections ?? 0),
    },
  };
}

/** Parses a stored snapshot defensively — old rows must never break a page. */
export function parseSnapshot(snapshotJson: unknown): ReportBody {
  const empty: ReportBody = {
    executive_summary: null, methodology: null, findings: [],
    scorecard: [], observations: [], regulatory_references: [], recommendations: [],
  };
  if (!snapshotJson) return empty;
  try {
    const parsed = typeof snapshotJson === 'string' ? JSON.parse(snapshotJson) : snapshotJson;
    return {
      ...empty,
      ...parsed,
      findings: Array.isArray(parsed?.findings) ? parsed.findings : [],
      scorecard: Array.isArray(parsed?.scorecard) ? parsed.scorecard : [],
      observations: Array.isArray(parsed?.observations) ? parsed.observations : [],
      regulatory_references: Array.isArray(parsed?.regulatory_references) ? parsed.regulatory_references : [],
      recommendations: Array.isArray(parsed?.recommendations) ? parsed.recommendations : [],
    };
  } catch {
    return empty;
  }
}

/**
 * The document the platform is currently working with.
 *
 * `draft_body_json` is the auditor's saved working copy; when it is empty the
 * latest frozen revision is the truth. Everything that reads or freezes the body
 * goes through here so the form, the preview, the PDF and the submit path can
 * never disagree about what the report says.
 */
export function workingBody(
  report: Record<string, unknown> | null | undefined,
  fallbackSnapshot?: unknown
): ReportBody {
  return report?.draft_body_json
    ? parseSnapshot(report.draft_body_json)
    : parseSnapshot(fallbackSnapshot);
}

/** Lookups for the create/edit form and the register filters. */
export async function reportLookups() {
  const [employers, units, auditors, verifiers, assignments, modules] = await Promise.all([
    query<RowDataPacket>(
      "SELECT id, company_name, employer_code, city FROM employers WHERE deleted_at IS NULL AND status = 'active' ORDER BY company_name"
    ),
    query<RowDataPacket>('SELECT id, employer_id, unit_name FROM company_units WHERE deleted_at IS NULL ORDER BY unit_name'),
    query<RowDataPacket>(
      "SELECT id, name, auditor_code, email, max_concurrent_audits FROM auditors WHERE deleted_at IS NULL AND status = 'active' ORDER BY name"
    ),
    query<RowDataPacket>(
      `SELECT DISTINCT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name, u.email,
              (SELECT COUNT(*) FROM verifier_assignments va WHERE va.verifier_id = u.id AND va.status IN ('pending','in_review')) AS pending_reviews
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE r.slug = 'verifier' AND u.status = 'active' AND u.deleted_at IS NULL
        ORDER BY name`
    ),
    query<RowDataPacket>(
      `SELECT aa.id, aa.assignment_number, aa.audit_title, aa.employer_id, aa.unit_id, aa.auditor_id,
              aa.status, aa.assignment_type,
              (SELECT ar.id FROM audit_reports ar WHERE ar.assignment_id = aa.id AND ar.deleted_at IS NULL LIMIT 1) AS report_id
         FROM audit_assignments aa
        WHERE aa.deleted_at IS NULL AND aa.status <> 'Cancelled'
        ORDER BY aa.created_at DESC LIMIT 200`
    ),
    query<RowDataPacket>(
      "SELECT id, name, code FROM dynamic_modules WHERE deleted_at IS NULL AND status = 'active' ORDER BY sort_order, name"
    ).catch(() => [] as RowDataPacket[]),
  ]);

  return {
    employers: employers.map((row) => ({
      id: Number(row.id), company_name: String(row.company_name),
      employer_code: String(row.employer_code), city: row.city ?? null,
    })),
    units: units.map((row) => ({ id: Number(row.id), employer_id: Number(row.employer_id), unit_name: String(row.unit_name) })),
    auditors: auditors.map((row) => ({
      id: Number(row.id), name: String(row.name), auditor_code: String(row.auditor_code), email: String(row.email),
    })),
    verifiers: verifiers.map((row) => ({
      id: Number(row.id), name: String(row.name), email: String(row.email), pending_reviews: Number(row.pending_reviews ?? 0),
    })),
    assignments: assignments.map((row) => ({
      id: Number(row.id), assignment_number: String(row.assignment_number), audit_title: String(row.audit_title),
      employer_id: Number(row.employer_id),
      unit_id: row.unit_id === null ? null : Number(row.unit_id),
      auditor_id: row.auditor_id === null ? null : Number(row.auditor_id),
      status: String(row.status), assignment_type: String(row.assignment_type),
      has_report: Boolean(row.report_id),
    })),
    modules: modules.map((row) => ({ id: Number(row.id), name: String(row.name), code: String(row.code) })),
  };
}

/* ----------------------------------------------------------------- writes */

/**
 * Creates a report, always writing version 1. When `submit` is set it goes
 * straight to the verifier with the PDF attached — the path the auditor
 * workspace uses at the end of an audit.
 */
export async function createReport(input: unknown, actor: ActorContext): Promise<CreateReportResult> {
  const parsed = reportCreateSchema.parse(input);
  const warnings: string[] = [];

  const employer = await queryOne<RowDataPacket>(
    'SELECT id, company_name, contact_person_name FROM employers WHERE id = ? AND deleted_at IS NULL',
    [parsed.employer_id]
  );
  if (!employer) {
    throw Object.assign(new Error('The selected employer does not exist or was archived'), { code: 'INVALID_REFERENCE' });
  }

  // One live report per assignment: a resubmission becomes version N+1.
  if (parsed.assignment_id) {
    const existing = await repo.findReportByAssignment(parsed.assignment_id);
    if (existing) {
      throw Object.assign(
        new Error(`Assignment already has report ${existing.report_number} — open it and create a new version instead`),
        { code: 'ER_DUP_ENTRY' }
      );
    }
  }

  const body: ReportBody = parsed.body ?? ({
    executive_summary: null, methodology: null, findings: [],
    scorecard: [], observations: [], regulatory_references: [], recommendations: [],
  } as ReportBody);
  const totals = deriveScore(body, parsed.score_obtained ?? null, parsed.score_max ?? null, parsed.score_percentage ?? null);
  const counts = countFindings(body);

  const reportNumber = await nextDocumentNumber('report');
  const data: Record<string, unknown> = {
    uuid: randomUUID(),
    report_number: reportNumber,
    assignment_id: parsed.assignment_id ?? null,
    submission_id: parsed.submission_id ?? null,
    module_id: parsed.module_id ?? null,
    form_id: parsed.form_id ?? null,
    employer_id: parsed.employer_id,
    unit_id: parsed.unit_id ?? null,
    auditor_id: parsed.auditor_id ?? null,
    audit_title: parsed.audit_title,
    report_type: parsed.report_type ?? 'AUDIT',
    audit_period_from: parsed.audit_period_from ?? null,
    audit_period_to: parsed.audit_period_to ?? null,
    audit_date: parsed.audit_date ?? null,
    next_audit_due: parsed.next_audit_due ?? null,
    status: 'Draft',
    current_version: 1,
    score_obtained: totals.obtained,
    score_max: totals.max,
    score_percentage: totals.percentage,
    ...counts,
  };

  const assignmentSnapshot = parsed.assignment_id ? await loadAssignment(parsed.assignment_id) : null;
  if (assignmentSnapshot) {
    // An audit report inherits the audit's bookends so the register reads sensibly.
    data.audit_period_from = data.audit_period_from ?? assignmentSnapshot.start_date;
    data.audit_period_to = data.audit_period_to ?? assignmentSnapshot.end_date;
    data.audit_date = data.audit_date ?? assignmentSnapshot.end_date ?? assignmentSnapshot.start_date;
    data.auditor_id = data.auditor_id ?? assignmentSnapshot.auditor_id;
    data.unit_id = data.unit_id ?? assignmentSnapshot.unit_id;
    data.module_id = data.module_id ?? assignmentSnapshot.module_id;
  }

  const reportId = await repo.createReport(await applyColumnDefaults('audit_reports', data), actor.user.id);
  await repo.insertVersion({
    reportId, version: 1, snapshot: body as Record<string, unknown>,
    changeSummary: 'Initial report created', createdBy: actor.user.id,
  });

  await writeAuditTrail({
    tableName: 'audit_reports', recordId: reportId, operation: 'INSERT',
    changes: Object.fromEntries(Object.entries(data).map(([field, value]) => [field, { from: null, to: value ?? null }])),
    changedBy: actor.user.id, changedByName: actor.user.fullName, ipAddress: actor.ip ?? null,
  });

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: parsed.employer_id, action: 'created', module: 'audit_report',
    entityType: 'audit_report', entityId: reportId,
    entityLabel: `${reportNumber} — ${parsed.audit_title}`,
    description: `Report ${reportNumber} created for ${employer.company_name}`,
    newValues: data, ipAddress: actor.ip ?? null, userAgent: actor.userAgent ?? null,
  });

  let pdfFileId: number | null = null;
  if (parsed.submit) {
    const submitted = await submitReport(
      reportId,
      { verifier_id: parsed.verifier_id ?? null, send_to_verifier: true, change_summary: 'Initial submission' },
      actor
    );
    if (submitted) {
      pdfFileId = submitted.pdfFileId;
      warnings.push(...submitted.warnings);
    }
  }

  return {
    reportId, reportNumber, version: 1, pdfFileId, warnings, submitted: Boolean(parsed.submit),
  };
}

/** Partial update. `create_version` snapshots the change; otherwise it is edited in place. */
export async function updateReport(reportId: number, input: unknown, actor: ActorContext) {
  const existing = await repo.findReportById(reportId);
  if (!existing) return null;

  const parsed = reportUpdateSchema.parse(input);
  const { body, create_version, regenerate_pdf, change_summary, ...scalarInput } = parsed;
  const warnings: string[] = [];

  // Editing an approved report is allowed but always lands as a new revision
  // (handled below), so the signed-off snapshot is preserved verbatim.

  const current = await repo.latestVersion(reportId);
  const currentBody = parseSnapshot(current?.snapshot_json);
  const mergedBody: ReportBody = body ? { ...currentBody, ...body } : currentBody;

  const totals = body
    ? deriveScore(mergedBody, (scalarInput.score_obtained ?? existing.score_obtained) as number | null,
        (scalarInput.score_max ?? existing.score_max) as number | null,
        (scalarInput.score_percentage ?? existing.score_percentage) as number | null)
    : null;
  const counts = body ? countFindings(mergedBody) : null;

  const data: Record<string, unknown> = Object.fromEntries(
    Object.entries(scalarInput).filter(([, value]) => value !== undefined)
  );
  if (totals) {
    data.score_obtained = totals.obtained;
    data.score_max = totals.max;
    data.score_percentage = totals.percentage;
  }
  if (counts) Object.assign(data, counts);

  if (!Object.keys(data).length && !body) return { updated: 0, report: existing, version: null };

  const record = await applyColumnDefaults('audit_reports', data);
  const updated = await repo.updateReport(reportId, record, actor.user.id);

  let versionRow: { version: number; pdfFileId: number | null } | null = null;

  if (body || create_version) {
    // Any edit that touches the document body lands as a new revision, so the
    // approval history never loses what was previously signed off.
    const shouldVersion = Boolean(body) || create_version;
    if (shouldVersion) {
      versionRow = await snapshotVersion(reportId, mergedBody, actor, change_summary ?? 'Report updated');
    }
  }

  if (updated) {
    await writeAuditTrail({
      tableName: 'audit_reports', recordId: reportId, operation: 'UPDATE',
      changes: Object.fromEntries(Object.keys(record).map((field) => [
        field,
        { from: (existing as unknown as Record<string, unknown>)[field] ?? null, to: record[field] ?? null },
      ])),
      changedBy: actor.user.id, changedByName: actor.user.fullName, ipAddress: actor.ip ?? null,
    });

    await writeActivityLog({
      userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
      employerId: Number(existing.employer_id), action: 'updated', module: 'audit_report',
      entityType: 'audit_report', entityId: reportId,
      entityLabel: `${existing.report_number} — ${existing.audit_title}`,
      description: `Report ${existing.report_number} updated (${Object.keys(record).join(', ')})`,
      newValues: record, ipAddress: actor.ip ?? null, userAgent: actor.userAgent ?? null,
    });
  }

  if (regenerate_pdf) {
    const regenerated = await generateAndStorePdf(reportId, actor);
    if (regenerated.fileId) versionRow = { version: regenerated.version, pdfFileId: regenerated.fileId };
    warnings.push(...regenerated.warnings);
  }

  return { updated, report: await repo.findReportById(reportId), version: versionRow, warnings };
}

/** Writes a snapshot row for the current body and returns the new version. */
async function snapshotVersion(reportId: number, body: ReportBody, actor: ActorContext, changeSummary: string) {
  const next = await repo.nextVersionNumber(reportId);
  const version = Number(next?.next ?? 1);
  await repo.insertVersion({ reportId, version, snapshot: body as Record<string, unknown>, changeSummary, createdBy: actor.user.id });
  await repo.updateReport(reportId, { current_version: version }, actor.user.id);
  return { version, pdfFileId: null as number | null };
}

/**
 * Saves the auditor's working copy.
 *
 * No revision is written and no PDF is generated — a draft is a draft. The
 * headline score and finding counts on `audit_reports` are refreshed so the
 * register, the dashboard and the assignment list show live progress, and the
 * activity log keeps a record without flooding the audit trail.
 */
export async function saveDraft(reportId: number, input: unknown, actor: ActorContext) {
  const report = await repo.findReportById(reportId);
  if (!report) return null;

  if (report.status === 'Approved') {
    throw Object.assign(new Error('This report is approved — reopen it before editing'), { code: 'INVALID_STATE' });
  }

  const parsed = reportDraftSchema.parse(input);
  const latest = await repo.latestVersion(reportId);
  const previous = workingBody(report, latest?.snapshot_json);

  // A save sends the whole document, but merge defensively so a partial payload
  // (an autosave that only touches one section) never wipes the rest.
  const merged: ReportBody = {
    ...previous,
    ...Object.fromEntries(Object.entries(parsed.body).filter(([, value]) => value !== undefined)),
  };

  const totals = deriveScore(merged, null, null, null);
  const counts = countFindings(merged);
  const savedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await repo.saveDraftBody(reportId, JSON.stringify(merged), savedAt, actor.user.id);

  const headline: Record<string, unknown> = { ...counts };
  if (totals.max) {
    headline.score_obtained = totals.obtained;
    headline.score_max = totals.max;
    headline.score_percentage = totals.percentage;
  }
  for (const field of ['audit_period_from', 'audit_period_to', 'audit_date'] as const) {
    if (parsed[field] !== undefined && parsed[field] !== null) headline[field] = parsed[field];
  }
  await repo.updateReport(reportId, await applyColumnDefaults('audit_reports', headline), actor.user.id);

  // Progress follows how much of the document is actually written.
  if (report.assignment_id) {
    await syncAssignment(Number(report.assignment_id), {
      status: 'In Progress',
      progress_percent: Math.min(85, 10 + 15 * [merged.executive_summary, merged.methodology].filter(Boolean).length
        + (merged.scorecard.length ? 20 : 0) + (merged.findings.length ? 30 : 0)),
      reportId,
      actorId: actor.user.id,
    });
  }

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(report.employer_id), action: 'draft_saved', module: 'audit_report',
    entityType: 'audit_report', entityId: reportId,
    entityLabel: `${report.report_number} — ${report.audit_title}`,
    description: `Draft of ${report.report_number} saved (${merged.findings.length} finding(s), ${merged.scorecard.length} scorecard row(s))`,
    newValues: { findings: merged.findings.length, scorecard: merged.scorecard.length, score_percentage: totals.percentage },
    severity: 'low',
    ipAddress: actor.ip ?? null, userAgent: actor.userAgent ?? null,
  });

  return {
    reportId,
    savedAt,
    body: merged,
    score: totals,
    findings: counts,
    report: await repo.findReportById(reportId),
  };
}

/* --------------------------------------------------------------- workflow */

/**
 * Auditor submits. Generates version-with-PDF, pushes the assignment forward,
 * queues the verifier and notifies everyone who needs to know.
 */
export async function submitReport(reportId: number, input: unknown, actor: ActorContext) {
  const report = await repo.findReportById(reportId);
  if (!report) return null;

  const parsed = reportSubmitSchema.parse(input ?? {});
  const warnings: string[] = [];

  if (report.status === 'Approved') {
    throw Object.assign(new Error('This report is already approved — reopen it before resubmitting'), { code: 'INVALID_STATE' });
  }

  const now = new Date();
  const nowSql = now.toISOString().slice(0, 19).replace('T', ' ');

  // Freeze the submitted body as its own revision, then generate the PDF that
  // belongs to it: every submission therefore advances both the revision and
  // the signed document, and the verifier reviews the pair together.
  // The auditor's saved working copy is what gets frozen and rendered. It is
  // validated against the submission schema first, so an unfinished finding can
  // be saved as a draft but never submitted.
  const currentVersion = await repo.latestVersion(reportId);
  const body = reportBodySchema.parse(workingBody(report, currentVersion?.snapshot_json)) as ReportBody;
  const revision = await snapshotVersion(reportId, body, actor, parsed.change_summary);
  const pdf = await generateAndStorePdf(reportId, actor, { body, submitted: true });
  warnings.push(...pdf.warnings);

  const versionNumber = pdf.version || revision.version;

  await repo.updateReport(
    reportId,
    await applyColumnDefaults('audit_reports', {
      status: 'Submitted',
      submitted_at: nowSql,
      current_version: versionNumber,
      pdf_file_id: pdf.fileId ?? report.pdf_file_id ?? null,
      pdf_generated_at: pdf.fileId ? nowSql : report.pdf_generated_at ?? null,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
    }),
    actor.user.id
  );

  if (report.assignment_id) {
    await syncAssignment(Number(report.assignment_id), {
      status: 'Submitted',
      progress_percent: 90,
      reportId,
      actorId: actor.user.id,
    });
  }

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(report.employer_id), action: 'submitted', module: 'audit_report',
    entityType: 'audit_report', entityId: reportId,
    entityLabel: `${report.report_number} — ${report.audit_title}`,
    description: `Report ${report.report_number} submitted (version ${versionNumber}) for ${report.employer_name}`,
    newValues: { status: 'Submitted', version: versionNumber, score_percentage: report.score_percentage },
    ipAddress: actor.ip ?? null, userAgent: actor.userAgent ?? null,
  });

  // ------------------------------------------------------------ verifier
  const verifierId = parsed.verifier_id ?? (await repo.findActiveVerifierAssignment(reportId))?.verifier_id
    ?? (report.assignment_id ? (await loadAssignment(Number(report.assignment_id)))?.verifier_id : null);

  if (parsed.send_to_verifier && verifierId) {
    const assignment = await repo.findActiveVerifierAssignment(reportId);
    if (assignment && Number(assignment.verifier_id) === Number(verifierId)) {
      await repo.updateVerifierAssignment(Number(assignment.id), { status: 'in_review' });
    } else {
      await repo.reassignVerifierAssignments(reportId, Number(verifierId), actor.user.id);
    }

    const verifier = await queryOne<{ id: number; first_name: string; last_name: string; email: string } & RowDataPacket>(
      'SELECT id, first_name, last_name, email FROM users WHERE id = ? LIMIT 1',
      [Number(verifierId)]
    );

    if (verifier) {
      await notifyUser({
        userId: Number(verifier.id),
        title: 'Audit report awaiting your review',
        message: `${report.audit_title} (${report.report_number}) was submitted by ${report.auditor_name ?? 'the auditor'} — score ${formatScore(report.score_percentage)}.`,
        type: 'action_required',
        priority: Number(report.critical_findings ?? 0) > 0 ? 'urgent' : 'high',
        category: 'REPORT',
        actionUrl: `/verifier/reports/${reportId}`,
        actionLabel: 'Review Report',
        entityType: 'audit_report',
        entityId: reportId,
        channels: ['in_app', 'email', 'sms', 'whatsapp'],
        templateCode: 'report.submitted',
        templateData: await buildTemplateData(report, {
          recipient_name: `${verifier.first_name} ${verifier.last_name}`,
          submitted_date: formatDateTime(nowSql),
        }),
        attachments: await loadAttachment(pdf.fileId),
      });
    }
  } else if (parsed.send_to_verifier) {
    warnings.push('No verifier is assigned — the report is submitted but nobody has been asked to review it yet.');
  }

  // --------------------------------------------------------- auditor echo
  const auditorUserEmail = report.auditor_email ? String(report.auditor_email) : null;
  if (auditorUserEmail && parsed.send_to_verifier) {
    const auditorUser = await queryOne<{ id: number } & RowDataPacket>(
      'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
      [auditorUserEmail]
    );
    if (auditorUser) {
      await notifyUser({
        userId: Number(auditorUser.id),
        title: 'Report submitted successfully',
        message: `${report.report_number} was submitted and is now with the verifier. You will be notified with the outcome.`,
        type: 'success',
        category: 'REPORT',
        actionUrl: `/auditor/audits/${report.assignment_id ?? ''}`,
        actionLabel: 'Open Audit',
        entityType: 'audit_report',
        entityId: reportId,
        channels: ['in_app'],
      });
    }
  }

  await notifyAdmins(
    'Audit report submitted',
    `${report.report_number} for ${report.employer_name} was submitted by ${report.auditor_name ?? 'an auditor'} and is awaiting verification.`,
    reportId
  );

  return {
    reportId, version: versionNumber, pdfFileId: pdf.fileId,
    verifierId: verifierId ? Number(verifierId) : null, warnings,
    report: await repo.findReportById(reportId),
  };
}

/**
 * Verifier decision. `approve` closes the audit; `reject` is terminal; `return`
 * sends it back with structured corrections the auditor must clear.
 */
export async function reviewReport(reportId: number, input: unknown, actor: ActorContext) {
  const report = await repo.findReportById(reportId);
  if (!report) return null;

  const parsed = reportReviewSchema.parse(input);
  const warnings: string[] = [];
  const now = new Date();
  const nowSql = now.toISOString().slice(0, 19).replace('T', ' ');

  if (report.status === 'Approved' && parsed.action !== 'approve') {
    throw Object.assign(new Error('This report is already approved'), { code: 'INVALID_STATE' });
  }
  if (report.status === 'Draft') {
    throw Object.assign(new Error('The auditor has not submitted this report yet'), { code: 'INVALID_STATE' });
  }

  // Verifier must actually own the review unless they are an administrator.
  const isAdmin = actor.user.roles.some((role) => ['admin', 'super_admin'].includes(role.slug));
  const activeAssignment = await repo.findActiveVerifierAssignment(reportId);
  if (!isAdmin && activeAssignment && Number(activeAssignment.verifier_id) !== actor.user.id) {
    throw Object.assign(new Error('This report is assigned to another verifier'), { code: 'FORBIDDEN' });
  }

  const statusByAction = {
    approve: 'Approved',
    reject: 'Rejected',
    return: 'Changes Requested',
  } as const;
  const nextStatus = statusByAction[parsed.action];

  // Structured corrections become individual threads so the auditor can tick
  // them off one by one and the next submission proves each was addressed.
  const createdCorrections: number[] = [];
  if (parsed.action === 'return') {
    if (!parsed.corrections.length) {
      warnings.push('No specific corrections were listed — the auditor only receives your comments.');
    }
    for (const correction of parsed.corrections) {
      const id = await repo.insertComment({
        report_id: reportId,
        version: report.current_version,
        comment_type: 'correction_request',
        comment: correction.note,
        section_ref: correction.section_ref ?? null,
        field_ref: correction.field_ref ?? null,
        severity: correction.severity,
        created_by: actor.user.id,
      });
      createdCorrections.push(id);
    }
  }

  await repo.insertComment({
    report_id: reportId,
    version: report.current_version,
    comment_type: parsed.action === 'approve' ? 'approval_note' : parsed.action === 'reject' ? 'rejection_note' : 'correction_request',
    comment: parsed.comments,
    severity: parsed.action === 'approve' ? 'info' : parsed.action === 'reject' ? 'critical' : 'major',
    created_by: actor.user.id,
  });

  await repo.updateReport(
    reportId,
    await applyColumnDefaults('audit_reports', {
      status: nextStatus,
      approved_at: parsed.action === 'approve' ? nowSql : null,
      approved_by: parsed.action === 'approve' ? actor.user.id : null,
      rejected_at: parsed.action === 'reject' ? nowSql : null,
      rejected_by: parsed.action === 'reject' ? actor.user.id : null,
      rejection_reason: parsed.action === 'reject' ? parsed.reason ?? parsed.comments : null,
      next_audit_due: parsed.action === 'approve' ? parsed.next_audit_due ?? report.next_audit_due ?? null : report.next_audit_due ?? null,
      ...(parsed.action === 'approve' ? { pdf_generated_at: report.pdf_generated_at ?? nowSql } : {}),
    }),
    actor.user.id
  );

  if (activeAssignment) {
    await repo.updateVerifierAssignment(Number(activeAssignment.id), {
      status: 'completed',
      completedAt: nowSql,
      remarks: parsed.comments,
    });
  }

  await repo.insertVerifierComment({
    reportId,
    verifierId: actor.user.id,
    action: parsed.action === 'approve' ? 'approved' : parsed.action === 'reject' ? 'rejected' : 'returned',
    comments: parsed.comments,
    reason: parsed.reason ?? null,
  });

  // A fresh revision records the decision against the body it refers to, so the
  // approval history is readable without joining the comment table.
  const latest = await repo.latestVersion(reportId);
  const decisionSnapshot: ReportBody & { decision?: Record<string, unknown> } = {
    ...parseSnapshot(latest?.snapshot_json),
    decision: {
      action: parsed.action,
      status: nextStatus,
      decided_by: actor.user.fullName,
      decided_at: nowSql,
      comments: parsed.comments,
      reason: parsed.reason ?? null,
      corrections: createdCorrections.length,
    },
  };
  await repo.insertVersion({
    reportId,
    version: Number(latest?.version ?? report.current_version) + 1,
    snapshot: decisionSnapshot as Record<string, unknown>,
    changeSummary: parsed.action === 'approve'
      ? `Approved by ${actor.user.fullName}`
      : parsed.action === 'reject'
        ? `Rejected by ${actor.user.fullName}`
        : `Returned for correction by ${actor.user.fullName}`,
    createdBy: actor.user.id,
  });
  await repo.updateReport(reportId, { current_version: Number(latest?.version ?? report.current_version) + 1 }, actor.user.id);

  if (report.assignment_id) {
    await syncAssignment(Number(report.assignment_id), {
      status: parsed.action === 'approve' ? 'Approved' : parsed.action === 'reject' ? 'Rejected' : 'Changes Requested',
      progress_percent: parsed.action === 'approve' ? 100 : 75,
      completedAt: parsed.action === 'approve' ? nowSql : null,
      reportId,
      actorId: actor.user.id,
    });
  }

  // ------------------------------------------------------------ notifying
  const templateData = await buildTemplateData(report, {
    verifier_name: actor.user.fullName,
    approved_date: formatDateTime(nowSql),
    reviewed_date: formatDateTime(nowSql),
    status: nextStatus,
    reason: parsed.reason ?? parsed.comments,
    comments: parsed.comments,
    corrections_list: (createdCorrections.length
      ? (await repo.openCorrections(reportId)).map((row) =>
          `• ${row.section_ref ? `${row.section_ref}: ` : ''}${row.comment} (${row.severity})`)
      : ['None listed']).join('\n'),
  });

  if (parsed.notify_auditor) {
    const auditorUser = report.auditor_email
      ? await queryOne<{ id: number } & RowDataPacket>('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1', [String(report.auditor_email)])
      : null;

    if (auditorUser) {
      await notifyUser({
        userId: Number(auditorUser.id),
        title: parsed.action === 'approve' ? 'Report approved' : parsed.action === 'reject' ? 'Report rejected' : 'Report returned for correction',
        message: parsed.action === 'approve'
          ? `${report.report_number} for ${report.employer_name} was approved by ${actor.user.fullName}.`
          : `${report.report_number} was ${parsed.action === 'reject' ? 'rejected' : 'returned'}. ${parsed.reason ?? ''}`.trim(),
        type: parsed.action === 'approve' ? 'success' : parsed.action === 'reject' ? 'error' : 'warning',
        priority: parsed.action === 'approve' ? 'normal' : 'high',
        category: 'REPORT',
        actionUrl: `/auditor/audits/${report.assignment_id ?? ''}`,
        actionLabel: parsed.action === 'approve' ? 'View Report' : 'Open & Correct',
        entityType: 'audit_report',
        entityId: reportId,
        channels: ['in_app', 'email', 'sms', 'whatsapp'],
        templateCode: parsed.action === 'approve' ? 'report.approved' : 'report.rejected',
        templateData,
      });
    } else if (report.auditor_email) {
      const email = await sendTemplateEmail({
        to: String(report.auditor_email),
        templateCode: parsed.action === 'approve' ? 'report.approved' : 'report.rejected',
        data: templateData,
        entityType: 'audit_report',
        entityId: reportId,
      });
      if (!email.ok) warnings.push(`Auditor email could not be sent: ${email.error ?? 'unknown error'}`);
    }
  }

  if (parsed.action === 'approve' && parsed.notify_employer) {
    const employerUsers = await query<{ user_id: number } & RowDataPacket>(
      `SELECT eu.user_id FROM employer_users eu JOIN users u ON u.id = eu.user_id
        WHERE eu.employer_id = ? AND u.status = 'active' AND u.deleted_at IS NULL`,
      [Number(report.employer_id)]
    );
    if (employerUsers.length) {
      await notifyMany(employerUsers.map((row) => Number(row.user_id)), {
        title: 'Audit report approved',
        message: `${report.audit_title} (${report.report_number}) has been approved. Score: ${formatScore(report.score_percentage)}.`,
        type: 'success',
        category: 'REPORT',
        actionUrl: '/employer/audit-reports',
        actionLabel: 'View Report',
        entityType: 'audit_report',
        entityId: reportId,
        channels: ['in_app', 'email'],
      });
    }
  }

  await notifyAdmins(
    `Audit report ${nextStatus.toLowerCase()}`,
    `${report.report_number} for ${report.employer_name} was ${nextStatus.toLowerCase()} by ${actor.user.fullName}.`,
    reportId
  );

  await writeAuditTrail({
    tableName: 'audit_reports', recordId: reportId, operation: 'UPDATE',
    changes: {
      status: { from: report.status, to: nextStatus },
      approved_by: { from: report.approved_by ?? null, to: parsed.action === 'approve' ? actor.user.id : null },
      rejection_reason: { from: report.rejection_reason ?? null, to: parsed.action === 'reject' ? parsed.reason ?? parsed.comments : null },
    },
    changedBy: actor.user.id, changedByName: actor.user.fullName, ipAddress: actor.ip ?? null,
  });

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(report.employer_id), action: parsed.action === 'approve' ? 'approved' : parsed.action === 'reject' ? 'rejected' : 'updated',
    module: 'audit_report', entityType: 'audit_report', entityId: reportId,
    entityLabel: `${report.report_number} — ${report.audit_title}`,
    description: parsed.action === 'approve'
      ? `Report ${report.report_number} approved by ${actor.user.fullName}`
      : parsed.action === 'reject'
        ? `Report ${report.report_number} rejected by ${actor.user.fullName} — ${parsed.reason ?? ''}`
        : `Report ${report.report_number} returned for correction (${createdCorrections.length} correction request(s))`,
    oldValues: { status: report.status }, newValues: { status: nextStatus, comments: parsed.comments },
    ipAddress: actor.ip ?? null, userAgent: actor.userAgent ?? null,
  });

  return {
    reportId, status: nextStatus, corrections: createdCorrections.length,
    warnings, report: await repo.findReportById(reportId),
  };
}

/** Adds a conversation comment; auditors can reply to corrections. */
export async function addComment(reportId: number, input: unknown, actor: ActorContext) {
  const report = await repo.findReportById(reportId);
  if (!report) return null;

  const parsed = reportCommentSchema.parse(input);
  const commentId = await repo.insertComment({
    report_id: reportId,
    version: parsed.version ?? report.current_version,
    comment_type: parsed.comment_type ?? 'comment',
    comment: parsed.comment,
    section_ref: parsed.section_ref ?? null,
    field_ref: parsed.field_ref ?? null,
    severity: parsed.severity ?? 'info',
    parent_id: parsed.parent_id ?? null,
    created_by: actor.user.id,
  });

  // Tell the other side of the conversation, not the author.
  const participants = await query<{ user_id: number } & RowDataPacket>(
    `SELECT DISTINCT created_by AS user_id FROM audit_report_comments WHERE report_id = ? AND deleted_at IS NULL
     UNION SELECT ? AS user_id`,
    [reportId, actor.user.id]
  );
  const auditors = await query<{ user_id: number } & RowDataPacket>(
    'SELECT user_id FROM auditors WHERE id = ? AND user_id IS NOT NULL',
    [Number(report.auditor_id)]
  );
  const recipients = new Set<number>([
    ...participants.map((row) => Number(row.user_id)),
    ...auditors.map((row) => Number(row.user_id)),
  ]);
  recipients.delete(actor.user.id);

  if (recipients.size) {
    await notifyMany([...recipients], {
      title: `New comment on ${report.report_number}`,
      message: `${actor.user.fullName}: ${parsed.comment.slice(0, 140)}`,
      type: 'info',
      category: 'REPORT',
      actionUrl: threadUrlFor(actor, reportId, Number(report.assignment_id ?? 0)),
      actionLabel: 'Open Report',
      entityType: 'audit_report',
      entityId: reportId,
      channels: ['in_app'],
    });
  }

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(report.employer_id), action: 'commented', module: 'audit_report',
    entityType: 'audit_report', entityId: reportId,
    entityLabel: `${report.report_number} — ${report.audit_title}`,
    description: `${actor.user.fullName} commented on report ${report.report_number}`,
    newValues: { comment_id: commentId, comment_type: parsed.comment_type ?? 'comment' },
    ipAddress: actor.ip ?? null,
  });

  return { commentId, comment: await repo.findCommentById(commentId) };
}

export async function resolveComment(reportId: number, commentId: number, input: unknown, actor: ActorContext) {
  const comment = await repo.findCommentById(commentId);
  if (!comment || Number(comment.report_id) !== reportId) return null;

  const parsed = reportResolveSchema.parse(input ?? {});
  await repo.resolveComment(commentId, actor.user.id, parsed.is_resolved);

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    action: 'updated', module: 'audit_report', entityType: 'audit_report', entityId: reportId,
    entityLabel: comment.report_id ? `Report #${reportId}` : `Report #${reportId}`,
    description: `Correction ${parsed.is_resolved ? 'resolved' : 'reopened'} on report #${reportId}`,
    newValues: { comment_id: commentId, is_resolved: parsed.is_resolved },
    ipAddress: actor.ip ?? null,
  });

  return { updated: 1, comment: await repo.findCommentById(commentId) };
}

export async function deleteComment(reportId: number, commentId: number, actor: ActorContext) {
  const comment = await repo.findCommentById(commentId);
  if (!comment || Number(comment.report_id) !== reportId) return null;
  if (Number(comment.created_by) !== actor.user.id && !actor.user.roles.some((role) => ['admin', 'super_admin'].includes(role.slug))) {
    throw Object.assign(new Error('You can only delete your own comments'), { code: 'FORBIDDEN' });
  }
  await repo.softDeleteComment(commentId);
  return { deleted: true };
}

/** Assigns (or moves) the verifier for a report and tells them. */
export async function assignVerifier(reportId: number, input: unknown, actor: ActorContext) {
  const report = await repo.findReportById(reportId);
  if (!report) return null;

  const parsed = reportVerifierAssignSchema.parse(input);
  if (report.status === 'Approved') {
    throw Object.assign(new Error('This report has already been approved'), { code: 'INVALID_STATE' });
  }

  await repo.reassignVerifierAssignments(reportId, parsed.verifier_id, actor.user.id);
  await repo.updateReport(
    reportId,
    await applyColumnDefaults('audit_reports', { status: report.status === 'Draft' ? 'Draft' : 'Under Review' }),
    actor.user.id
  );

  if (report.assignment_id) {
    await execute('UPDATE audit_assignments SET verifier_id = ? WHERE id = ? AND deleted_at IS NULL', [
      parsed.verifier_id, Number(report.assignment_id),
    ]);
    if (report.status !== 'Draft') {
      await syncAssignment(Number(report.assignment_id), { status: 'Under Review', progress_percent: 85, reportId, actorId: actor.user.id });
    }
  }

  await notifyUser({
    userId: parsed.verifier_id,
    title: 'Report assigned for verification',
    message: `${report.audit_title} (${report.report_number}) was assigned to you by ${actor.user.fullName}${parsed.due_date ? ` — due ${formatDate(parsed.due_date)}` : ''}.`,
    type: 'action_required',
    category: 'REPORT',
    actionUrl: `/verifier/reports/${reportId}`,
    actionLabel: 'Review Report',
    entityType: 'audit_report',
    entityId: reportId,
    channels: ['in_app', 'email'],
  });

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(report.employer_id), action: 'updated', module: 'audit_report',
    entityType: 'audit_report', entityId: reportId,
    entityLabel: `${report.report_number} — ${report.audit_title}`,
    description: `Verifier changed on report ${report.report_number}`,
    newValues: { verifier_id: parsed.verifier_id, due_date: parsed.due_date ?? null },
    ipAddress: actor.ip ?? null,
  });

  return { report: await repo.findReportById(reportId) };
}

/** Moves a report to Under Review (verifier opened it) — idempotent. */
export async function startReview(reportId: number, actor: ActorContext) {
  const report = await repo.findReportById(reportId);
  if (!report) return null;
  if (report.status === 'Under Review') return { report, changed: false };
  if (report.status !== 'Submitted' && report.status !== 'Changes Requested') {
    throw Object.assign(new Error(`A report in ${report.status} status cannot be put under review`), { code: 'INVALID_STATE' });
  }

  await repo.updateReport(reportId, { status: 'Under Review' }, actor.user.id);
  const active = await repo.findActiveVerifierAssignment(reportId);
  if (active) await repo.updateVerifierAssignment(Number(active.id), { status: 'in_review' });
  if (report.assignment_id) {
    await syncAssignment(Number(report.assignment_id), { status: 'Under Review', progress_percent: 85, reportId, actorId: actor.user.id });
  }

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(report.employer_id), action: 'updated', module: 'audit_report',
    entityType: 'audit_report', entityId: reportId,
    entityLabel: `${report.report_number} — ${report.audit_title}`,
    description: `Verification started on report ${report.report_number}`,
    oldValues: { status: report.status }, newValues: { status: 'Under Review' },
    ipAddress: actor.ip ?? null,
  });

  return { report: await repo.findReportById(reportId), changed: true };
}

/** Archives an approved (or abandoned) report. */
export async function archiveReport(reportId: number, actor: ActorContext) {
  const report = await repo.findReportById(reportId);
  if (!report) return null;
  if (report.status === 'Archived') return { report, changed: false };

  await repo.updateReport(reportId, { status: 'Archived' }, actor.user.id);
  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(report.employer_id), action: 'archived', module: 'audit_report',
    entityType: 'audit_report', entityId: reportId,
    entityLabel: `${report.report_number} — ${report.audit_title}`,
    description: `Report ${report.report_number} archived`,
    oldValues: { status: report.status }, newValues: { status: 'Archived' },
    ipAddress: actor.ip ?? null,
  });
  return { report: await repo.findReportById(reportId), changed: true };
}

export async function restoreReport(reportId: number, actor: ActorContext) {
  // A soft-deleted report must be reopenable too, otherwise a mis-click would
  // bury the audit trail for good.
  const report = await repo.findReportById(reportId, { includeDeleted: true });
  if (!report) return null;
  await repo.updateReport(
    reportId,
    { status: 'Draft', deleted_at: null },
    actor.user.id,
    { includeDeleted: true }
  );
  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(report.employer_id), action: 'restored', module: 'audit_report',
    entityType: 'audit_report', entityId: reportId,
    entityLabel: `${report.report_number} — ${report.audit_title}`,
    description: `Report ${report.report_number} reopened as a draft`,
    oldValues: { status: report.status }, newValues: { status: 'Draft' },
    ipAddress: actor.ip ?? null,
  });
  return { report: await repo.findReportById(reportId) };
}

/**
 * Deletes a report. Approved reports are archived instead — the trail matters.
 */
export async function deleteReport(reportId: number, actor: ActorContext) {
  const report = await repo.findReportById(reportId);
  if (!report) return null;

  const approved = await queryOne<{ total: number } & RowDataPacket>(
    "SELECT COUNT(*) AS total FROM audit_reports WHERE id = ? AND status = 'Approved'",
    [reportId]
  );
  if (Number(approved?.total ?? 0) > 0) {
    return { deleted: false, reason: 'An approved report cannot be deleted — archive it instead so the audit trail survives' };
  }

  await withTransaction(async (tx) => {
    await tx.execute('UPDATE audit_reports SET deleted_at = NOW() WHERE id = ?', [reportId]);
    await tx.execute(
      "UPDATE verifier_assignments SET status = 'reassigned', completed_at = NOW() WHERE report_id = ? AND status IN ('pending','in_review')",
      [reportId]
    );
  });

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(report.employer_id), action: 'deleted', module: 'audit_report',
    entityType: 'audit_report', entityId: reportId,
    entityLabel: `${report.report_number} — ${report.audit_title}`,
    description: `Report ${report.report_number} deleted`,
    oldValues: { status: report.status, employer_id: report.employer_id },
    ipAddress: actor.ip ?? null,
  });

  return { deleted: true };
}

/**
 * Generates the PDF and attaches it to the report as the file version that
 * belongs to the current revision.
 */
export async function generateAndStorePdf(
  reportId: number,
  actor: ActorContext,
  options: { body?: ReportBody; submitted?: boolean } = {}
): Promise<{ fileId: number | null; version: number; warnings: string[] }> {
  const report = await repo.findReportById(reportId);
  if (!report) return { fileId: null, version: 0, warnings: ['Report not found'] };

  const warnings: string[] = [];
  const latest = await repo.latestVersion(reportId);
  const body = options.body ?? parseSnapshot(latest?.snapshot_json);

  let buffer: Buffer;
  try {
    buffer = await generateAuditReportPdf(
      { report: report as unknown as Record<string, unknown>, body, version: Number(latest?.version ?? report.current_version) },
      { generatedByName: actor.user.fullName, generatedByRole: actor.user.primaryRole }
    );
  } catch (error) {
    warnings.push(`PDF generation failed: ${(error as Error).message}`);
    return { fileId: null, version: Number(latest?.version ?? report.current_version), warnings };
  }

  const stored = await attachGeneratedFile({
    fileId: report.pdf_file_id ? Number(report.pdf_file_id) : null,
    entityType: 'AUDIT_REPORT',
    entityId: reportId,
    filename: `${report.report_number.replace(/[^a-zA-Z0-9]+/g, '-')}-v${Number(latest?.version ?? report.current_version)}.pdf`,
    mimeType: 'application/pdf',
    data: buffer,
    category: 'Audit Report PDF',
    changeNote: options.submitted ? 'Generated on submission' : 'PDF regenerated',
    actor: { user: actor.user, ip: actor.ip ?? null },
  });

  const nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await repo.updateReport(reportId, { pdf_file_id: stored.id, pdf_generated_at: nowSql }, actor.user.id);

  // Keep the version row pointing at the PDF that belongs to it.
  const versionNumber = Number(latest?.version ?? report.current_version);
  await execute('UPDATE audit_report_versions SET pdf_file_id = ? WHERE report_id = ? AND version = ?', [
    stored.id, reportId, versionNumber,
  ]);

  return { fileId: stored.id, version: versionNumber, warnings };
}

/** Reads a stored PDF back so it can ride along with the notification email. */
async function loadAttachment(fileId: number | null) {
  if (!fileId) return undefined;
  try {
    const file = await findFile(fileId);
    if (!file) return undefined;
    const content = await readFileBytes(file);
    return [{ filename: file.original_name, content, contentType: file.mime_type ?? 'application/pdf' }];
  } catch {
    // A missing attachment must never block the notification.
    return undefined;
  }
}

/* --------------------------------------------------------------- helpers */

/** Assignment status/progress mirrors the report's stage. */
async function syncAssignment(
  assignmentId: number,
  input: { status: string; progress_percent: number; completedAt?: string | null; reportId: number; actorId: number }
): Promise<void> {
  const sets = ['status = ?', 'progress_percent = ?', 'updated_by = ?'];
  const params: unknown[] = [input.status, input.progress_percent, input.actorId];

  if (input.completedAt !== undefined) {
    sets.push('completed_at = ?');
    params.push(input.completedAt);
  }
  if (input.status === 'Approved') {
    sets.push('revision_count = revision_count + 1');
  }

  await execute(`UPDATE audit_assignments SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, [...params, assignmentId]);

  await writeActivityLog({
    userId: input.actorId, userName: 'System', userRole: 'system',
    action: 'updated', module: 'audit_assignment', entityType: 'audit_assignment', entityId: assignmentId,
    entityLabel: `Assignment #${assignmentId}`,
    description: `Assignment moved to ${input.status} by report #${input.reportId}`,
    newValues: { status: input.status, progress_percent: input.progress_percent },
  });
}

async function loadAssignment(assignmentId: number) {
  return queryOne<{
    id: number; assignment_number: string; verifier_id: number | null; auditor_id: number; unit_id: number | null;
    module_id: number | null; start_date: string | null; end_date: string | null; due_date: string | null;
  } & RowDataPacket>(
    `SELECT id, assignment_number, verifier_id, auditor_id, unit_id, module_id, start_date, end_date, due_date
       FROM audit_assignments WHERE id = ? AND deleted_at IS NULL`,
    [assignmentId]
  );
}

/** Scorecard rows win when they are present; otherwise the headline figures stand. */
function deriveScore(body: ReportBody, obtained: number | null, max: number | null, percentage: number | null) {
  const scorecard = body.scorecard ?? [];
  let resolvedObtained = obtained;
  let resolvedMax = max;

  if (scorecard.length) {
    const sumMax = scorecard.reduce((total, row) => total + Number(row.max_score ?? 0), 0);
    const sumObtained = scorecard.reduce((total, row) => total + Number(row.obtained_score ?? 0), 0);
    if (sumMax > 0) {
      resolvedMax = sumMax;
      resolvedObtained = sumObtained;
    }
  }

  const resolvedPercentage = resolvedMax && resolvedMax > 0 && resolvedObtained !== null && resolvedObtained !== undefined
    ? Math.round((Number(resolvedObtained) / Number(resolvedMax)) * 10000) / 100
    : percentage ?? null;

  return {
    obtained: resolvedObtained === null || resolvedObtained === undefined ? null : Number(resolvedObtained),
    max: resolvedMax === null || resolvedMax === undefined ? null : Number(resolvedMax),
    percentage: resolvedPercentage === null || resolvedPercentage === undefined ? null : Number(resolvedPercentage),
  };
}

function countFindings(body: ReportBody) {
  const counts = { critical_findings: 0, major_findings: 0, minor_findings: 0, observations: 0 };
  for (const finding of body.findings ?? []) {
    const field = SEVERITY_COUNT_FIELD[finding.severity ?? 'Minor'];
    if (field) counts[field] += 1;
  }
  // Free-text observations count towards the observation tally too.
  counts.observations += (body.observations ?? []).length;
  return counts;
}

function formatScore(percentage: unknown): string {
  if (percentage === null || percentage === undefined || percentage === '') return 'not scored';
  return `${Number(percentage).toFixed(1)}%`;
}

function isVerifier(actor: ActorContext): boolean {
  return actor.user.roles.some((role) => role.slug === 'verifier');
}

/**
 * Where the person on the other side of a comment should land: each workspace has
 * its own report screen, and an auditor reads the thread inside the audit they
 * are working on.
 */
function threadUrlFor(actor: ActorContext, reportId: number, assignmentId: number): string {
  const slugs = actor.user.roles.map((role) => role.slug);
  if (slugs.includes('verifier')) return `/verifier/reports/${reportId}`;
  if (slugs.includes('auditor') && assignmentId) return `/auditor/audits/${assignmentId}`;
  if (slugs.includes('auditor')) return '/auditor/reports';
  return `/admin/audit-reports/${reportId}`;
}

async function notifyAdmins(title: string, message: string, reportId: number): Promise<void> {
  const admins = await usersWithRole('admin');
  if (!admins.length) return;
  await notifyMany(admins, {
    title,
    message,
    type: 'info',
    category: 'REPORT',
    actionUrl: `/admin/audit-reports/${reportId}`,
    actionLabel: 'Open Report',
    entityType: 'audit_report',
    entityId: reportId,
    channels: ['in_app'],
  });
}

/** Merge fields shared by the report email templates. */
async function buildTemplateData(report: repo.ReportListRow, extra: Record<string, unknown>) {
  return {
    report_number: report.report_number,
    audit_title: report.audit_title,
    employer_name: report.employer_name ?? '',
    auditor_name: report.auditor_name ?? '',
    employer_contact: report.employer_name ?? '',
    score_percentage: formatScore(report.score_percentage),
    critical_findings: Number(report.critical_findings ?? 0),
    major_findings: Number(report.major_findings ?? 0),
    minor_findings: Number(report.minor_findings ?? 0),
    submitted_date: report.submitted_at ? formatDateTime(String(report.submitted_at)) : '—',
    report_url: `${APP_URL}/admin/audit-reports/${report.id}`,
    platform_name: 'ComplianceOS',
    ...extra,
  };
}
