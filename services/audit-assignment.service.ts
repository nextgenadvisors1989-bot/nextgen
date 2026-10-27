/**
 * Audit assignment lifecycle.
 *
 * Creating an assignment is the point where the platform's whole workflow starts
 * moving, so it does five things in one transaction-safe pass:
 *   1. allocates `AUD/<year>/<000001>`,
 *   2. records the assignment (with capacity check against the auditor's limit),
 *   3. puts it on the shared calendar (schedule + closing meeting),
 *   4. notifies the auditor, the verifier, the employer's portal users and the
 *      administrators — in-app, email, SMS and WhatsApp per template,
 *   5. writes activity log + audit trail.
 *
 * Later transitions (start, save draft, submit, under review, approve, reject,
 * return, reassign, cancel) live here too, because they all have to keep the
 * report register, the timeline and the notifications consistent.
 */
import { randomUUID } from 'node:crypto';
import { execute, insert, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { withTransaction } from '@/lib/db/transactions';
import { applyColumnDefaults } from '@/lib/db/column-defaults';
import * as repo from '@/repositories/audit-assignment.repository';
import {
  assignmentCreateSchema, assignmentUpdateSchema, assignmentReassignSchema, assignmentCancelSchema,
} from '@/lib/validations/audit-assignment.validation';
import { writeActivityLog, writeAuditTrail } from '@/lib/logger/activity-log';
import { sendTemplateEmail } from '@/lib/notifications/email-service';
import { notifyMany, notifyUser, usersWithRole } from '@/lib/notifications/notification-service';
import { nextDocumentNumber } from '@/lib/utils/report-number';
import { APP_URL } from '@/lib/utils/constants';
import { formatDate } from '@/lib/utils/dates';
import type { AuthUser } from '@/types/user';

export interface ActorContext {
  user: AuthUser;
  ip?: string | null;
  userAgent?: string | null;
}

export interface CreateAssignmentResult {
  assignmentId: number;
  assignmentNumber: string;
  warnings: string[];
  calendarEventId: number | null;
  capacity: { auditorName: string; open: number; max: number } | null;
}

export async function listAssignments(filters: repo.AssignmentListFilters) {
  return repo.findAssignments(filters);
}

export async function getAssignmentDetail(assignmentId: number) {
  const assignment = await repo.findAssignmentById(assignmentId);
  if (!assignment) return null;

  const [history, files] = await Promise.all([
    repo.assignmentHistory(assignmentId),
    repo.assignmentFiles(assignmentId),
  ]);

  return { assignment, history, files };
}

export function assignmentStats(employerId?: number) {
  return repo.getAssignmentStats(employerId);
}

/** Employer + unit + department + auditor + verifier options for the form. */
export async function assignmentLookups() {
  const [employers, units, departments, auditors, verifiers, modules] = await Promise.all([
    query<RowDataPacket>(
      "SELECT id, company_name, employer_code, city FROM employers WHERE deleted_at IS NULL AND status = 'active' ORDER BY company_name"
    ),
    query<RowDataPacket>('SELECT id, employer_id, unit_name FROM company_units WHERE deleted_at IS NULL ORDER BY unit_name'),
    query<RowDataPacket>('SELECT id, employer_id, unit_id, department_name FROM departments WHERE deleted_at IS NULL ORDER BY department_name'),
    repo_auditorOptions(),
    repo.verifierOptions(),
    query<RowDataPacket>(
      "SELECT id, name, code, default_tat_days, requires_verification FROM dynamic_modules WHERE deleted_at IS NULL AND status = 'active' ORDER BY sort_order, name"
    ).catch(() => [] as RowDataPacket[]),
  ]);

  return {
    employers: employers.map((row) => ({
      id: Number(row.id), company_name: String(row.company_name),
      employer_code: String(row.employer_code), city: row.city ?? null,
    })),
    units: units.map((row) => ({
      id: Number(row.id), employer_id: Number(row.employer_id), unit_name: String(row.unit_name),
    })),
    departments: departments.map((row) => ({
      id: Number(row.id), employer_id: Number(row.employer_id),
      unit_id: row.unit_id === null ? null : Number(row.unit_id),
      department_name: String(row.department_name),
    })),
    auditors: auditors.map((row) => ({
      id: Number(row.id), name: String(row.name), auditor_code: String(row.auditor_code),
      email: String(row.email), specialization: row.specialization ?? null,
      auditor_type_name: row.auditor_type_name ?? null,
      max_concurrent_audits: Number(row.max_concurrent_audits ?? 5),
      open_assignments: Number(row.open_assignments ?? 0),
    })),
    verifiers: verifiers.map((row) => ({
      id: Number(row.id), name: String(row.name), email: String(row.email),
      pending_reviews: Number(row.pending_reviews ?? 0),
    })),
    modules: modules.map((row) => ({
      id: Number(row.id), name: String(row.name), code: String(row.code),
      default_tat_days: row.default_tat_days === null ? null : Number(row.default_tat_days),
      requires_verification: Number(row.requires_verification ?? 0),
    })),
  };
}

async function repo_auditorOptions() {
  return query<RowDataPacket>(
    `SELECT a.id, a.auditor_code, a.name, a.email, a.specialization, a.max_concurrent_audits,
            t.name AS auditor_type_name,
            (SELECT COUNT(*) FROM audit_assignments aa
              WHERE aa.auditor_id = a.id AND aa.deleted_at IS NULL
                AND aa.status NOT IN ('Approved','Cancelled')) AS open_assignments
       FROM auditors a
       LEFT JOIN auditor_types t ON t.id = a.auditor_type_id
      WHERE a.deleted_at IS NULL AND a.status = 'active'
      ORDER BY a.name`
  );
}

/**
 * Creates the assignment and kicks off every downstream effect. Notification and
 * email failures are collected as warnings rather than failing the request — the
 * assignment itself is the record of truth.
 */
export async function createAssignment(input: unknown, actor: ActorContext): Promise<CreateAssignmentResult> {
  const parsed = assignmentCreateSchema.parse(input);
  const warnings: string[] = [];

  const auditor = await repo.auditorWorkload(parsed.auditor_id);
  if (!auditor) {
    throw Object.assign(new Error('The selected auditor does not exist or was archived'), { code: 'INVALID_REFERENCE' });
  }

  const open = Number(auditor.open_assignments ?? 0);
  const max = Number(auditor.max_concurrent_audits ?? 5);
  if (open >= max) {
    warnings.push(
      `${auditor.name} already has ${open} open assignment(s) against a capacity of ${max}. Consider reassigning or raising their limit.`
    );
  }

  const employer = await queryOne<RowDataPacket>(
    'SELECT id, company_name, employer_code, contact_person_name, contact_person_email FROM employers WHERE id = ? AND deleted_at IS NULL',
    [parsed.employer_id]
  );
  if (!employer) {
    throw Object.assign(new Error('The selected employer does not exist or was archived'), { code: 'INVALID_REFERENCE' });
  }

  const assignmentNumber = await nextDocumentNumber('assignment');
  const {
    notify_auditor, notify_verifier, notify_employer, create_calendar_event, reminder_minutes,
    ...fields
  } = parsed;

  const data: Record<string, unknown> = {
    ...fields,
    uuid: randomUUID(),
    assignment_number: assignmentNumber,
    status: 'Not Started',
    progress_percent: 0,
    revision_count: 0,
  };

  const assignmentId = await repo.createAssignment(await applyColumnDefaults('audit_assignments', data), actor.user.id);

  // ---------------------------------------------------------------- calendar
  let calendarEventId: number | null = null;
  if (create_calendar_event && (parsed.start_date || parsed.due_date)) {
    calendarEventId = await createCalendarEvents({
      assignmentId,
      assignmentNumber,
      title: parsed.audit_title,
      employerId: parsed.employer_id,
      unitId: parsed.unit_id ?? null,
      auditorId: parsed.auditor_id,
      startDate: parsed.start_date ?? null,
      endDate: parsed.end_date ?? parsed.start_date ?? null,
      dueDate: parsed.due_date ?? null,
      endMeetingAt: parsed.audit_end_meeting_at ?? null,
      priority: parsed.priority,
      reminderMinutes: reminder_minutes,
      scope: parsed.scope ?? null,
      createdBy: actor.user.id,
    });
  }

  // ----------------------------------------------------------- notifications
  const details = await repo.findAssignmentById(assignmentId);
  const templateData = buildTemplateData(details, assignmentNumber);

  if (notify_auditor && details?.auditor_email) {
    const notified = await notifyAuditor(details, templateData, assignmentNumber);
    if (notified.errors.length) warnings.push(...notified.errors);
  }

  if (notify_verifier && parsed.verifier_id) {
    const verifier = await queryOne<{ id: number; first_name: string; last_name: string; email: string } & RowDataPacket>(
      'SELECT id, first_name, last_name, email FROM users WHERE id = ? LIMIT 1',
      [parsed.verifier_id]
    );
    if (verifier) {
      await notifyUser({
        userId: Number(verifier.id),
        title: 'Report awaiting your review',
        message: `${parsed.audit_title} (${assignmentNumber}) was assigned to you as verifier. The auditor's submission will appear in your queue.`,
        type: 'info',
        category: 'AUDIT',
        actionUrl: `/verifier/reports`,
        actionLabel: 'Open Verifier Queue',
        entityType: 'audit_assignment',
        entityId: assignmentId,
        channels: ['in_app', 'email'],
      });
    }
  }

  if (notify_employer) {
    // `employer_users` links a portal account to the employer, not to a unit, so
    // every active portal user of the employer hears about the scheduled audit.
    const employerUsers = await query<{ user_id: number } & RowDataPacket>(
      `SELECT eu.user_id FROM employer_users eu
        JOIN users u ON u.id = eu.user_id
       WHERE eu.employer_id = ? AND u.status = 'active' AND u.deleted_at IS NULL`,
      [parsed.employer_id]
    );

    if (employerUsers.length) {
      await notifyMany(employerUsers.map((row) => Number(row.user_id)), {
        title: 'An audit has been scheduled',
        message: `${parsed.audit_title} (${assignmentNumber}) is scheduled for your company${parsed.start_date ? ` from ${formatDate(parsed.start_date)}` : ''}.`,
        type: 'info',
        category: 'AUDIT',
        actionUrl: `/employer/audits`,
        actionLabel: 'View Audits',
        entityType: 'audit_assignment',
        entityId: assignmentId,
        channels: ['in_app', 'email'],
      });
    }

    if (employer.contact_person_email) {
      const emailResult = await sendTemplateEmail({
        to: String(employer.contact_person_email),
        templateCode: 'audit.assigned.employer',
        data: { ...templateData, contact_person_name: employer.contact_person_name ?? 'Sir/Madam' },
        entityType: 'audit_assignment',
        entityId: assignmentId,
        sentBy: actor.user.id,
      });
      if (!emailResult.ok) warnings.push(`Employer email could not be sent: ${emailResult.error ?? 'unknown error'}`);
    }
  }

  // Administrators get a copy so nothing is assigned silently.
  for (const adminUserId of await usersWithRole('admin')) {
    await notifyUser({
      userId: adminUserId,
      title: 'Audit assigned',
      message: `${parsed.audit_title} (${assignmentNumber}) was assigned to ${details?.auditor_name ?? 'an auditor'} by ${actor.user.fullName}.`,
      type: 'info',
      category: 'AUDIT',
      actionUrl: `/admin/audit-assignments/${assignmentId}`,
      actionLabel: 'View Assignment',
      entityType: 'audit_assignment',
      entityId: assignmentId,
      channels: ['in_app'],
    });
  }

  await writeAuditTrail({
    tableName: 'audit_assignments',
    recordId: assignmentId,
    operation: 'INSERT',
    changes: Object.fromEntries(Object.entries(data).map(([field, value]) => [field, { from: null, to: value ?? null }])),
    changedBy: actor.user.id,
    changedByName: actor.user.fullName,
    ipAddress: actor.ip ?? null,
  });

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: parsed.employer_id, action: 'created', module: 'audit_assignment',
    entityType: 'audit_assignment', entityId: assignmentId,
    entityLabel: `${assignmentNumber} — ${parsed.audit_title}`,
    description: `Assignment ${assignmentNumber} created for ${employer.company_name} and assigned to ${auditor.name}`,
    newValues: { ...data, calendar_event_id: calendarEventId },
    ipAddress: actor.ip ?? null, userAgent: actor.userAgent ?? null,
  });

  return {
    assignmentId,
    assignmentNumber,
    warnings,
    calendarEventId,
    capacity: { auditorName: String(auditor.name), open, max },
  };
}

