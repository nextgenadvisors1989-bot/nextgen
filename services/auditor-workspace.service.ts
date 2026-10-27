/**
 * Auditor workspace.
 *
 * Everything an auditor sees is scoped through here: the assignment list, the
 * working copy of the report, the start / save / submit transitions and the
 * corrections they have to clear. Two rules hold throughout:
 *
 *   1. **Ownership is re-checked on every call.** The auditor id is resolved from
 *      the signed-in user (`auditors.user_id`), never taken from the request, and
 *      every read and write verifies `assignment.auditor_id` matches it. A URL
 *      cannot be edited to reach somebody else's audit.
 *   2. **One report per assignment.** `startAudit` resumes the existing draft when
 *      there is one instead of creating a second, so a double click is harmless.
 *
 * The heavy lifting (scoring, revision freezing, PDF generation, notifications)
 * lives in `audit-report.service` — this layer adds the panel's scoping, the
 * assignment state machine and the auditor's checklist of outstanding work.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import * as assignmentRepo from '@/repositories/audit-assignment.repository';
import * as reportRepo from '@/repositories/audit-report.repository';
import * as reportService from '@/services/audit-report.service';
import { notifyMany } from '@/lib/notifications/notification-service';
import { writeActivityLog } from '@/lib/logger/activity-log';
import type { ActorContext } from '@/services/audit-report.service';
import type { ReportBody, FindingInput } from '@/lib/validations/audit-report.validation';

export interface AuditorIdentity {
  id: number;
  name: string;
  auditor_code: string;
  email: string | null;
  phone: string | null;
  user_id: number | null;
  specialization: string | null;
  status: string;
}

/** Thrown when the signed-in account has no auditor profile behind it. */
function forbidden(message: string) {
  return Object.assign(new Error(message), { code: 'FORBIDDEN' });
}

/** The auditor record behind the signed-in login. */
export async function identityFor(userId: number): Promise<AuditorIdentity> {
  const row = await queryOne<AuditorIdentity & RowDataPacket>(
    `SELECT id, name, auditor_code, email, mobile AS phone, user_id, specialization, status
       FROM auditors WHERE user_id = ? AND deleted_at IS NULL LIMIT 1`,
    [userId]
  );
  if (!row) {
    throw forbidden('This login is not linked to an auditor profile. Ask an administrator to link one from the auditor register.');
  }
  return { ...row, id: Number(row.id) };
}

/**
 * The auditor identity for a page render, or `null` when the login is not linked
 * to an auditor profile.
 *
 * `identityFor` throws, which is right for an API — the caller gets a 403 with the
 * reason. A page cannot do that: an unlinked login would render a 500, which tells
 * the person nothing. Pages use this instead and show the reason on screen.
 */
export async function identityOrNull(userId: number): Promise<AuditorIdentity | null> {
  try {
    return await identityFor(userId);
  } catch {
    return null;
  }
}

/** The auditor's own view of one assignment, or `null` when it is not theirs. */
export async function myAssignment(assignmentId: number, auditorId: number) {
  const assignment = await assignmentRepo.findAssignmentById(assignmentId);
  if (!assignment) return null;
  if (Number(assignment.auditor_id) !== Number(auditorId)) {
    throw forbidden('This audit is assigned to another auditor.');
  }
  return assignment;
}

/* ------------------------------------------------------------------ reads */

export function listMyAudits(auditorId: number, filters: assignmentRepo.AssignmentListFilters) {
  return assignmentRepo.findAssignments({ ...filters, auditorId });
}

