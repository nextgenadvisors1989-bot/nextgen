/**
 * The complete template catalogue: 10 email, 6 SMS and 6 WhatsApp messages,
 * plus in-app bodies. Templates are plain strings with `{{variable}}` merge
 * fields so they can also be edited by admins in the Templates screen.
 */

export interface TemplateDefinition {
  code: string;
  name: string;
  channel: 'email' | 'sms' | 'whatsapp' | 'in_app';
  subject?: string;
  body: string;
  variables: string[];
  category: 'ACCOUNT' | 'AUDIT' | 'REPORT' | 'PAYROLL' | 'COMPLIANCE' | 'LEAVE' | 'SYSTEM';
}

function emailShell(title: string, content: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1e293b; margin: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #3b82f6; color: #ffffff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 22px; }
    .content { background: #ffffff; padding: 30px; }
    .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; background: #3b82f6; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 4px; margin-top: 20px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th, td { padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: left; font-size: 14px; }
    th { background: #f8fafc; font-weight: 600; color: #475569; }
    .muted { color: #64748b; font-size: 13px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header"><h1>{{platform_name}}</h1></div>
    <div class="content">
      <h2 style="margin-top:0;font-size:18px;color:#1e293b;">${title}</h2>
      ${content}
      <p class="muted" style="margin-top:28px;">Best regards,<br>{{platform_name}} Team</p>
    </div>
    <div class="footer">
      <p style="margin:0 0 6px;">{{company_address}}</p>
      <p style="margin:0;">{{company_email}} &nbsp;|&nbsp; {{company_phone}}</p>
    </div>
  </div>
</body>
</html>`;
}

export const TEMPLATES: Record<string, TemplateDefinition> = {
  // ── 1. Welcome / account credentials ────────────────────────────────
  'welcome.credentials': {
    code: 'welcome.credentials',
    name: 'Welcome — Account Credentials',
    channel: 'email',
    subject: 'Welcome to {{platform_name}} — Your Account Credentials',
    body: emailShell(
      'Your account is ready',
      `<p>Dear {{recipient_name}},</p>
       <p>An account has been created for you on <strong>{{platform_name}}</strong> by {{created_by_name}}. Please use the credentials below to sign in.</p>
       <table>
         <tr><th style="width:40%">Username</th><td><strong>{{username}}</strong></td></tr>
         <tr><th>Temporary Password</th><td><strong>{{temporary_password}}</strong></td></tr>
         <tr><th>Role</th><td>{{role_name}}</td></tr>
         <tr><th>{{scope_label}}</th><td>{{scope_value}}</td></tr>
       </table>
       <p>For security reasons you must change your password immediately after your first sign-in. The temporary password cannot be reused.</p>
       <a href="{{login_url}}" class="button">Sign In Now</a>
       <p class="muted" style="margin-top:24px;">If you did not expect this email, please contact {{support_email}} immediately.</p>`
    ),
    variables: ['platform_name', 'recipient_name', 'created_by_name', 'username', 'temporary_password', 'role_name', 'scope_label', 'scope_value', 'login_url', 'support_email', 'company_address', 'company_email', 'company_phone'],
    category: 'ACCOUNT',
  },

  // ── 2. Audit assignment (to auditor) ────────────────────────────────
  'audit.assigned.auditor': {
    code: 'audit.assigned.auditor',
    name: 'Audit Assigned — Auditor',
    channel: 'email',
    subject: 'New Audit Assigned — {{audit_title}} — {{employer_name}}',
    body: emailShell(
      'A new audit has been assigned to you',
      `<p>Dear {{auditor_name}},</p>
       <p>The following audit has been assigned to you. Please review the details and complete it before the due date.</p>
       <table>
         <tr><th style="width:40%">Assignment No.</th><td><strong>{{assignment_number}}</strong></td></tr>
         <tr><th>Audit Title</th><td>{{audit_title}}</td></tr>
         <tr><th>Employer</th><td>{{employer_name}}</td></tr>
         <tr><th>Unit / Location</th><td>{{unit_name}}</td></tr>
         <tr><th>Module</th><td>{{module_name}}</td></tr>
         <tr><th>Start Date</th><td>{{start_date}}</td></tr>
         <tr><th>End Date</th><td>{{end_date}}</td></tr>
         <tr><th>Due Date</th><td><strong>{{due_date}}</strong></td></tr>
         <tr><th>Priority</th><td><span class="badge" style="background:#dbeafe;color:#1d4ed8;">{{priority}}</span></td></tr>
       </table>
       <p><strong>Instructions:</strong><br>{{instructions}}</p>
       <a href="{{assignment_url}}" class="button">View Assignment</a>`
    ),
    variables: ['auditor_name', 'assignment_number', 'audit_title', 'employer_name', 'unit_name', 'module_name', 'start_date', 'end_date', 'due_date', 'priority', 'instructions', 'assignment_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'AUDIT',
  },

  // ── 3. Audit assignment (to employer) ───────────────────────────────
  'audit.assigned.employer': {
    code: 'audit.assigned.employer',
    name: 'Audit Assigned — Employer',
    channel: 'email',
    subject: 'Audit Assigned to Your Company — {{audit_title}}',
    body: emailShell(
      'An audit has been scheduled for your company',
      `<p>Dear {{contact_person_name}},</p>
       <p>An audit has been scheduled for <strong>{{employer_name}}</strong>. Please ensure the relevant personnel and documents are available.</p>
       <table>
         <tr><th style="width:40%">Assignment No.</th><td>{{assignment_number}}</td></tr>
         <tr><th>Audit Title</th><td>{{audit_title}}</td></tr>
         <tr><th>Auditor</th><td>{{auditor_name}}</td></tr>
         <tr><th>Auditor Contact</th><td>{{auditor_mobile}}</td></tr>
         <tr><th>Scheduled Dates</th><td>{{start_date}} to {{end_date}}</td></tr>
         <tr><th>Scope</th><td>{{scope}}</td></tr>
       </table>
       <a href="{{assignment_url}}" class="button">View Audit Details</a>`
    ),
    variables: ['contact_person_name', 'employer_name', 'assignment_number', 'audit_title', 'auditor_name', 'auditor_mobile', 'start_date', 'end_date', 'scope', 'assignment_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'AUDIT',
  },

  // ── 4. Report submitted ─────────────────────────────────────────────
  'report.submitted': {
    code: 'report.submitted',
    name: 'Audit Report Submitted',
    channel: 'email',
    subject: 'Audit Report Submitted — {{audit_title}} — {{employer_name}}',
    body: emailShell(
      'A new audit report has been submitted',
      `<p>Dear {{recipient_name}},</p>
       <p>A new audit report has been submitted and is available for your review.</p>
       <table>
         <tr><th style="width:40%">Report No.</th><td><strong>{{report_number}}</strong></td></tr>
         <tr><th>Audit Title</th><td>{{audit_title}}</td></tr>
         <tr><th>Employer</th><td>{{employer_name}}</td></tr>
         <tr><th>Auditor</th><td>{{auditor_name}}</td></tr>
         <tr><th>Submitted On</th><td>{{submitted_date}}</td></tr>
         <tr><th>Score</th><td>{{score_percentage}}%</td></tr>
         <tr><th>Critical / Major / Minor</th><td>{{critical_findings}} / {{major_findings}} / {{minor_findings}}</td></tr>
       </table>
       <p>The full report PDF is attached to this email.</p>
       <a href="{{report_url}}" class="button">View Report</a>`
    ),
    variables: ['recipient_name', 'report_number', 'audit_title', 'employer_name', 'auditor_name', 'submitted_date', 'score_percentage', 'critical_findings', 'major_findings', 'minor_findings', 'report_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'REPORT',
  },

  // ── 5a. Report approved ─────────────────────────────────────────────
  'report.approved': {
    code: 'report.approved',
    name: 'Audit Report Approved',
    channel: 'email',
    subject: 'Audit Report Approved — {{audit_title}}',
    body: emailShell(
      'Your report has been approved',
      `<p>Dear {{auditor_name}},</p>
       <p>Your audit report for <strong>{{audit_title}}</strong> ({{employer_name}}) has been <strong style="color:#10b981;">approved</strong>.</p>
       <table>
         <tr><th style="width:40%">Report No.</th><td>{{report_number}}</td></tr>
         <tr><th>Approved By</th><td>{{verifier_name}}</td></tr>
         <tr><th>Approved On</th><td>{{approved_date}}</td></tr>
       </table>
       <p><strong>Verifier comments:</strong><br>{{comments}}</p>
       <a href="{{report_url}}" class="button">View Report</a>`
    ),
    variables: ['auditor_name', 'audit_title', 'employer_name', 'report_number', 'verifier_name', 'approved_date', 'comments', 'report_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'REPORT',
  },

  // ── 5b. Report rejected / returned ──────────────────────────────────
  'report.rejected': {
    code: 'report.rejected',
    name: 'Audit Report Rejected or Returned',
    channel: 'email',
    subject: 'Audit Report {{status}} — {{audit_title}}',
    body: emailShell(
      'Your report requires attention',
      `<p>Dear {{auditor_name}},</p>
       <p>Your audit report for <strong>{{audit_title}}</strong> ({{employer_name}}) has been <strong style="color:#ef4444;">{{status}}</strong>.</p>
       <table>
         <tr><th style="width:40%">Report No.</th><td>{{report_number}}</td></tr>
         <tr><th>Reviewed By</th><td>{{verifier_name}}</td></tr>
         <tr><th>Reviewed On</th><td>{{reviewed_date}}</td></tr>
         <tr><th>Reason</th><td>{{reason}}</td></tr>
       </table>
       <p><strong>Corrections required:</strong></p>
       {{corrections_list}}
       <p><strong>Comments:</strong><br>{{comments}}</p>
       <a href="{{report_url}}" class="button">Open Report &amp; Correct</a>`
    ),
    variables: ['auditor_name', 'audit_title', 'employer_name', 'report_number', 'status', 'verifier_name', 'reviewed_date', 'reason', 'corrections_list', 'comments', 'report_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'REPORT',
  },

  // ── 5c. Dynamic-form submission (module engine) ─────────────────────
  'submission.submitted': {
    code: 'submission.submitted',
    name: 'Dynamic Form Submitted',
    channel: 'email',
    subject: 'Submission {{submission_number}} — {{form_name}}',
    body: emailShell(
      'A dynamic form has been submitted',
      `<p>Dear {{recipient_name}},</p>
       <p><strong>{{submitter_name}}</strong> submitted <strong>{{form_name}}</strong> from the {{module_name}} module and it is now waiting for whoever reviews it.</p>
       <table>
         <tr><th style="width:40%">Submission No.</th><td><strong>{{submission_number}}</strong></td></tr>
         <tr><th>Module</th><td>{{module_name}}</td></tr>
         <tr><th>Form</th><td>{{form_name}}</td></tr>
         <tr><th>Submitted By</th><td>{{submitter_name}}</td></tr>
         <tr><th>Employer</th><td>{{employer_name}}</td></tr>
         <tr><th>Submitted On</th><td>{{submitted_date}}</td></tr>
         <tr><th>Self Score</th><td>{{score_percentage}}%</td></tr>
       </table>
       <p>The generated PDF is attached to this email.</p>
       <a href="{{submission_url}}" class="button">Open Submission</a>`
    ),
    variables: ['recipient_name', 'submission_number', 'module_name', 'form_name', 'submitter_name', 'employer_name', 'submitted_date', 'score_percentage', 'submission_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'REPORT',
  },

  'submission.approved': {
    code: 'submission.approved',
    name: 'Dynamic Form Approved',
    channel: 'email',
    subject: 'Submission {{submission_number}} approved — {{form_name}}',
    body: emailShell(
      'Your submission has been approved',
      `<p>Dear {{submitter_name}},</p>
       <p>Your submission of <strong>{{form_name}}</strong> ({{module_name}}) has been <strong style="color:#10b981;">approved</strong>.</p>
       <table>
         <tr><th style="width:40%">Submission No.</th><td>{{submission_number}}</td></tr>
         <tr><th>Reviewed By</th><td>{{reviewer_name}}</td></tr>
         <tr><th>Reviewed On</th><td>{{reviewed_date}}</td></tr>
         <tr><th>Awarded Score</th><td>{{score_percentage}}%</td></tr>
       </table>
       <p><strong>Reviewer comments:</strong><br>{{comments}}</p>
       <a href="{{submission_url}}" class="button">View Submission</a>`
    ),
    variables: ['submitter_name', 'form_name', 'module_name', 'submission_number', 'reviewer_name', 'reviewed_date', 'score_percentage', 'comments', 'submission_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'REPORT',
  },

  'submission.returned': {
    code: 'submission.returned',
    name: 'Dynamic Form Returned for Correction',
    channel: 'email',
    subject: 'Submission {{submission_number}} needs corrections — {{form_name}}',
    body: emailShell(
      'Your submission has been returned',
      `<p>Dear {{submitter_name}},</p>
       <p>Your submission of <strong>{{form_name}}</strong> ({{module_name}}) has been returned so you can correct the points below. The form reopens for editing straight away.</p>
       <table>
         <tr><th style="width:40%">Submission No.</th><td>{{submission_number}}</td></tr>
         <tr><th>Reviewed By</th><td>{{reviewer_name}}</td></tr>
         <tr><th>Reviewed On</th><td>{{reviewed_date}}</td></tr>
       </table>
       <p><strong>What needs to change:</strong></p>
       {{corrections_list}}
       <a href="{{submission_url}}" class="button">Correct &amp; Resubmit</a>`
    ),
    variables: ['submitter_name', 'form_name', 'module_name', 'submission_number', 'reviewer_name', 'reviewed_date', 'corrections_list', 'submission_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'REPORT',
  },

  'submission.rejected': {
    code: 'submission.rejected',
    name: 'Dynamic Form Rejected',
    channel: 'email',
    subject: 'Submission {{submission_number}} rejected — {{form_name}}',
    body: emailShell(
      'Your submission was rejected',
      `<p>Dear {{submitter_name}},</p>
       <p>Your submission of <strong>{{form_name}}</strong> ({{module_name}}) has been <strong style="color:#ef4444;">rejected</strong>.</p>
       <table>
         <tr><th style="width:40%">Submission No.</th><td>{{submission_number}}</td></tr>
         <tr><th>Reviewed By</th><td>{{reviewer_name}}</td></tr>
         <tr><th>Reviewed On</th><td>{{reviewed_date}}</td></tr>
       </table>
       <p><strong>Reason:</strong><br>{{comments}}</p>
       <a href="{{submission_url}}" class="button">Open Submission</a>`
    ),
    variables: ['submitter_name', 'form_name', 'module_name', 'submission_number', 'reviewer_name', 'reviewed_date', 'comments', 'submission_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'REPORT',
  },

  // ── 6. Payslip published ────────────────────────────────────────────
  'payslip.published': {
    code: 'payslip.published',
    name: 'Payslip Published',
    channel: 'email',
    subject: 'Your Payslip for {{month_year}} is Available',
    body: emailShell(
      'Your payslip is ready',
      `<p>Dear {{employee_name}},</p>
       <p>Your payslip for <strong>{{month_year}}</strong> has been published and is available in your employee portal.</p>
       <table>
         <tr><th style="width:40%">Employee No.</th><td>{{employee_number}}</td></tr>
         <tr><th>Payslip No.</th><td>{{payslip_number}}</td></tr>
         <tr><th>Paid Days</th><td>{{paid_days}}</td></tr>
         <tr><th>Gross Earnings</th><td>{{gross_earnings}}</td></tr>
         <tr><th>Total Deductions</th><td>{{total_deductions}}</td></tr>
         <tr><th>Net Pay</th><td><strong style="font-size:16px;">{{net_pay}}</strong></td></tr>
       </table>
       <a href="{{payslip_url}}" class="button">Download Payslip</a>
       <p class="muted" style="margin-top:24px;">Please report any discrepancy to your payroll department within 7 days of receipt.</p>`
    ),
    variables: ['employee_name', 'employee_number', 'month_year', 'payslip_number', 'paid_days', 'gross_earnings', 'total_deductions', 'net_pay', 'payslip_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'PAYROLL',
  },

  // ── 7. Password reset ───────────────────────────────────────────────
  'auth.password_reset': {
    code: 'auth.password_reset',
    name: 'Password Reset Request',
    channel: 'email',
    subject: 'Password Reset Request — {{platform_name}}',
    body: emailShell(
      'Reset your password',
      `<p>Dear {{recipient_name}},</p>
       <p>We received a request to reset the password for your {{platform_name}} account ({{email}}).</p>
       <p>This link is valid for <strong>1 hour</strong> and can be used only once.</p>
       <a href="{{reset_url}}" class="button">Reset Password</a>
       <p class="muted" style="margin-top:24px;">If you did not request a password reset, you can safely ignore this email — your password will remain unchanged. Requested from IP {{ip_address}} at {{requested_at}}.</p>`
    ),
    variables: ['recipient_name', 'email', 'reset_url', 'ip_address', 'requested_at', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'ACCOUNT',
  },

  // ── 8. Compliance document expiry ───────────────────────────────────
  'compliance.document_expiring': {
    code: 'compliance.document_expiring',
    name: 'Compliance Document Expiry Reminder',
    channel: 'email',
    subject: 'Compliance Document Expiring Soon — {{document_name}}',
    body: emailShell(
      'A compliance document is nearing expiry',
      `<p>Dear {{recipient_name}},</p>
       <p>The following compliance document for <strong>{{employer_name}}</strong> is expiring soon. Please initiate renewal to remain compliant.</p>
       <table>
         <tr><th style="width:40%">Document</th><td>{{document_name}}</td></tr>
         <tr><th>Type</th><td>{{document_type}}</td></tr>
         <tr><th>Number</th><td>{{document_number}}</td></tr>
         <tr><th>Issuing Authority</th><td>{{issuing_authority}}</td></tr>
         <tr><th>Expiry Date</th><td><strong>{{expiry_date}}</strong></td></tr>
         <tr><th>Days Remaining</th><td><span class="badge" style="background:#fef3c7;color:#b45309;">{{days_remaining}} days</span></td></tr>
         <tr><th>Responsibility</th><td>{{renewal_responsibility}}</td></tr>
       </table>
       <a href="{{document_url}}" class="button">Renew Now</a>`
    ),
    variables: ['recipient_name', 'employer_name', 'document_name', 'document_type', 'document_number', 'issuing_authority', 'expiry_date', 'days_remaining', 'renewal_responsibility', 'document_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'COMPLIANCE',
  },

  // ── 9. Audit due reminder ───────────────────────────────────────────
  'audit.due_reminder': {
    code: 'audit.due_reminder',
    name: 'Audit Due Date Reminder',
    channel: 'email',
    subject: 'Audit Due Soon — {{audit_title}} — Due on {{due_date}}',
    body: emailShell(
      'An assigned audit is due soon',
      `<p>Dear {{recipient_name}},</p>
       <p>This is a reminder that the following audit is due in <strong>{{days_remaining}} day(s)</strong>.</p>
       <table>
         <tr><th style="width:40%">Assignment No.</th><td>{{assignment_number}}</td></tr>
         <tr><th>Audit Title</th><td>{{audit_title}}</td></tr>
         <tr><th>Employer</th><td>{{employer_name}}</td></tr>
         <tr><th>Due Date</th><td><strong>{{due_date}}</strong></td></tr>
         <tr><th>Current Status</th><td>{{status}}</td></tr>
         <tr><th>Progress</th><td>{{progress_percent}}%</td></tr>
       </table>
       <a href="{{assignment_url}}" class="button">Start Audit</a>`
    ),
    variables: ['recipient_name', 'assignment_number', 'audit_title', 'employer_name', 'due_date', 'days_remaining', 'status', 'progress_percent', 'assignment_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'AUDIT',
  },

  // ── 10. Leave approval ──────────────────────────────────────────────
  'leave.decision': {
    code: 'leave.decision',
    name: 'Leave Request Decision',
    channel: 'email',
    subject: 'Leave Request {{status}} — {{date_from}} to {{date_to}}',
    body: emailShell(
      'Your leave request has been reviewed',
      `<p>Dear {{employee_name}},</p>
       <p>Your leave request has been <strong>{{status}}</strong>.</p>
       <table>
         <tr><th style="width:40%">Application No.</th><td>{{application_number}}</td></tr>
         <tr><th>Leave Type</th><td>{{leave_type}}</td></tr>
         <tr><th>From</th><td>{{date_from}}</td></tr>
         <tr><th>To</th><td>{{date_to}}</td></tr>
         <tr><th>Total Days</th><td>{{total_days}}</td></tr>
         <tr><th>Reviewed By</th><td>{{approver_name}}</td></tr>
       </table>
       <p><strong>Comments:</strong><br>{{comments}}</p>
       <a href="{{application_url}}" class="button">View Details</a>`
    ),
    variables: ['employee_name', 'status', 'application_number', 'leave_type', 'date_from', 'date_to', 'total_days', 'approver_name', 'comments', 'application_url', 'platform_name', 'company_address', 'company_email', 'company_phone'],
    category: 'LEAVE',
  },

  // ── SMS templates ───────────────────────────────────────────────────
  // ── System: delivery test from the settings screen ──────────────────
  'system.test': {
    code: 'system.test',
    name: 'System — Integration Test',
    channel: 'email',
    subject: '{{subject_line}}',
    body: emailShell('Email delivery test', `
      <p>Hello {{recipient_name}},</p>
      <p>This is a live test of the platform's outbound email.</p>
      <p>It was triggered by <strong>{{sent_by_name}}</strong> from the Email Settings screen
         at {{sent_at}}.</p>
      <p class="muted">If you are reading this, SMTP is configured correctly and every
         template in the platform can reach the same server.</p>
      <p class="muted">Platform URL: <a href="{{app_url}}">{{app_url}}</a></p>
    `),
    variables: ['recipient_name', 'sent_by_name', 'sent_at', 'subject_line', 'app_url'],
    category: 'SYSTEM',
  },

  'sms.welcome': {
    code: 'sms.welcome',
    name: 'Welcome SMS',
    channel: 'sms',
    body: 'Welcome to {{platform_name}}! Your username: {{username}}. Login: {{login_url}}. Change password after first login.',
    variables: ['platform_name', 'username', 'login_url'],
    category: 'ACCOUNT',
  },
  'sms.audit_assigned': {
    code: 'sms.audit_assigned',
    name: 'Audit Assignment SMS',
    channel: 'sms',
    body: 'New audit assigned: {{audit_title}} for {{employer_name}}. Due: {{due_date}}. Login: {{login_url}}',
    variables: ['audit_title', 'employer_name', 'due_date', 'login_url'],
    category: 'AUDIT',
  },
  'sms.otp': {
    code: 'sms.otp',
    name: 'Password Reset OTP',
    channel: 'sms',
    body: 'Your OTP for password reset: {{otp}}. Valid for 10 minutes. Do not share.',
    variables: ['otp'],
    category: 'ACCOUNT',
  },
  'sms.payslip': {
    code: 'sms.payslip',
    name: 'Payslip Published SMS',
    channel: 'sms',
    body: 'Your payslip for {{month_year}} is ready. Net: Rs.{{net_pay}}. Download: {{payslip_url}}',
    variables: ['month_year', 'net_pay', 'payslip_url'],
    category: 'PAYROLL',
  },
  'sms.audit_due_reminder': {
    code: 'sms.audit_due_reminder',
    name: 'Audit Due Reminder SMS',
    channel: 'sms',
    body: 'Reminder: Audit {{audit_title}} due on {{due_date}}. {{days_remaining}} days remaining. Login: {{login_url}}',
    variables: ['audit_title', 'due_date', 'days_remaining', 'login_url'],
    category: 'AUDIT',
  },
  'sms.leave_decision': {
    code: 'sms.leave_decision',
    name: 'Leave Decision SMS',
    channel: 'sms',
    body: 'Your leave request for {{date_from}} to {{date_to}} has been {{status}}. Check portal for details.',
    variables: ['date_from', 'date_to', 'status'],
    category: 'LEAVE',
  },

  // ── WhatsApp templates ──────────────────────────────────────────────
  'whatsapp.welcome': {
    code: 'whatsapp.welcome',
    name: 'Welcome WhatsApp',
    channel: 'whatsapp',
    body: '👋 Welcome to {{platform_name}}!\n\nYour account is ready.\nUsername: {{username}}\nLogin: {{login_url}}\n\nChange password after first login.',
    variables: ['platform_name', 'username', 'login_url'],
    category: 'ACCOUNT',
  },
  'whatsapp.audit_assigned': {
    code: 'whatsapp.audit_assigned',
    name: 'Audit Assignment WhatsApp',
    channel: 'whatsapp',
    body: '📋 *New Audit Assigned*\n\nTitle: {{audit_title}}\nEmployer: {{employer_name}}\nDue Date: {{due_date}}\nPriority: {{priority}}\n\nLogin to start: {{login_url}}',
    variables: ['audit_title', 'employer_name', 'due_date', 'priority', 'login_url'],
    category: 'AUDIT',
  },
  'whatsapp.report_submitted': {
    code: 'whatsapp.report_submitted',
    name: 'Report Submitted WhatsApp',
    channel: 'whatsapp',
    body: '✅ *Audit Report Submitted*\n\nTitle: {{audit_title}}\nEmployer: {{employer_name}}\nAuditor: {{auditor_name}}\nSubmitted: {{submitted_date}}\n\nReview: {{report_url}}',
    variables: ['audit_title', 'employer_name', 'auditor_name', 'submitted_date', 'report_url'],
    category: 'REPORT',
  },
  'whatsapp.payslip': {
    code: 'whatsapp.payslip',
    name: 'Payslip Published WhatsApp',
    channel: 'whatsapp',
    body: '💰 *Your Payslip is Ready!*\n\nMonth: {{month_year}}\nNet Pay: Rs.{{net_pay}}\n\nDownload: {{payslip_url}}',
    variables: ['month_year', 'net_pay', 'payslip_url'],
    category: 'PAYROLL',
  },
  'whatsapp.compliance_expiry': {
    code: 'whatsapp.compliance_expiry',
    name: 'Compliance Expiry WhatsApp',
    channel: 'whatsapp',
    body: '⚠️ *Document Expiring Soon*\n\n{{document_name}}\nExpiry: {{expiry_date}}\nDays Remaining: {{days_remaining}}\n\nRenew Now: {{document_url}}',
    variables: ['document_name', 'expiry_date', 'days_remaining', 'document_url'],
    category: 'COMPLIANCE',
  },
  'whatsapp.meeting_reminder': {
    code: 'whatsapp.meeting_reminder',
    name: 'Audit End Meeting Reminder WhatsApp',
    channel: 'whatsapp',
    body: '📅 *Audit End Meeting Reminder*\n\nAudit: {{audit_title}}\nDate: {{meeting_date}}\nTime: {{meeting_time}}\nVenue: {{location}}\n\nSee you there!',
    variables: ['audit_title', 'meeting_date', 'meeting_time', 'location'],
    category: 'AUDIT',
  },
};

/** Replaces {{merge_fields}}; unknown placeholders collapse to an empty string. */
export function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, key: string) => {
    const value = key.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part];
      return undefined;
    }, data);
    if (value === null || value === undefined) return '';
    return String(value);
  });
}

export function getTemplate(code: string): TemplateDefinition | null {
  return TEMPLATES[code] ?? null;
}

export function templatesByChannel(channel: TemplateDefinition['channel']): TemplateDefinition[] {
  return Object.values(TEMPLATES).filter((t) => t.channel === channel);
}

/** Variables referenced in a string but not supplied — surfaced as a warning. */
export function findMissingVariables(template: string, data: Record<string, unknown>): string[] {
  const found = new Set<string>();
  for (const match of template.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) {
    const key = match[1];
    const value = key.split('.').reduce<unknown>((acc, part) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part];
      return undefined;
    }, data);
    if (value === undefined || value === null || value === '') found.add(key);
  }
  return [...found];
}
