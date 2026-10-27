-- 014_settings.sql — default system, company, email, SMS, WhatsApp and backup settings.
-- Secret values (SMTP password, API tokens) are stored encrypted by the admin UI and are
-- intentionally left empty here so nothing sensitive lives in version control.
SET NAMES utf8mb4;

INSERT INTO settings (setting_group, setting_key, setting_value, value_type, label, description, is_public, is_encrypted, sort_order) VALUES
  -- System
  ('system', 'app_name',                 'ComplianceOS',            'string',  'Application Name',        'Shown in the sidebar, emails and PDF headers', TRUE,  FALSE, 1),
  ('system', 'timezone',                 'Asia/Kolkata',            'string',  'Timezone',                'Used for all date and time rendering',          TRUE,  FALSE, 2),
  ('system', 'date_format',               'DD MMM YYYY',            'string',  'Date Format',              'Display format for dates across the platform',  TRUE,  FALSE, 3),
  ('system', 'currency',                  'INR',                    'string',  'Currency',                 'Currency code used in payroll and reports',     TRUE,  FALSE, 4),
  ('system', 'currency_symbol',           '₹',                      'string',  'Currency Symbol',          'Symbol rendered next to monetary values',       TRUE,  FALSE, 5),
  ('system', 'financial_year_start_month','4',                      'number',  'Financial Year Starts',    'Month number (4 = April, Indian FY)',           TRUE,  FALSE, 6),
  ('system', 'items_per_page',            '10',                     'number',  'Default Page Size',        'Rows per page for all list views',              TRUE,  FALSE, 7),
  ('system', 'maintenance_mode',          'false',                  'boolean', 'Maintenance Mode',         'Blocks non-admin sign-in when enabled',         FALSE, FALSE, 8),
  ('system', 'audit_retention_days',      '2555',                   'number',  'Audit Log Retention (days)','Activity log retention; default 7 years',      FALSE, FALSE, 9),

  -- Company
  ('company', 'company_name',        'ComplianceOS Technologies Private Limited', 'string', 'Legal Company Name', 'Appears on invoices, PDFs and emails', TRUE, FALSE, 1),
  ('company', 'company_address',     '4th Floor, Anna Salai, Chennai 600002, Tamil Nadu, India', 'string', 'Registered Address', NULL, TRUE, FALSE, 2),
  ('company', 'company_email',       'support@complianceos.example', 'string', 'Support Email',   NULL, TRUE, FALSE, 3),
  ('company', 'company_phone',       '+91 44 4000 0000',            'string', 'Support Phone',     NULL, TRUE, FALSE, 4),
  ('company', 'company_gstin',       '33AABCC1234D1Z5',             'string', 'GSTIN',             NULL, TRUE, FALSE, 5),
  ('company', 'company_pan',         'AABCC1234D',                  'string', 'Company PAN',       NULL, FALSE, FALSE, 6),
  ('company', 'company_cin',         'U72900TN2019PTC123456',       'string', 'CIN',               NULL, TRUE, FALSE, 7),
  ('company', 'logo_path',           '',                            'string', 'Logo Path',         'Uploaded platform logo used on PDFs', TRUE, FALSE, 8),

  -- Email
  ('email', 'enabled',        'true',                    'boolean', 'Email Enabled',   'Master switch for outbound email',        FALSE, FALSE, 1),
  ('email', 'smtp_host',      '',                        'string',  'SMTP Host',       'e.g. smtp.sendgrid.net or smtp.office365.com', FALSE, FALSE, 2),
  ('email', 'smtp_port',      '587',                     'number',  'SMTP Port',       '587 for TLS, 465 for SSL',                FALSE, FALSE, 3),
  ('email', 'smtp_secure',    'false',                   'boolean', 'Use SSL',         'Enable for port 465',                     FALSE, FALSE, 4),
  ('email', 'smtp_username',  '',                        'string',  'SMTP Username',   'Often "apikey" for SendGrid',             FALSE, FALSE, 5),
  ('email', 'smtp_password',  '',                        'string',  'SMTP Password',   'API key or app password',                 FALSE, TRUE,  6),
  ('email', 'from_email',     'noreply@complianceos.example', 'string', 'From Email', NULL,                                   FALSE, FALSE, 7),
  ('email', 'from_name',      'ComplianceOS',            'string',  'From Name',       NULL,                                      FALSE, FALSE, 8),
  ('email', 'reply_to',       'support@complianceos.example', 'string', 'Reply-To Email', NULL,                                 FALSE, FALSE, 9),

  -- SMS
  ('sms', 'enabled',            'true',    'boolean', 'SMS Enabled',        'Master switch for outbound SMS', FALSE, FALSE, 1),
  ('sms', 'provider',           'twilio',  'string',  'Provider',           'twilio or msg91',                FALSE, FALSE, 2),
  ('sms', 'sender_id',          'PLATFM',  'string',  'Sender ID',          '6-character alphanumeric sender ID', FALSE, FALSE, 3),
  ('sms', 'twilio_account_sid', '',        'string',  'Twilio Account SID', NULL,                             FALSE, FALSE, 4),
  ('sms', 'twilio_auth_token',  '',        'string',  'Twilio Auth Token',  NULL,                             FALSE, TRUE,  5),
  ('sms', 'msg91_auth_key',     '',        'string',  'MSG91 Auth Key',     NULL,                             FALSE, TRUE,  6),
  ('sms', 'msg91_sender_id',    'PLATFM',  'string',  'MSG91 Sender ID',    NULL,                             FALSE, FALSE, 7),

  -- WhatsApp
  ('whatsapp', 'enabled',          'true', 'boolean', 'WhatsApp Enabled',    'Master switch for WhatsApp messages', FALSE, FALSE, 1),
  ('whatsapp', 'provider',         'meta', 'string',  'Provider',            'meta or twilio',                      FALSE, FALSE, 2),
  ('whatsapp', 'phone_number_id',  '',     'string',  'Phone Number ID',     'Meta Cloud API phone number ID',       FALSE, FALSE, 3),
  ('whatsapp', 'access_token',     '',     'string',  'Access Token',        'Meta permanent access token',          FALSE, TRUE,  4),
  ('whatsapp', 'twilio_account_sid','',    'string',  'Twilio Account SID',  'Used when provider = twilio',          FALSE, FALSE, 5),
  ('whatsapp', 'twilio_auth_token','',     'string',  'Twilio Auth Token',   NULL,                                   FALSE, TRUE,  6),
  ('whatsapp', 'twilio_from',      '',     'string',  'Twilio WhatsApp From','e.g. +14155238886',                   FALSE, FALSE, 7),

  -- Backup
  ('backup', 'enabled',            'true',  'boolean', 'Scheduled Backup Enabled', NULL, FALSE, FALSE, 1),
  ('backup', 'frequency',          'daily', 'string',  'Backup Frequency',         'daily, weekly or monthly', FALSE, FALSE, 2),
  ('backup', 'retention_days',     '30',    'number',  'Retention (days)',         'Backups older than this are purged', FALSE, FALSE, 3),
  ('backup', 'storage_path',       './storage/backups', 'string', 'Backup Directory', 'Absolute or relative path', FALSE, FALSE, 4),
  ('backup', 'include_uploads',    'true',  'boolean', 'Include Uploaded Files',   NULL, FALSE, FALSE, 5),
  ('backup', 'notification_emails','',     'string',  'Notify On Completion',     'Comma-separated email addresses', FALSE, FALSE, 6),

  -- Audit defaults
  ('audit', 'default_tat_days',        '30', 'number',  'Default Audit TAT (days)', NULL,                                  TRUE,  FALSE, 1),
  ('audit', 'reminder_days_before',    '7,3,1', 'string','Reminder Days Before Due','Comma-separated day offsets',        TRUE,  FALSE, 2),
  ('audit', 'compliance_reminder_days','90,60,30,15,7,1', 'string', 'Compliance Reminder Days', NULL,                  TRUE,  FALSE, 3),
  ('audit', 'require_verification',    'true','boolean','Require Verification',     'Reports must be verified before release', TRUE, FALSE, 4),
  ('audit', 'auto_overdue',            'true','boolean','Auto-Mark Overdue',        'Mark assignments overdue past due date',  TRUE, FALSE, 5)

ON DUPLICATE KEY UPDATE label = VALUES(label), description = VALUES(description), setting_group = VALUES(setting_group);