/** Funnel counters for the auditor's header, plus the value of their portfolio. */
export async function myAuditStats(auditorId: number) {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(aa.status = 'Not Started') AS not_started,
       SUM(aa.status IN ('In Progress','Draft Saved')) AS in_progress,
       SUM(aa.status IN ('Submitted','Under Review')) AS under_review,
       SUM(aa.status = 'Approved') AS approved,
       SUM(aa.status IN ('Rejected','Changes Requested')) AS returned,
       SUM(aa.status = 'Cancelled') AS cancelled,
       SUM(aa.due_date IS NOT NULL AND aa.due_date < CURDATE()
           AND aa.status NOT IN ('Approved','Cancelled')) AS overdue,
       SUM(aa.status NOT IN ('Approved','Cancelled') AND aa.due_date IS NOT NULL
           AND DATEDIFF(aa.due_date, CURDATE()) BETWEEN 0 AND 7) AS due_this_week,
       SUM(aa.status NOT IN ('Approved','Cancelled') AND aa.priority = 'High') AS high_priority_count,
       (SELECT COUNT(*) FROM audit_reports ar
         WHERE ar.auditor_id = ? AND ar.deleted_at IS NULL) AS reports,
       (SELECT COUNT(*) FROM audit_reports ar
         WHERE ar.auditor_id = ? AND ar.deleted_at IS NULL AND ar.status = 'Draft') AS drafts,
       (SELECT ROUND(AVG(ar.score_percentage), 1) FROM audit_reports ar
         WHERE ar.auditor_id = ? AND ar.deleted_at IS NULL AND ar.status = 'Approved') AS average_score,
       (SELECT COUNT(*) FROM audit_report_comments c
          JOIN audit_reports ar ON ar.id = c.report_id
         WHERE ar.auditor_id = ? AND ar.deleted_at IS NULL AND c.deleted_at IS NULL
           AND c.comment_type = 'correction_request' AND c.is_resolved = 0) AS open_corrections
     FROM audit_assignments aa
     WHERE aa.deleted_at IS NULL AND aa.auditor_id = ?`,
    [auditorId, auditorId, auditorId, auditorId, auditorId]
  );

  return {
    total: Number(row?.total ?? 0),
    notStarted: Number(row?.not_started ?? 0),
    inProgress: Number(row?.in_progress ?? 0),
    underReview: Number(row?.under_review ?? 0),
    approved: Number(row?.approved ?? 0),
    returned: Number(row?.returned ?? 0),
    cancelled: Number(row?.cancelled ?? 0),
    overdue: Number(row?.overdue ?? 0),
    dueThisWeek: Number(row?.due_this_week ?? 0),
    highPriority: Number(row?.high_priority_count ?? 0),
    reports: Number(row?.reports ?? 0),
    drafts: Number(row?.drafts ?? 0),
    averageScore: row?.average_score === null || row?.average_score === undefined ? null : Number(row.average_score),
    openCorrections: Number(row?.open_corrections ?? 0),
  };
}

/**
 * The complete workbench bundle for one audit: the assignment, the report with its
 * working body, the corrections still outstanding, the evidence already filed and
 * the history of what has happened to it.
 */
export async function auditWorkspace(assignmentId: number, auditorId: number) {
  const assignment = await myAssignment(assignmentId, auditorId);
  if (!assignment) return null;

  const linked = await reportRepo.findReportByAssignment(assignmentId);
  const report = linked ? await reportRepo.findReportById(Number(linked.id)) : null;
  const detail = report ? await reportService.getReportDetail(Number(report.id)) : null;

  const [files, history] = await Promise.all([
    assignmentRepo.assignmentFiles(assignmentId),
    assignmentRepo.assignmentHistory(assignmentId),
  ]);

  const corrections = detail
    ? detail.comments.filter((comment) => comment.comment_type === 'correction_request' && !comment.is_resolved)
    : [];

  const checklist = buildChecklist(detail?.body ?? null, report, corrections.length, assignment);

  return {
    assignment,
    report,
    body: detail?.body ?? null,
    draftSavedAt: detail?.draftSavedAt ?? null,
    versions: detail?.versions ?? [],
    comments: detail?.comments ?? [],
    decisions: detail?.decisions ?? [],
    commentCounts: detail?.commentCounts ?? { total: 0, corrections: 0, openCorrections: 0 },
    openCorrections: corrections,
    files,
    history,
    checklist,
  };
}

export type AuditorAuditStats = Awaited<ReturnType<typeof myAuditStats>>;
export type AuditorReportStats = Awaited<ReturnType<typeof myReportStats>>;
export type AuditWorkspaceBundle = NonNullable<Awaited<ReturnType<typeof auditWorkspace>>>;

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  hint: string;
  /** Blocks submission while false. */
  required: boolean;
}

/** What still has to be true before this report can be submitted. */
export function buildChecklist(
  body: ReportBody | null,
  report: reportRepo.ReportListRow | null,
  openCorrections: number,
  assignment: { status: string } | null
): ChecklistItem[] {
  const findings = body?.findings ?? [];
  const scorecard = body?.scorecard ?? [];
  const documentedFindings = findings.filter((finding: FindingInput) => (finding.description ?? '').trim().length >= 10);
  const evidencedFindings = findings.filter((finding: FindingInput) => (finding.evidence ?? '').trim().length > 0);

  return [
    {
      key: 'started',
      label: 'Audit started',
      done: Boolean(report && report.status !== 'Archived'),
      hint: 'Open the audit to create its report draft.',
      required: true,
    },
    {
      key: 'summary',
      label: 'Executive summary written',
      done: (body?.executive_summary ?? '').trim().length >= 40,
      hint: 'Summarise the audit outcome in at least 40 characters.',
      required: true,
    },
    {
      key: 'methodology',
      label: 'Scope & methodology written',
      done: (body?.methodology ?? '').trim().length >= 20,
      hint: 'Say what was inspected, who was interviewed and which records were verified.',
      required: true,
    },
    {
      key: 'scorecard',
      label: 'Scorecard filled in',
      done: scorecard.length > 0 && scorecard.every((row) => Number(row.max_score) > 0),
      hint: 'Every scorecard row needs a maximum score so the percentage can be derived.',
      required: false,
    },
    {
      key: 'findings',
      label: 'Every finding described',
      done: findings.length > 0 && documentedFindings.length === findings.length,
      hint: 'Each finding needs a description of at least 10 characters.',
      required: true,
    },
    {
      key: 'evidence',
      label: 'Evidence recorded against findings',
      done: findings.length > 0 && evidencedFindings.length === findings.length,
      hint: 'Reference the register page, photograph or record you relied on.',
      required: false,
    },
    {
      key: 'corrections',
      label: openCorrections > 0 ? `Verifier corrections cleared (${openCorrections} open)` : 'No open corrections',
      done: openCorrections === 0,
      hint: 'Tick each correction off once the document has been corrected.',
      required: true,
    },
    {
      key: 'state',
      label: 'Ready to submit',
      done: !report || ['Draft', 'Changes Requested'].includes(report.status),
      hint: assignment && ['Submitted', 'Under Review', 'Approved'].includes(assignment.status)
        ? 'This audit is already with the verifier.'
        : 'Reports can be submitted from Draft or Changes Requested.',
      required: true,
    },
  ];
}

/* ------------------------------------------------------------- transitions */

export interface StartAuditResult {
  reportId: number;
  reportNumber: string;
  resumed: boolean;
  warnings: string[];
}

/**
 * Opens the audit: creates the report draft for the assignment (or resumes the
 * one that exists) and moves the assignment to `In Progress`.
 */
export async function startAudit(
  assignmentId: number,
  auditorId: number,
  actor: ActorContext
): Promise<StartAuditResult> {
  const assignment = await myAssignment(assignmentId, auditorId);
  if (!assignment) {
    throw Object.assign(new Error('Audit not found'), { code: 'NOT_FOUND' });
  }
  if (['Cancelled'].includes(String(assignment.status))) {
    throw Object.assign(new Error('This audit was cancelled — ask an administrator to reopen it.'), { code: 'INVALID_STATE' });
  }

  const existing = await reportRepo.findReportByAssignment(assignmentId);
  if (existing) {
    if (['Not Started'].includes(String(assignment.status))) {
      await assignmentRepo.setStatus(assignmentId, 'In Progress', actor.user.id, { progress_percent: 10 });
    }
    return { reportId: Number(existing.id), reportNumber: existing.report_number, resumed: true, warnings: [] };
  }

  const created = await reportService.createReport(
    {
      assignment_id: assignmentId,
      employer_id: Number(assignment.employer_id),
      unit_id: assignment.unit_id ?? null,
      auditor_id: auditorId,
      module_id: assignment.module_id ?? null,
      audit_title: assignment.audit_title,
      report_type: assignment.assignment_type ?? 'AUDIT',
      audit_period_from: assignment.start_date ?? null,
      audit_period_to: assignment.end_date ?? null,
      audit_date: assignment.end_date ?? assignment.start_date ?? null,
      body: {
        executive_summary: null,
        methodology: null,
        findings: [],
        scorecard: [],
        observations: [],
        recommendations: [],
        regulatory_references: [],
      },
    },
    actor
  );

  // The report points at the assignment (`audit_reports.assignment_id`), not the
  // other way round — there is no report column on the assignment.
  await assignmentRepo.setStatus(assignmentId, 'In Progress', actor.user.id, { progress_percent: 10 });

  await notifyEmployerAuditStarted(Number(assignment.employer_id), assignment.audit_title, assignment.assignment_number, created.reportId);

  return { reportId: created.reportId, reportNumber: created.reportNumber, resumed: false, warnings: created.warnings };
}

/** Saves the auditor's working copy of the report behind an assignment. */
export async function saveMyDraft(assignmentId: number, input: unknown, actor: ActorContext, auditorId: number) {
  const assignment = await myAssignment(assignmentId, auditorId);
  if (!assignment) return null;

  const linked = await reportRepo.findReportByAssignment(assignmentId);
  if (!linked) {
    throw Object.assign(new Error('Start the audit before saving a draft'), { code: 'INVALID_STATE' });
  }
  if (['Submitted', 'Under Review', 'Approved'].includes(String(assignment.status))) {
    throw Object.assign(
      new Error('This audit has already been submitted — it can only be edited after the verifier returns it'),
      { code: 'INVALID_STATE' }
    );
  }

  return reportService.saveDraft(Number(linked.id), input, actor);
}

/** Submits the report: revision + PDF + verifier queue + notifications. */
export async function submitMyAudit(assignmentId: number, input: unknown, actor: ActorContext, auditorId: number) {
  const assignment = await myAssignment(assignmentId, auditorId);
  if (!assignment) return null;

  const linked = await reportRepo.findReportByAssignment(assignmentId);
  if (!linked) {
    throw Object.assign(new Error('Start the audit and write the report before submitting'), { code: 'INVALID_STATE' });
  }

  const detail = await reportService.getReportDetail(Number(linked.id));
  const openCorrections = detail ? detail.commentCounts.openCorrections : 0;
  if (openCorrections > 0) {
    throw Object.assign(
      new Error(`${openCorrections} verifier correction(s) are still open — clear them before resubmitting`),
      { code: 'INVALID_STATE' }
    );
  }

  return reportService.submitReport(Number(linked.id), input, actor);
}

/** Replies on the report thread; auditors use this to answer a correction. */
export async function commentOnMyAudit(assignmentId: number, input: unknown, actor: ActorContext, auditorId: number) {
  const assignment = await myAssignment(assignmentId, auditorId);
  if (!assignment) return null;

  const linked = await reportRepo.findReportByAssignment(assignmentId);
  if (!linked) {
    throw Object.assign(new Error('Start the audit before commenting on it'), { code: 'INVALID_STATE' });
  }

  return reportService.addComment(Number(linked.id), input, actor);
}

/** Ticks a correction off (or reopens it) — the auditor's evidence that it is done. */
export async function resolveMyCorrection(
  assignmentId: number,
  commentId: number,
  input: unknown,
  actor: ActorContext,
  auditorId: number
) {
  const assignment = await myAssignment(assignmentId, auditorId);
  if (!assignment) return null;

  const linked = await reportRepo.findReportByAssignment(assignmentId);
  if (!linked) return null;

  const comment = await queryOne<{ id: number; report_id: number; comment_type: string; is_resolved: number } & RowDataPacket>(
    'SELECT id, report_id, comment_type, is_resolved FROM audit_report_comments WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [commentId]
  );
  if (!comment) return null;
  if (Number(comment.report_id) !== Number(linked.id)) {
    throw forbidden('That correction belongs to a different report.');
  }
  if (comment.comment_type !== 'correction_request') {
    throw Object.assign(new Error('Only correction requests can be resolved'), { code: 'INVALID_STATE' });
  }

  return reportService.resolveComment(Number(linked.id), commentId, input, actor);
}

/* ------------------------------------------------------------------ reports */

export function myReports(auditorId: number, filters: { search?: string; status?: string } = {}) {
  return reportRepo.findReportsByAuditor(auditorId, filters);
}

/** Counters for the auditor's report register. */
export async function myReportStats(auditorId: number) {
  const row = await queryOne<RowDataPacket>(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'Draft') AS draft,
       SUM(status IN ('Submitted','Under Review')) AS under_review,
       SUM(status = 'Approved') AS approved,
       SUM(status IN ('Rejected','Changes Requested')) AS returned,
       SUM(status = 'Archived') AS archived,
       ROUND(AVG(score_percentage), 1) AS average_score,
       SUM(critical_findings) AS critical_findings,
       SUM(major_findings) AS major_findings,
       SUM(minor_findings) AS minor_findings,
       SUM(observations) AS observations
     FROM audit_reports
     WHERE deleted_at IS NULL AND auditor_id = ?`,
    [auditorId]
  );

  return {
    total: Number(row?.total ?? 0),
    draft: Number(row?.draft ?? 0),
    underReview: Number(row?.under_review ?? 0),
    approved: Number(row?.approved ?? 0),
    returned: Number(row?.returned ?? 0),
    archived: Number(row?.archived ?? 0),
    averageScore: row?.average_score === null || row?.average_score === undefined ? null : Number(row.average_score),
    criticalFindings: Number(row?.critical_findings ?? 0),
    majorFindings: Number(row?.major_findings ?? 0),
    minorFindings: Number(row?.minor_findings ?? 0),
    observations: Number(row?.observations ?? 0),
  };
}

/** The employer's portal users are told when an auditor opens their audit. */
async function notifyEmployerAuditStarted(
  employerId: number,
  auditTitle: string,
  assignmentNumber: string,
  reportId: number
): Promise<void> {
  const users = await query<{ user_id: number } & RowDataPacket>(
    `SELECT eu.user_id FROM employer_users eu JOIN users u ON u.id = eu.user_id
      WHERE eu.employer_id = ? AND u.status = 'active' AND u.deleted_at IS NULL`,
    [employerId]
  );
  if (!users.length) return;

  await notifyMany(users.map((row) => Number(row.user_id)), {
    title: 'Your audit has started',
    message: `${auditTitle} (${assignmentNumber}) is now in progress. Findings and the final report will appear in your compliance workspace.`,
    type: 'info',
    category: 'AUDIT',
    actionUrl: '/employer/audits',
    actionLabel: 'View Audits',
    entityType: 'audit_assignment',
    entityId: reportId,
    channels: ['in_app', 'email'],
  });
}