/** In-app + email + SMS + WhatsApp to the auditor, mirroring the spec's flow. */
async function notifyAuditor(
  details: Record<string, unknown> | null,
  templateData: Record<string, unknown>,
  assignmentNumber: string
): Promise<{ errors: string[] }> {
  const errors: string[] = [];
  if (!details) return { errors };

  const auditorUserId = await queryOne<{ user_id: number | null } & RowDataPacket>(
    'SELECT user_id FROM auditors WHERE id = ? LIMIT 1',
    [Number(details.auditor_id)]
  );
  const userId = auditorUserId?.user_id ? Number(auditorUserId.user_id) : null;

  if (userId) {
    const result = await notifyUser({
      userId,
      title: 'New audit assigned',
      message: `${details.audit_title} (${assignmentNumber}) for ${details.employer_name} is due ${formatDate(details.due_date as string)}.`,
      type: 'action_required',
      priority: String(details.priority).toLowerCase() === 'urgent' ? 'urgent' : 'high',
      category: 'AUDIT',
      actionUrl: `/auditor/audits/${Number(details.id)}`,
      actionLabel: 'Open Assignment',
      entityType: 'audit_assignment',
      entityId: Number(details.id),
      channels: ['in_app', 'email', 'sms', 'whatsapp'],
      templateCode: 'audit.assigned.auditor',
      templateData,
    });
    errors.push(...result.errors);
  } else if (details.auditor_email) {
    // Auditors without a portal login still need the brief.
    const emailResult = await sendTemplateEmail({
      to: String(details.auditor_email),
      templateCode: 'audit.assigned.auditor',
      data: templateData,
      entityType: 'audit_assignment',
      entityId: Number(details.id),
    });
    if (!emailResult.ok) errors.push(`Auditor email could not be sent: ${emailResult.error ?? 'unknown error'}`);
  }

  return { errors };
}

