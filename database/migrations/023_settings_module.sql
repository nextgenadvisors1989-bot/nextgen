-- 023 — Settings module support.
--
-- Three things the administration screens need:
--
--  1. The Administrator role can read and update settings but could not export
--     or clear an integration secret it had set. Grant the export action so the
--     register of settings can be downloaded like every other register.
--
--  2. `scheduled_jobs` shipped empty. The Settings → Jobs panel runs the reminder
--     jobs on demand, so the four jobs the platform actually has are seeded here:
--     the two reminder dispatchers, the activity-log retention cleanup and the
--     daily database backup. They are idempotent by `job_code`.
--
--  3. Delivery logs are filtered by status and template inside a date window;
--     composite indexes keep those screens fast as the logs grow.

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r
  JOIN permissions p ON p.name IN ('settings.export', 'settings.create')
 WHERE r.slug IN ('super_admin', 'admin');

INSERT INTO scheduled_jobs (job_code, job_name, description, cron_expression, job_type, is_active, next_run_at)
VALUES
  ('compliance_expiry_reminders', 'Compliance expiry reminders',
   'Emails and notifies the owners of licences, registrations and returns that fall due within 90/60/30/15/7/1 days.',
   '0 8 * * *', 'REMINDER', TRUE, NULL),
  ('audit_due_reminders', 'Audit due reminders',
   'Reminds auditors, verifiers and employers 7, 3 and 1 day before an audit is due, and flags overdue audits.',
   '0 8 * * *', 'REMINDER', TRUE, NULL),
  ('activity_log_retention', 'Activity log retention',
   'Prunes activity and audit-trail rows older than the configured retention window (7 years by default).',
   '0 2 * * 0', 'CLEANUP', TRUE, NULL),
  ('database_backup', 'Database backup',
   'Writes a full mysqldump into the configured backup directory and prunes dumps past retention.',
   '0 1 * * *', 'BACKUP', TRUE, NULL)
ON DUPLICATE KEY UPDATE job_name = VALUES(job_name), description = VALUES(description),
                        cron_expression = VALUES(cron_expression), job_type = VALUES(job_type);

CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON email_logs (template_code, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON sms_logs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_sms_logs_template ON sms_logs (template_code, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_status ON whatsapp_logs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_template ON whatsapp_logs (template_code, created_at);
CREATE INDEX IF NOT EXISTS idx_backup_history_started ON backup_history (status, started_at);
CREATE INDEX IF NOT EXISTS idx_settings_group_order ON settings (setting_group, sort_order);
