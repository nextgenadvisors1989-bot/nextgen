/**
 * The settings catalogue.
 *
 * Every setting the platform stores lives in one row of `settings`, grouped by
 * `setting_group`. This file is the single description of that data: which
 * groups exist, the type of each value, the choices a select offers, whether the
 * value is a secret (encrypted at rest, masked on read), and how to render the
 * field. The validation layer, the API, the admin screens and the integration
 * providers all read from here, so a key can never exist in one place and be
 * missing in another.
 */

export const SETTING_GROUPS = ['system', 'company', 'email', 'sms', 'whatsapp', 'backup', 'audit'] as const;
export type SettingGroup = (typeof SETTING_GROUPS)[number];

export type SettingFieldType = 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'password' | 'email' | 'url';

export interface SettingDefinition {
  key: string;
  label: string;
  type: SettingFieldType;
  /** Values the seeded row ships with — used as a fallback, never as a default to write. */
  fallback: string;
  description?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  /** Secrets are stored with `is_encrypted = 1` and returned masked. */
  secret?: boolean;
  isPublic?: boolean;
  /** Section of the settings screen this field belongs to. */
  section: string;
  placeholder?: string;
  /** Shown under the field; explains the format expected. */
  hint?: string;
  /** A short example of a valid value, used in tests and helper text. */
  example?: string;
}

const TIMEZONES = [
  'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Tokyo', 'UTC',
  'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'Australia/Sydney',
];