function buildTemplateData(details: Record<string, unknown> | null, assignmentNumber: string): Record<string, unknown> {
  if (!details) return { assignment_number: assignmentNumber, assignment_url: `${APP_URL}/auditor/dashboard` };
  return {
    assignment_number: assignmentNumber,
    audit_title: details.audit_title,
    employer_name: details.employer_name,
    unit_name: details.unit_name ?? 'All units',
    module_name: details.module_name ?? 'Standard audit',
    auditor_name: details.auditor_name,
    auditor_mobile: details.auditor_mobile ?? '—',
    start_date: formatDate(details.start_date as string),
    end_date: formatDate(details.end_date as string),
    due_date: formatDate(details.due_date as string),
    priority: details.priority,
    instructions: details.instructions ?? 'No specific instructions were recorded.',
    scope: details.scope ?? 'Full compliance scope as per the applicable acts.',
    assignment_url: `${APP_URL}/auditor/audits/${Number(details.id)}`,
  };
}

/** Schedule rows for the shared calendar. */
async function createCalendarEvents(input: {
  assignmentId: number;
  assignmentNumber: string;
  title: string;
  employerId: number;
  unitId: number | null;
  auditorId: number;
  startDate: string | null;
  endDate: string | null;
  dueDate: string | null;
  endMeetingAt: string | null;
  priority: string;
  reminderMinutes: number;
  scope: string | null;
  createdBy: number;
}): Promise<number> {
  const start = input.startDate ?? input.dueDate ?? new Date().toISOString().slice(0, 10);
  const end = input.endDate ?? start;

  const eventId = await withTransaction((tx) =>
    tx.insert(
      `INSERT INTO calendar_events (uuid, title, description, event_type, employer_id, unit_id, assignment_id,
                                    auditor_id, created_by, start_datetime, end_datetime, all_day, priority,
                                    status, visibility, reminder_minutes)
       VALUES (?, ?, ?, 'AUDIT', ?, ?, ?, ?, ?, ?, ?, 1, ?, 'scheduled', 'participants', ?)`,
      [
        randomUUID(), input.title, input.scope, input.employerId, input.unitId, input.assignmentId,
        input.auditorId, input.createdBy, `${start} 09:00:00`, `${end} 18:00:00`, input.priority,
        input.reminderMinutes,
      ]
    )
  );

  // The closing meeting is a separate calendar row so it can be moved on its own.
  if (input.endMeetingAt) {
    await insert(
      `INSERT INTO calendar_events (uuid, title, description, event_type, employer_id, unit_id, assignment_id,
                                    auditor_id, created_by, start_datetime, end_datetime, all_day, priority,
                                    status, visibility, reminder_minutes, parent_event_id)
       VALUES (?, ?, ?, 'AUDIT_END_MEETING', ?, ?, ?, ?, ?, ?, ?, 0, ?, 'scheduled', 'participants', ?, ?)`,
      [
        randomUUID(), `Closing meeting — ${input.title}`,
        `Audit closing meeting for ${input.assignmentNumber}`,
        input.employerId, input.unitId, input.assignmentId, input.auditorId, input.createdBy,
        input.endMeetingAt, input.endMeetingAt, input.priority, input.reminderMinutes, eventId,
      ]
    );
  }

  return eventId;
}

