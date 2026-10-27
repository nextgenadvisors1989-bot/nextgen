-- 025 — Calendar & holiday master support.
--
-- The `calendar_events` and `holidays` tables shipped with migration 016 and the
-- audit-assignment module already writes audit dates and closing meetings into
-- `calendar_events`. What was missing to make the calendar a real module:
--
--   * a reminder type for event reminders, so the calendar's own job dispatches
--     through the same idempotent `reminder_dispatches` ledger as everything else;
--   * the job row the cron and the job register read;
--   * the composite indexes the unified calendar reads every time it opens —
--     a month window per employer/auditor, and holidays per date and employer.
--
-- The `holiday.*` permission family and the calendar delete/update grants are
-- **not** written here: permissions and role grants in this platform are
-- generated from `lib/auth/rbac.ts` by `scripts/run-seeds.ts`, so declaring them
-- in code is what keeps the matrix from drifting from the checks that enforce it.

-- Event reminders get their own reminder type rather than borrowing 'OTHER'.
ALTER TABLE reminder_dispatches
  MODIFY COLUMN reminder_type ENUM('COMPLIANCE_EXPIRY','AUDIT_DUE','PAYROLL_PENDING',
                                   'LEAVE_PENDING','DOCUMENT_EXPIRY','EVENT_REMINDER','OTHER') NOT NULL;

-- The calendar's own reminder job, ticked every fifteen minutes.
INSERT INTO scheduled_jobs (job_code, job_name, description, cron_expression, job_type, is_active, next_run_at)
VALUES
  ('calendar_event_reminders', 'Calendar event reminders',
   'Reminds attendees ahead of calendar events whose reminder window has opened — audit dates, closing meetings, inspections and everything else on the unified calendar. Each dispatch is claimed once, so a re-run never sends twice.',
   '*/15 * * * *', 'REMINDER', TRUE, NULL)
ON DUPLICATE KEY UPDATE job_name = VALUES(job_name), description = VALUES(description),
                        cron_expression = VALUES(cron_expression), job_type = VALUES(job_type);

CREATE INDEX IF NOT EXISTS idx_ce_window ON calendar_events (status, start_datetime);
CREATE INDEX IF NOT EXISTS idx_ce_employer_window ON calendar_events (employer_id, start_datetime);
CREATE INDEX IF NOT EXISTS idx_ce_auditor_window ON calendar_events (auditor_id, start_datetime);
CREATE INDEX IF NOT EXISTS idx_holidays_scope ON holidays (holiday_date, employer_id);