const DATE_FORMATS = ['DD MMM YYYY', 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'];

const CURRENCIES = [
  { value: 'INR', label: 'INR — Indian Rupee (₹)' },
  { value: 'USD', label: 'USD — US Dollar ($)' },
  { value: 'AED', label: 'AED — UAE Dirham (د.إ)' },
  { value: 'GBP', label: 'GBP — Pound Sterling (£)' },
  { value: 'SGD', label: 'SGD — Singapore Dollar (S$)' },
];

export const SETTING_DEFINITIONS: Record<SettingGroup, SettingDefinition[]> = {
  system: [
    {
      key: 'app_name', label: 'Application name', type: 'text', fallback: 'ComplianceOS', section: 'Identity',
      description: 'Shown in the sidebar, the page title, emails and PDF headers.', isPublic: true, example: 'ComplianceOS',
    },
    {
      key: 'timezone', label: 'Timezone', type: 'select', fallback: 'Asia/Kolkata', section: 'Locale', isPublic: true,
      description: 'Every date and time the platform renders or stores is interpreted in this zone.',
      options: TIMEZONES.map((zone) => ({ value: zone, label: zone })),
    },
    {
      key: 'date_format', label: 'Date format', type: 'select', fallback: 'DD MMM YYYY', section: 'Locale', isPublic: true,
      description: 'Display format for dates across the platform.',
      options: DATE_FORMATS.map((format) => ({ value: format, label: format })),
    },
    {
      key: 'currency', label: 'Currency', type: 'select', fallback: 'INR', section: 'Locale', isPublic: true,
      description: 'Currency used in payroll, salary structures and reports.',
      options: CURRENCIES,
    },
    {
      key: 'currency_symbol', label: 'Currency symbol', type: 'text', fallback: '₹', section: 'Locale', isPublic: true,
      description: 'Rendered next to monetary values on screens and PDFs.', example: '₹',
    },
    {
      key: 'financial_year_start_month', label: 'Financial year starts', type: 'select', fallback: '4', section: 'Locale', isPublic: true,
      description: 'The month a financial year begins — April for the Indian FY.',
      options: [
        { value: '1', label: 'January' }, { value: '2', label: 'February' }, { value: '3', label: 'March' },
        { value: '4', label: 'April' }, { value: '5', label: 'May' }, { value: '6', label: 'June' },
        { value: '7', label: 'July' }, { value: '8', label: 'August' }, { value: '9', label: 'September' },
        { value: '10', label: 'October' }, { value: '11', label: 'November' }, { value: '12', label: 'December' },
      ],
    },
    {
      key: 'items_per_page', label: 'Default page size', type: 'select', fallback: '10', section: 'Interface', isPublic: true,
      description: 'Rows per page when a list view first loads.',
      options: [
        { value: '10', label: '10 rows' }, { value: '25', label: '25 rows' },
        { value: '50', label: '50 rows' }, { value: '100', label: '100 rows' },
      ],
    },
    {
      key: 'session_timeout_minutes', label: 'Session timeout (minutes)', type: 'number', fallback: '480', section: 'Security',
      min: 15, max: 10080, description: 'How long a sign-in lasts before the user must authenticate again.', example: '480',
    },
    {
      key: 'max_upload_mb', label: 'Maximum upload size (MB)', type: 'number', fallback: '25', section: 'Security',
      min: 1, max: 100, description: 'Largest single file the platform accepts in any upload field.', example: '25',
    },
    {
      key: 'maintenance_mode', label: 'Maintenance mode', type: 'boolean', fallback: 'false', section: 'Security',
      description: 'Blocks every non-administrator sign-in while the platform is being worked on.',
    },
    {
      key: 'audit_retention_days', label: 'Activity log retention (days)', type: 'number', fallback: '2555', section: 'Security',
      min: 30, max: 3650, description: 'How long activity and audit rows are kept before the cleanup job prunes them (7 years by default).',
    },
  ],

  company: [
    { key: 'company_name', label: 'Legal company name', type: 'text', fallback: '', section: 'Identity', isPublic: true, description: 'Appears on invoices, PDFs and the email footer.', example: 'ComplianceOS Technologies Private Limited' },
    { key: 'company_address', label: 'Registered address', type: 'textarea', fallback: '', section: 'Identity', isPublic: true, example: '4th Floor, Anna Salai, Chennai 600002, Tamil Nadu, India' },
    { key: 'company_email', label: 'Support email', type: 'email', fallback: '', section: 'Contact', isPublic: true, example: 'support@complianceos.example' },
    { key: 'company_phone', label: 'Support phone', type: 'text', fallback: '', section: 'Contact', isPublic: true, example: '+91 44 4000 0000' },
    { key: 'company_website', label: 'Website', type: 'url', fallback: '', section: 'Contact', isPublic: true, placeholder: 'https://', example: 'https://complianceos.example' },
    { key: 'company_timing', label: 'Working hours', type: 'text', fallback: '', section: 'Contact', isPublic: true, description: 'Shown in the public site top bar.', example: 'Mon - Sat: 9:00 AM - 6:00 PM' },
    { key: 'company_tagline', label: 'Tagline', type: 'text', fallback: '', section: 'Identity', isPublic: true, description: 'One line under the logo in the public site footer.', example: 'Advice. Liaison. Compliance. Training' },
    { key: 'social_facebook', label: 'Facebook page', type: 'url', fallback: '', section: 'Social links', isPublic: true, placeholder: 'https://facebook.com/...', description: 'Leave a link blank to hide its icon on the public site.' },
    { key: 'social_linkedin', label: 'LinkedIn page', type: 'url', fallback: '', section: 'Social links', isPublic: true, placeholder: 'https://linkedin.com/company/...' },
    { key: 'social_twitter', label: 'X / Twitter profile', type: 'url', fallback: '', section: 'Social links', isPublic: true, placeholder: 'https://x.com/...' },
    { key: 'social_instagram', label: 'Instagram profile', type: 'url', fallback: '', section: 'Social links', isPublic: true, placeholder: 'https://instagram.com/...' },
    { key: 'social_youtube', label: 'YouTube channel', type: 'url', fallback: '', section: 'Social links', isPublic: true, placeholder: 'https://youtube.com/...' },
    { key: 'company_gstin', label: 'GSTIN', type: 'text', fallback: '', section: 'Statutory', isPublic: true, hint: '15 characters, e.g. 33AABCC1234D1Z5', example: '33AABCC1234D1Z5' },
    { key: 'company_pan', label: 'Company PAN', type: 'text', fallback: '', section: 'Statutory', hint: '10 characters, e.g. AABCC1234D', example: 'AABCC1234D' },
    { key: 'company_tan', label: 'TAN', type: 'text', fallback: '', section: 'Statutory', hint: '10 characters, used on TDS returns', example: 'CHEC12345F' },
    { key: 'company_cin', label: 'CIN', type: 'text', fallback: '', section: 'Statutory', isPublic: true, hint: '21 characters, e.g. U72900TN2019PTC123456', example: 'U72900TN2019PTC123456' },
    { key: 'company_pf_code', label: 'PF establishment code', type: 'text', fallback: '', section: 'Statutory', example: 'TN/CHN/0012345' },
    { key: 'company_esi_code', label: 'ESI establishment code', type: 'text', fallback: '', section: 'Statutory', example: '51000123450001099' },
    { key: 'company_state', label: 'State', type: 'text', fallback: '', section: 'Billing', hint: 'The state of the registered address, printed on invoices', example: 'Tamil Nadu' },
    { key: 'company_state_code', label: 'GST state code', type: 'text', fallback: '33', section: 'Billing', hint: 'Two digits (33 = Tamil Nadu). A buyer in the same state is charged CGST + SGST, any other state IGST.', example: '33' },
    { key: 'billing_default_sac', label: 'Default SAC code', type: 'text', fallback: '998311', section: 'Billing', hint: 'Service accounting code printed against a service line when none is set. Confirm the right code with your accountant.', example: '998311' },
    { key: 'bank_name', label: 'Bank name', type: 'text', fallback: '', section: 'Billing', description: 'Printed on invoices.', example: 'ICICI Bank' },
    { key: 'bank_account_number', label: 'Bank account number', type: 'text', fallback: '', section: 'Billing', example: '123456789012' },
    { key: 'bank_ifsc', label: 'IFSC code', type: 'text', fallback: '', section: 'Billing', example: 'ICIC0000103' },
    { key: 'quotation_brand_name', label: 'Quotation: name at the top', type: 'text', fallback: '', section: 'Billing', description: 'Printed large at the top of a quotation. Blank uses the legal company name.', example: 'NextGen Socio and Enviro Advisors' },
    { key: 'quotation_tagline', label: 'Quotation: tagline', type: 'text', fallback: '', section: 'Billing', description: 'The line under the name. Blank uses the tagline of the site.', example: 'All Compliance Under One Umbrella' },
    { key: 'quotation_elements', label: 'Quotation: what is included', type: 'textarea', fallback: '', section: 'Billing', description: 'One item per line, printed under "What is included in monthly service". Blank uses the standard list.' },
    { key: 'quotation_notes', label: 'Quotation: notes', type: 'textarea', fallback: '', section: 'Billing', description: 'One note per line. Blank uses the standard notes.' },
    { key: 'quotation_payment_terms', label: 'Quotation: payment terms', type: 'textarea', fallback: '', section: 'Billing', description: 'One term per line. Blank uses the standard terms.' },
    { key: 'quotation_validity_days', label: 'Quotation validity (days)', type: 'number', fallback: '30', section: 'Billing', min: 1, max: 365 },
    { key: 'invoice_terms', label: 'Invoice terms', type: 'textarea', fallback: '', section: 'Billing', description: 'One note per line, printed under the invoice total.', example: 'A late fee of 1% per month plus GST will be charged on any outstanding amount.' },
    { key: 'signatory_name', label: 'Authorised signatory', type: 'text', fallback: '', section: 'Signatory', description: 'Printed above the signature line on generated PDFs.', example: 'R. Karthikeyan' },
    { key: 'signatory_designation', label: 'Signatory designation', type: 'text', fallback: '', section: 'Signatory', example: 'Director — Compliance' },
    { key: 'logo_path', label: 'Logo', type: 'text', fallback: '', section: 'Signatory', description: 'Vault URL of the uploaded logo — shown on PDF letterheads, emails and the public site.' },
    { key: 'letterhead_path', label: 'Letterhead', type: 'text', fallback: '', section: 'Signatory', description: 'Vault URL of the letterhead banner printed at the top of CAPAR reports. Upload it from the sidebar; a report can override it.' },
  ],

  email: [
    { key: 'enabled', label: 'Enable outbound email', type: 'boolean', fallback: 'true', section: 'Delivery', description: 'Master switch — when off, nothing is sent and every attempt is logged as skipped.' },
    { key: 'smtp_host', label: 'SMTP host', type: 'text', fallback: '', section: 'Server', placeholder: 'smtp.sendgrid.net', hint: 'SendGrid: smtp.sendgrid.net · Office 365: smtp.office365.com · Gmail: smtp.gmail.com', example: 'smtp.sendgrid.net' },
    { key: 'smtp_port', label: 'SMTP port', type: 'number', fallback: '587', section: 'Server', min: 1, max: 65535, hint: '587 for STARTTLS, 465 for SSL', example: '587' },
    { key: 'smtp_secure', label: 'Use SSL (port 465)', type: 'boolean', fallback: 'false', section: 'Server' },
    { key: 'smtp_username', label: 'SMTP username', type: 'text', fallback: '', section: 'Credentials', hint: 'Often “apikey” for SendGrid, or the full mailbox address for Office 365', example: 'apikey' },
    { key: 'smtp_password', label: 'SMTP password / API key', type: 'password', fallback: '', section: 'Credentials', secret: true, description: 'Encrypted with AES-256-GCM before it is stored. Leave blank to keep the current value.' },
    { key: 'from_email', label: 'From address', type: 'email', fallback: '', section: 'Identity', example: 'noreply@complianceos.example' },
    { key: 'from_name', label: 'From name', type: 'text', fallback: 'ComplianceOS', section: 'Identity', example: 'ComplianceOS' },
    { key: 'reply_to', label: 'Reply-to address', type: 'email', fallback: '', section: 'Identity', example: 'support@complianceos.example' },
  ],

  sms: [
    { key: 'enabled', label: 'Enable outbound SMS', type: 'boolean', fallback: 'true', section: 'Delivery', description: 'Master switch for every transactional message.' },
    { key: 'provider', label: 'Provider', type: 'select', fallback: 'twilio', section: 'Delivery', options: [ { value: 'twilio', label: 'Twilio' }, { value: 'msg91', label: 'MSG91' } ] },
    { key: 'sender_id', label: 'Sender ID', type: 'text', fallback: 'PLATFM', section: 'Delivery', hint: '6 alphanumeric characters, registered with the operator (DLT)', example: 'PLATFM' },
    { key: 'twilio_account_sid', label: 'Twilio Account SID', type: 'text', fallback: '', section: 'Twilio', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', example: 'AC00000000000000000000000000000000' },
    { key: 'twilio_auth_token', label: 'Twilio Auth Token', type: 'password', fallback: '', section: 'Twilio', secret: true, description: 'Encrypted at rest. Leave blank to keep the current value.' },
    { key: 'msg91_auth_key', label: 'MSG91 Auth Key', type: 'password', fallback: '', section: 'MSG91', secret: true, description: 'Encrypted at rest. Leave blank to keep the current value.' },
    { key: 'msg91_sender_id', label: 'MSG91 Sender ID', type: 'text', fallback: 'PLATFM', section: 'MSG91', example: 'PLATFM' },
  ],

  whatsapp: [
    { key: 'enabled', label: 'Enable WhatsApp messaging', type: 'boolean', fallback: 'true', section: 'Delivery' },
    { key: 'provider', label: 'Provider', type: 'select', fallback: 'meta', section: 'Delivery', options: [ { value: 'meta', label: 'Meta Cloud API' }, { value: 'twilio', label: 'Twilio WhatsApp' } ] },
    { key: 'phone_number_id', label: 'Phone number ID', type: 'text', fallback: '', section: 'Meta Cloud API', description: 'The numeric ID Meta shows next to the sending number.', example: '1029384756102938' },
    { key: 'access_token', label: 'Access token', type: 'password', fallback: '', section: 'Meta Cloud API', secret: true, description: 'Encrypted at rest. Leave blank to keep the current value.' },
    { key: 'twilio_account_sid', label: 'Twilio Account SID', type: 'text', fallback: '', section: 'Twilio', example: 'AC00000000000000000000000000000000' },
    { key: 'twilio_auth_token', label: 'Twilio Auth Token', type: 'password', fallback: '', section: 'Twilio', secret: true },
    { key: 'twilio_from', label: 'Twilio WhatsApp sender', type: 'text', fallback: '', section: 'Twilio', hint: 'The sandbox or approved WhatsApp number, e.g. +14155238886', example: '+14155238886' },
  ],

  backup: [
    { key: 'enabled', label: 'Scheduled backups', type: 'boolean', fallback: 'true', section: 'Schedule', description: 'When off, the backup job is skipped — manual runs still work.' },
    { key: 'frequency', label: 'Frequency', type: 'select', fallback: 'daily', section: 'Schedule', options: [ { value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' } ] },
    { key: 'retention_days', label: 'Retention (days)', type: 'number', fallback: '30', section: 'Schedule', min: 1, max: 3650, description: 'Dumps older than this are deleted after a successful run.' },
    { key: 'storage_path', label: 'Backup directory', type: 'text', fallback: './storage/backups', section: 'Storage', description: 'Absolute path, or relative to the application root.', example: './storage/backups' },
    { key: 'include_uploads', label: 'Include uploaded files', type: 'boolean', fallback: 'true', section: 'Storage', description: 'Copies the vault contents alongside the SQL dump.' },
    { key: 'notification_emails', label: 'Notify on completion', type: 'text', fallback: '', section: 'Notifications', hint: 'Comma-separated addresses; leave blank for no email', example: 'ops@complianceos.example, cto@complianceos.example' },
  ],

  audit: [
    { key: 'default_tat_days', label: 'Default audit TAT (days)', type: 'number', fallback: '30', section: 'Audit defaults', min: 1, max: 365, description: 'Used to suggest a due date when an assignment is created.' },
    { key: 'reminder_days_before', label: 'Audit reminder days', type: 'text', fallback: '7,3,1', section: 'Audit defaults', hint: 'Comma-separated day offsets before the due date', example: '7,3,1' },
    { key: 'compliance_reminder_days', label: 'Compliance reminder days', type: 'text', fallback: '90,60,30,15,7,1', section: 'Audit defaults', hint: 'Day offsets before a licence or registration expires', example: '90,60,30,15,7,1' },
    { key: 'require_verification', label: 'Require verification', type: 'boolean', fallback: 'true', section: 'Audit defaults', description: 'Submitted audit reports must be verified before they are released.' },
    { key: 'auto_overdue', label: 'Auto-mark overdue', type: 'boolean', fallback: 'true', section: 'Audit defaults', description: 'Assignments past their due date are flagged by the reminder job.' },
  ],
};

/** Every definition, flattened, keyed by `group.key`. */
export const SETTING_INDEX: Record<string, SettingDefinition & { group: SettingGroup }> = Object.fromEntries(
  SETTING_GROUPS.flatMap((group) =>
    SETTING_DEFINITIONS[group].map((definition) => [`${group}.${definition.key}`, { ...definition, group }])
  )
);

export function definitionsFor(group: SettingGroup): SettingDefinition[] {
  return SETTING_DEFINITIONS[group];
}

export function sectionsFor(group: SettingGroup): { section: string; fields: SettingDefinition[] }[] {
  const sections: { section: string; fields: SettingDefinition[] }[] = [];
  for (const definition of SETTING_DEFINITIONS[group]) {
    const existing = sections.find((entry) => entry.section === definition.section);
    if (existing) existing.fields.push(definition);
    else sections.push({ section: definition.section, fields: [definition] });
  }
  return sections;
}

export function isSecretKey(group: SettingGroup, key: string): boolean {
  return Boolean(definitionsFor(group).find((definition) => definition.key === key)?.secret);
}

export const SETTING_GROUP_LABELS: Record<SettingGroup, string> = {
  system: 'System',
  company: 'Company',
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  backup: 'Backup',
  audit: 'Audit defaults',
};

/** Which settings screens exist, and what they own. */
export const SETTINGS_SCREENS = [
  { group: 'system' as SettingGroup, href: '/admin/settings', title: 'System Settings', description: 'Identity, locale, interface defaults and the security switches.' },
  { group: 'company' as SettingGroup, href: '/admin/settings/company-settings', title: 'Company Settings', description: 'Legal entity, statutory registrations, letterhead signatory and logo.' },
  { group: 'email' as SettingGroup, href: '/admin/settings/email-settings', title: 'Email Settings', description: 'SMTP or SendGrid delivery, sender identity and the delivery log.' },
  { group: 'sms' as SettingGroup, href: '/admin/settings/sms-settings', title: 'SMS Settings', description: 'Twilio or MSG91 credentials, sender ID and the delivery log.' },
  { group: 'whatsapp' as SettingGroup, href: '/admin/settings/whatsapp-settings', title: 'WhatsApp Settings', description: 'Meta Cloud API or Twilio WhatsApp sender and the delivery log.' },
  { group: 'backup' as SettingGroup, href: '/admin/settings/backup-settings', title: 'Backup Settings', description: 'Schedule, retention, storage location and the backup history.' },
  { group: 'audit' as SettingGroup, href: '/admin/settings/audit-settings', title: 'Audit Defaults', description: 'Turnaround time, reminder offsets and the verification gate.' },
];