export async function updateAssignment(assignmentId: number, input: unknown, actor: ActorContext) {
  const existing = await repo.findAssignmentById(assignmentId);
  if (!existing) return null;

  const parsed = assignmentUpdateSchema.parse(input);
  const {
    notify_auditor, notify_verifier, notify_employer, create_calendar_event, reminder_minutes,
    ...scalarInput
  } = parsed;
  void notify_auditor; void notify_verifier; void notify_employer;
  void create_calendar_event; void reminder_minutes;

  const data = Object.fromEntries(Object.entries(scalarInput).filter(([, value]) => value !== undefined));
  if (!Object.keys(data).length) return { updated: 0, assignment: existing };

  // A completed audit must carry its completion timestamp, and vice versa.
  if (data.status === 'Approved' && !existing.completed_at) {
    // Stored as a MySQL DATETIME string so the shape stays uniform with the rest.
    data.completed_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
    data.progress_percent = 100;
  }
  if (typeof data.status === 'string' && data.status !== existing.status && data.status !== 'Approved') {
    data.completed_at = null;
  }

  const record = await applyColumnDefaults('audit_assignments', data);
  const updated = await repo.updateAssignment(assignmentId, record, actor.user.id);

  if (updated) {
    await writeAuditTrail({
      tableName: 'audit_assignments',
      recordId: assignmentId,
      operation: 'UPDATE',
      changes: Object.fromEntries(
        Object.keys(record).map((field) => [
          field,
          { from: (existing as unknown as Record<string, unknown>)[field] ?? null, to: record[field] ?? null },
        ])
      ),
      changedBy: actor.user.id,
      changedByName: actor.user.fullName,
      ipAddress: actor.ip ?? null,
    });

    await writeActivityLog({
      userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
      employerId: Number(existing.employer_id), action: 'updated', module: 'audit_assignment',
      entityType: 'audit_assignment', entityId: assignmentId,
      entityLabel: `${existing.assignment_number} — ${existing.audit_title}`,
      description: `Assignment ${existing.assignment_number} updated (${Object.keys(record).join(', ')})`,
      newValues: record, ipAddress: actor.ip ?? null, userAgent: actor.userAgent ?? null,
    });

    // Keep the calendar row in step with the schedule.
    if (data.start_date || data.end_date || data.due_date || data.status === 'Cancelled') {
      await syncCalendarEvent(assignmentId, {
        startDate: (data.start_date ?? existing.start_date) as string | null,
        endDate: (data.end_date ?? existing.end_date) as string | null,
        dueDate: (data.due_date ?? existing.due_date) as string | null,
        status: data.status === 'Cancelled' ? 'cancelled' : undefined,
      });
    }
  }

  return { updated, assignment: await repo.findAssignmentById(assignmentId) };
}

