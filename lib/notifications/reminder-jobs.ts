/**
 * Scheduled reminder jobs. Idempotent by design: each dispatch is recorded in
 * reminder_dispatches with a unique key, so re-running the cron never spams users.
 */
import { syncExpiryStatuses } from '@/repositories/compliance.repository';
import { execute, query, type RowDataPacket, insert } from '@/lib/db/mysql';
import { dueEventReminders, eventAudience, markEventReminded } from '@/repositories/calendar.repository';
import { EVENT_TYPE_LABELS } from '@/lib/validations/calendar.validation';
import { notifyUser, usersWithRole } from './notification-service';
import { AUDIT_REMINDER_DAYS, COMPLIANCE_REMINDER_DAYS, APP_URL } from '@/lib/utils/constants';

export interface ReminderRunSummary {
  job: string;
  candidates: number;
  dispatched: number;
  skipped: number;
  errors: string[];
}

/** Claims a reminder slot; returns false when it was already sent. */
async function claimDispatch(
  reminderKey: string,
  reminderType: 'COMPLIANCE_EXPIRY' | 'AUDIT_DUE' | 'PAYROLL_PENDING' | 'LEAVE_PENDING' | 'DOCUMENT_EXPIRY'
    | 'EVENT_REMINDER' | 'OTHER',
  channel: 'in_app' | 'email' | 'sms' | 'whatsapp',
  entityType: string | null,
  entityId: number | null,
  recipient: string | null
): Promise<boolean> {
  try {
    await insert(
      `INSERT INTO reminder_dispatches (reminder_key, reminder_type, entity_type, entity_id, channel, recipient)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [reminderKey, reminderType, entityType, entityId, channel, recipient]
    );
    return true;
  } catch {
    return false; // duplicate key => already dispatched
  }
}

/** Compliance documents approaching expiry (90/60/30/15/7/1 days). */
export async function runComplianceExpiryReminders(): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = { job: 'compliance-expiry', candidates: 0, dispatched: 0, skipped: 0, errors: [] };
  const thresholds = COMPLIANCE_REMINDER_DAYS.join(',');

  // Bring the stored status in line with the dates before looking for
  // candidates, so a document that lapsed overnight reads as Expired on every
  // screen the moment the job runs — not only on the days it is a candidate.
  try {
    const resynced = await syncExpiryStatuses();
    if (resynced) console.log(`[reminders] compliance statuses resynced: ${resynced}`);
  } catch (error) {
    summary.errors.push(`status resync: ${(error as Error).message}`);
  }

  const documents = await query<RowDataPacket>(
    `SELECT cd.id, cd.uuid, cd.document_name, cd.document_type, cd.document_number, cd.issuing_authority,
            cd.expiry_date, cd.remind_days_before, cd.renewal_responsibility,
            DATEDIFF(cd.expiry_date, CURDATE()) AS days_remaining,
            e.company_name, e.id AS employer_id,
            COALESCE(e.compliance_contact_email, e.email) AS employer_email,
            COALESCE(e.compliance_contact_person, e.contact_person_name) AS contact_person
       FROM compliance_documents cd
       JOIN employers e ON e.id = cd.employer_id
      WHERE cd.deleted_at IS NULL
        AND cd.expiry_date IS NOT NULL
        AND cd.compliance_status NOT IN ('Not Applicable')
        AND DATEDIFF(cd.expiry_date, CURDATE()) BETWEEN 0 AND 90
        AND DATEDIFF(cd.expiry_date, CURDATE()) IN (${thresholds})`,
    []
  );
  summary.candidates = documents.length;

  for (const doc of documents) {
    const daysRemaining = Number(doc.days_remaining);
    const key = `compliance:${doc.id}:${daysRemaining}`;

    // Employer portal users for this company
    const employerUsers = await query<{ user_id: number }>(
      `SELECT user_id FROM employer_users WHERE employer_id = ?`,
      [doc.employer_id]
    );
    const recipients = [
      ...employerUsers.map((r) => r.user_id),
      ...new Set([...(await usersWithRole('admin')), ...(await usersWithRole('super_admin'))]),
    ];

    const claimed = await claimDispatch(key, 'COMPLIANCE_EXPIRY', 'email', 'compliance_document', doc.id, doc.employer_email);
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    try {
      await execute(
        `UPDATE compliance_documents
            SET compliance_status = IF(DATEDIFF(expiry_date, CURDATE()) < 0, 'Expired', 'Expiring Soon'),
                reminder_sent_at = NOW()
          WHERE id = ?`,
        [doc.id]
      );

      for (const userId of [...new Set(recipients)]) {
        await notifyUser({
          userId,
          title: `Compliance document expiring in ${daysRemaining} day(s): ${doc.document_name}`,
          message: `${doc.document_name} (${doc.document_type}) for ${doc.company_name} expires on ${doc.expiry_date}.`,
          type: daysRemaining <= 15 ? 'warning' : 'info',
          category: 'COMPLIANCE',
          priority: daysRemaining <= 15 ? 'high' : 'normal',
          actionUrl: `/admin/compliance/documents/${doc.id}`,
          actionLabel: 'View Document',
          entityType: 'compliance_document',
          entityId: doc.id,
          channels: ['in_app', 'email', 'whatsapp'],
          templateCode: 'compliance.document_expiring',
          templateData: {
            employer_name: doc.company_name,
            document_name: doc.document_name,
            document_type: doc.document_type,
            document_number: doc.document_number ?? '—',
            issuing_authority: doc.issuing_authority ?? '—',
            expiry_date: doc.expiry_date,
            days_remaining: daysRemaining,
            renewal_responsibility: doc.renewal_responsibility ?? 'Compliance Officer',
            document_url: `${APP_URL}/admin/compliance/documents/${doc.id}`,
          },
        });
      }
      summary.dispatched += 1;
    } catch (error) {
      summary.errors.push(`document ${doc.id}: ${(error as Error).message}`);
    }
  }
  return summary;
}

/** Audits approaching their due date (7/3/1 days) plus overdue escalation. */
export async function runAuditDueReminders(): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = { job: 'audit-due', candidates: 0, dispatched: 0, skipped: 0, errors: [] };

  const assignments = await query<RowDataPacket>(
    `SELECT aa.id, aa.assignment_number, aa.audit_title, aa.due_date, aa.status, aa.priority,
            aa.progress_percent, DATEDIFF(aa.due_date, CURDATE()) AS days_remaining,
            e.company_name, a.name AS auditor_name, a.email AS auditor_email, a.mobile AS auditor_mobile,
            a.user_id AS auditor_user_id
       FROM audit_assignments aa
       JOIN employers e ON e.id = aa.employer_id
       JOIN auditors a ON a.id = aa.auditor_id
      WHERE aa.deleted_at IS NULL
        AND aa.due_date IS NOT NULL
        AND aa.status NOT IN ('Approved','Cancelled')
        AND DATEDIFF(aa.due_date, CURDATE()) IN (${AUDIT_REMINDER_DAYS.join(',')}, -1, -3, -7)`,
    []
  );
  summary.candidates = assignments.length;

  for (const assignment of assignments) {
    const daysRemaining = Number(assignment.days_remaining);
    const key = `audit:${assignment.id}:${daysRemaining}`;
    const claimed = await claimDispatch(key, 'AUDIT_DUE', 'email', 'audit_assignment', assignment.id, assignment.auditor_email);
    if (!claimed) {
      summary.skipped += 1;
      continue;
    }

    try {
      // Escalate overdue audits in the status column so dashboards reflect reality.
      if (daysRemaining < 0 && !['Submitted', 'Under Review', 'Approved'].includes(String(assignment.status))) {
        await execute(`UPDATE audit_assignments SET status = 'Overdue' WHERE id = ? AND status NOT IN ('Approved','Cancelled')`, [assignment.id]);
      }

      const recipients = [
        ...(assignment.auditor_user_id ? [Number(assignment.auditor_user_id)] : []),
        ...new Set([...(await usersWithRole('admin')), ...(await usersWithRole('super_admin'))]),
      ];

      for (const userId of [...new Set(recipients)]) {
        await notifyUser({
          userId,
          title: daysRemaining < 0
            ? `Overdue audit: ${assignment.audit_title}`
            : `Audit due in ${daysRemaining} day(s): ${assignment.audit_title}`,
          message: `${assignment.assignment_number} for ${assignment.company_name} is due on ${assignment.due_date}.`,
          type: daysRemaining < 0 ? 'error' : 'warning',
          category: 'AUDIT',
          priority: daysRemaining <= 1 ? 'urgent' : 'high',
          actionUrl: `/auditor/audits/${assignment.id}`,
          actionLabel: 'Open Audit',
          entityType: 'audit_assignment',
          entityId: assignment.id,
          channels: ['in_app', 'email', 'sms'],
          templateCode: 'audit.due_reminder',
          templateData: {
            assignment_number: assignment.assignment_number,
            audit_title: assignment.audit_title,
            employer_name: assignment.company_name,
            due_date: assignment.due_date,
            days_remaining: Math.max(daysRemaining, 0),
            status: assignment.status,
            progress_percent: assignment.progress_percent,
            assignment_url: `${APP_URL}/auditor/audits/${assignment.id}`,
          },
        });
      }
      summary.dispatched += 1;
    } catch (error) {
      summary.errors.push(`assignment ${assignment.id}: ${(error as Error).message}`);
    }
  }
  return summary;
}

/**
 * Calendar events whose reminder window has opened.
 *
 * Every event carries its own lead time (`reminder_minutes`), so the candidate
 * list is computed in SQL rather than from a fixed ladder. The dispatch ledger
 * keys on the event and the recipient, which makes a repeated run — the job can
 * tick every fifteen minutes — send exactly one reminder per person per event.
 */
export async function runCalendarEventReminders(): Promise<ReminderRunSummary> {
  const summary: ReminderRunSummary = { job: 'calendar-event-reminders', candidates: 0, dispatched: 0, skipped: 0, errors: [] };
  const candidates = await dueEventReminders();
  summary.candidates = candidates.length;

  for (const event of candidates) {
    try {
      const audience = await eventAudience(Number(event.id));
      if (!audience.length) {
        summary.skipped += 1;
        continue;
      }

      const when = String(event.start_datetime);
      const where = event.location ? ` at ${String(event.location)}` : '';
      const label = EVENT_TYPE_LABELS[String(event.event_type)] ?? 'Event';

      for (const user of audience) {
        const key = `event:${event.id}:user:${user.id}:${String(event.reminder_minutes)}`;
        const claimed = await claimDispatch(key, 'EVENT_REMINDER', 'in_app', 'calendar_event', Number(event.id), String(user.email ?? ''));
        if (!claimed) {
          summary.skipped += 1;
          continue;
        }
        await notifyUser({
          userId: Number(user.id),
          title: `${label} reminder: ${String(event.title)}`,
          message: `${String(event.title)} starts on ${when}${where}${
            event.company_name ? ` (${String(event.company_name)})` : ''
          }.`,
          type: 'action_required',
          category: 'REMINDER',
          priority: String(event.priority) === 'Urgent' ? 'urgent' : 'high',
          entityType: 'calendar_event',
          entityId: Number(event.id),
          actionUrl: '/admin/calendar',
          actionLabel: 'Open the calendar',
        });
        summary.dispatched += 1;
      }

      await markEventReminded(Number(event.id));
    } catch (error) {
      summary.errors.push(`event ${event.id}: ${(error as Error).message}`);
    }
  }

  return summary;
}

/**
 * The payroll month reminder: on the first of the month, every company whose
 * payroll for the month just ended has no run is nudged — its portal users and
 * the administrators. The dispatch key is the employer and the month, so the job
 * nudges once per company per month however often the cron ticks, and stops the
 * moment the run exists. The query itself lives in the payroll service, next to
 * the runs it is about.
 */
export async function runPayrollMonthReminders(): Promise<ReminderRunSummary> {
  const { runPayrollReminders } = await import('@/services/payroll.service');
  return runPayrollReminders(claimDispatch);
}

export interface AllRemindersSummary {
  ranAt: string;
  jobs: ReminderRunSummary[];
}

export async function runAllReminderJobs(): Promise<AllRemindersSummary> {
  const jobs = [
    await runComplianceExpiryReminders(),
    await runAuditDueReminders(),
    await runCalendarEventReminders(),
    await runPayrollMonthReminders(),
  ];
  const total = jobs.reduce((acc, job) => acc + job.dispatched, 0);
  console.log(`[reminders] ${total} reminder(s) dispatched across ${jobs.length} job(s)`);
  return { ranAt: new Date().toISOString(), jobs };
}