async function syncCalendarEvent(
  assignmentId: number,
  input: { startDate: string | null; endDate: string | null; dueDate: string | null; status?: string }
): Promise<void> {
  const start = input.startDate ?? input.dueDate;
  if (!start) return;
  const end = input.endDate ?? start;

  await execute(
    `UPDATE calendar_events
        SET start_datetime = ?, end_datetime = ?${input.status ? ', status = ?' : ''}
      WHERE assignment_id = ? AND parent_event_id IS NULL AND deleted_at IS NULL`,
    input.status
      ? [`${start} 09:00:00`, `${end} 18:00:00`, input.status, assignmentId]
      : [`${start} 09:00:00`, `${end} 18:00:00`, assignmentId]
  );
}

/** Reassigns the audit (and optionally the verifier), notifying both sides. */
export async function reassignAssignment(assignmentId: number, input: unknown, actor: ActorContext) {
  const existing = await repo.findAssignmentById(assignmentId);
  if (!existing) return null;

  const parsed = assignmentReassignSchema.parse(input);
  if (parsed.auditor_id === Number(existing.auditor_id)) {
    throw Object.assign(new Error('The assignment is already with this auditor'), { code: 'NO_CHANGE' });
  }

  const auditor = await repo.auditorWorkload(parsed.auditor_id);
  if (!auditor) {
    throw Object.assign(new Error('The selected auditor does not exist or was archived'), { code: 'INVALID_REFERENCE' });
  }

  const warnings: string[] = [];
  if (Number(auditor.open_assignments ?? 0) >= Number(auditor.max_concurrent_audits ?? 5)) {
    warnings.push(`${auditor.name} is at capacity (${auditor.open_assignments}/${auditor.max_concurrent_audits}).`);
  }

  const updated = await repo.updateAssignment(
    assignmentId,
    {
      auditor_id: parsed.auditor_id,
      verifier_id: parsed.verifier_id ?? existing.verifier_id ?? null,
      ...(existing.status === 'Not Started' ? {} : { status: existing.status }),
    },
    actor.user.id
  );

  // The calendar row follows the auditor so their own calendar stays accurate.
  await execute('UPDATE calendar_events SET auditor_id = ? WHERE assignment_id = ? AND deleted_at IS NULL', [
    parsed.auditor_id, assignmentId,
  ]);

  const details = await repo.findAssignmentById(assignmentId);
  const newAuditorUserId = await queryOne<{ user_id: number | null } & RowDataPacket>(
    'SELECT user_id FROM auditors WHERE id = ? LIMIT 1',
    [parsed.auditor_id]
  );

  if (parsed.notify) {
    if (newAuditorUserId?.user_id) {
      const result = await notifyUser({
        userId: Number(newAuditorUserId.user_id),
        title: 'Audit reassigned to you',
        message: `${existing.audit_title} (${existing.assignment_number}) has been reassigned to you by ${actor.user.fullName}. Reason: ${parsed.reason}`,
        type: 'action_required',
        category: 'AUDIT',
        actionUrl: `/auditor/audits/${assignmentId}`,
        actionLabel: 'Open Assignment',
        entityType: 'audit_assignment',
        entityId: assignmentId,
        channels: ['in_app', 'email'],
      });
      warnings.push(...result.errors);
    }

    const previousAuditorUserId = await queryOne<{ user_id: number | null } & RowDataPacket>(
      'SELECT user_id FROM auditors WHERE id = ? LIMIT 1',
      [Number(existing.auditor_id)]
    );
    if (previousAuditorUserId?.user_id && Number(previousAuditorUserId.user_id) !== Number(newAuditorUserId?.user_id)) {
      await notifyUser({
        userId: Number(previousAuditorUserId.user_id),
        title: 'Audit reassigned away from you',
        message: `${existing.audit_title} (${existing.assignment_number}) is no longer in your queue. Reason: ${parsed.reason}`,
        type: 'info',
        category: 'AUDIT',
        actionUrl: '/auditor/dashboard',
        actionLabel: 'View Assignments',
        entityType: 'audit_assignment',
        entityId: assignmentId,
        channels: ['in_app'],
      });
    }
  }

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(existing.employer_id), action: 'updated', module: 'audit_assignment',
    entityType: 'audit_assignment', entityId: assignmentId,
    entityLabel: `${existing.assignment_number} — ${existing.audit_title}`,
    description: `Assignment ${existing.assignment_number} reassigned from ${existing.auditor_name} to ${auditor.name}`,
    oldValues: { auditor_id: existing.auditor_id, auditor_name: existing.auditor_name },
    newValues: { auditor_id: parsed.auditor_id, auditor_name: auditor.name, reason: parsed.reason },
    ipAddress: actor.ip ?? null,
  });

  return { updated, assignment: details, warnings, capacity: { auditorName: String(auditor.name), open: Number(auditor.open_assignments ?? 0), max: Number(auditor.max_concurrent_audits ?? 5) } };
}

/** Cancels an assignment: status, calendar, notification and audit trail. */
export async function cancelAssignment(assignmentId: number, input: unknown, actor: ActorContext) {
  const existing = await repo.findAssignmentById(assignmentId);
  if (!existing) return null;

  const parsed = assignmentCancelSchema.parse(input);
  if (existing.status === 'Approved') {
    throw Object.assign(new Error('An approved audit cannot be cancelled'), { code: 'INVALID_STATE' });
  }

  await repo.updateAssignment(
    assignmentId,
    { status: 'Cancelled', progress_percent: 0, completed_at: null },
    actor.user.id
  );
  await execute(
    "UPDATE calendar_events SET status = 'cancelled' WHERE assignment_id = ? AND deleted_at IS NULL",
    [assignmentId]
  );

  const auditorUser = await queryOne<{ user_id: number | null } & RowDataPacket>(
    'SELECT user_id FROM auditors WHERE id = ? LIMIT 1',
    [Number(existing.auditor_id)]
  );
  if (auditorUser?.user_id) {
    await notifyUser({
      userId: Number(auditorUser.user_id),
      title: 'Audit cancelled',
      message: `${existing.audit_title} (${existing.assignment_number}) has been cancelled. Reason: ${parsed.reason}`,
      type: 'warning',
      category: 'AUDIT',
      actionUrl: '/auditor/dashboard',
      actionLabel: 'View Assignments',
      entityType: 'audit_assignment',
      entityId: assignmentId,
      channels: ['in_app', 'email'],
    });
  }

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(existing.employer_id), action: 'updated', module: 'audit_assignment',
    entityType: 'audit_assignment', entityId: assignmentId,
    entityLabel: `${existing.assignment_number} — ${existing.audit_title}`,
    description: `Assignment ${existing.assignment_number} cancelled — ${parsed.reason}`,
    oldValues: { status: existing.status }, newValues: { status: 'Cancelled', reason: parsed.reason },
    ipAddress: actor.ip ?? null,
  });

  return { cancelled: true, assignment: await repo.findAssignmentById(assignmentId) };
}

/**
 * Deletes an assignment. Anything that already produced a report is archived
 * rather than removed so the audit trail stays intact.
 */
export async function deleteAssignment(assignmentId: number, actor: ActorContext) {
  const existing = await repo.findAssignmentById(assignmentId);
  if (!existing) return null;

  const reports = await queryOne<{ total: number } & RowDataPacket>(
    'SELECT COUNT(*) AS total FROM audit_reports WHERE assignment_id = ? AND deleted_at IS NULL',
    [assignmentId]
  );
  if (Number(reports?.total ?? 0) > 0) {
    return {
      deleted: false,
      reason: 'A report has already been filed against this assignment - cancel it instead of deleting so the audit trail survives',
    };
  }

  await withTransaction(async (tx) => {
    await tx.execute('UPDATE audit_assignments SET deleted_at = NOW(), status = ?, updated_by = ? WHERE id = ?', [
      'Cancelled', actor.user.id, assignmentId,
    ]);
    await tx.execute('UPDATE calendar_events SET deleted_at = NOW() WHERE assignment_id = ? AND deleted_at IS NULL', [assignmentId]);
  });

  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: Number(existing.employer_id), action: 'deleted', module: 'audit_assignment',
    entityType: 'audit_assignment', entityId: assignmentId,
    entityLabel: `${existing.assignment_number} — ${existing.audit_title}`,
    description: `Assignment ${existing.assignment_number} deleted`,
    oldValues: { status: existing.status, auditor_id: existing.auditor_id },
    ipAddress: actor.ip ?? null,
  });

  return { deleted: true };
}

/**
 * Bulk assignment for a set of employers — the "assign this audit to these five
 * units" flow administrators ask for at the start of an audit cycle.
 */
export async function createBulkAssignments(
  input: { template: Record<string, unknown>; targets: { employer_id: number; unit_id?: number | null; department_id?: number | null }[] },
  actor: ActorContext
): Promise<{ created: { employerId: number; assignmentId: number; assignmentNumber: string }[]; warnings: string[] }> {
  if (!input.targets?.length) {
    throw Object.assign(new Error('Select at least one employer or unit to assign'), { code: 'NO_TARGETS' });
  }

  const created: { employerId: number; assignmentId: number; assignmentNumber: string }[] = [];
  const warnings: string[] = [];

  for (const target of input.targets) {
    const result = await createAssignment(
      { ...input.template, employer_id: target.employer_id, unit_id: target.unit_id ?? null, department_id: target.department_id ?? null },
      actor
    );
    created.push({ employerId: target.employer_id, assignmentId: result.assignmentId, assignmentNumber: result.assignmentNumber });
    warnings.push(...result.warnings);
  }

  return { created, warnings };
}
