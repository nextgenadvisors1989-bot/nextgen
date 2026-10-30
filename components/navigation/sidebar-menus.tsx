import type { MenuSection } from './sidebar';
import { Icon } from './sidebar';
import { createElement } from 'react';

const icon = (name: string) => createElement(Icon, { name });

/** Admin panel menu — every module from the specification. */
export function adminMenu(counts: { employees?: number; employers?: number; pendingVerification?: number; openAudits?: number } = {}): MenuSection[] {
  return [
    {
      items: [
        { label: 'Dashboard', href: '/admin/dashboard', icon: icon('dashboard'), permission: 'dashboard.read' },
      ],
    },
    {
      title: 'Organisation',
      items: [
        {
          label: 'Employers', icon: icon('building'), badge: counts.employers,
          children: [
            { label: 'All Employers', href: '/admin/employers' },
            { label: 'Create Employer', href: '/admin/employers/create' },
          ],
        },
        {
          label: 'Employees', icon: icon('users'), badge: counts.employees,
          children: [
            { label: 'All Employees', href: '/admin/employees' },
            { label: 'Create Employee', href: '/admin/employees/create' },
            { label: 'Designation Master', href: '/admin/designations' },
          ],
        },
        {
          label: 'Auditors', icon: icon('userCheck'),
          children: [
            { label: 'All Auditors', href: '/admin/auditors' },
            { label: 'Create Auditor', href: '/admin/auditors/create' },
            { label: 'Auditor Types', href: '/admin/auditor-types' },
          ],
        },
      ],
    },
    {
      title: 'Audit Operations',
      items: [
        {
          label: 'Audit Assignments', icon: icon('clipboard'), badge: counts.openAudits,
          children: [
            { label: 'All Assignments', href: '/admin/audit-assignments' },
            { label: 'Create Assignment', href: '/admin/audit-assignments/create' },
          ],
        },
        {
          label: 'Audit Reports', icon: icon('fileText'),
          children: [
            { label: 'All Reports', href: '/admin/audit-reports' },
            { label: 'Verifier Queue', href: '/admin/verifier-queue', badge: counts.pendingVerification },
          ],
        },
        { label: 'Audit and Assessment', href: '/admin/compliance/register', icon: icon('clipboard') },
        {
          label: 'CAPAR Reports', icon: icon('shield'),
          children: [
            { label: 'All CAPAR Reports', href: '/admin/capar' },
            { label: 'CAPAR Management', href: '/admin/capar/management' },
            { label: 'Categories', href: '/admin/capar/categories' },
            { label: 'Audit Documents', href: '/admin/audit-documents' },
          ],
        },
        { label: 'Groundwater NOC', href: '/admin/water-noc', icon: icon('alert') },
        { label: 'Calendar', href: '/admin/calendar', icon: icon('calendar') },
        {
          label: 'Assessments & Risks', icon: icon('alert'),
          children: [
            { label: 'Assessments', href: '/admin/assessments' },
            { label: 'Risk Reports', href: '/admin/risks' },
            { label: 'Studies (HAZOP / HACCP)', href: '/admin/studies' },
            { label: 'Work Permits', href: '/admin/work-permits' },
          ],
        },
      ],
    },
    {
      title: 'Compliance',
      items: [
        { label: 'Act & Compliance', href: '/admin/compliance/act-compliance', icon: icon('gavel') },
        {
          label: 'Acts, Rules & Notices', icon: icon('gavel'),
          children: [
            { label: 'Acts', href: '/admin/compliance/acts' },
            { label: 'Rules', href: '/admin/compliance/rules' },
            { label: 'Regulations', href: '/admin/compliance/regulations' },
            { label: 'Notifications', href: '/admin/compliance/notifications' },
            { label: 'Legal Register', href: '/admin/compliance/documents' },
          ],
        },
      ],
    },
    {
      title: 'HR & Payroll',
      items: [
        { label: 'Payroll Monitoring', href: '/admin/payroll-monitoring', icon: icon('rupee') },
        { label: 'Attendance Monitoring', href: '/admin/attendance-monitoring', icon: icon('clock') },
        { label: 'Leave Monitoring', href: '/admin/leave-monitoring', icon: icon('calendar') },
      ],
    },
    {
      title: 'Billing',
      items: [
        { label: 'Quotations & Invoices', href: '/admin/billing', icon: icon('rupee') },
      ],
    },
    {
      title: 'Content & System',
      items: [
        {
          label: 'CMS', icon: icon('globe'),
          children: [
            { label: 'Pages', href: '/admin/cms/pages' },
            { label: 'Media Library', href: '/admin/cms/media' },
            { label: 'Resources', href: '/admin/cms/resources' },
            { label: 'Contact Enquiries', href: '/admin/contact-enquiries' },
          ],
        },
        { label: 'Reports', href: '/admin/reports', icon: icon('chart') },
        { label: 'Files', href: '/admin/files', icon: icon('folder') },
        {
          label: 'Notifications', icon: icon('bell'),
          children: [
            { label: 'All Notifications', href: '/admin/notifications' },
            { label: 'Templates', href: '/admin/notifications/templates' },
          ],
        },
        {
          label: 'Logs & Audit', icon: icon('history'),
          children: [
            { label: 'Activity Logs', href: '/admin/activity-logs' },
            { label: 'Audit Trails', href: '/admin/audit-trails' },
            { label: 'Login Attempts', href: '/admin/login-attempts' },
            { label: 'Error Logs', href: '/admin/error-logs' },
          ],
        },
        {
          label: 'Dynamic Modules', icon: icon('layers'),
          children: [
            { label: 'Modules & Forms', href: '/admin/dynamic-modules' },
            { label: 'Submissions', href: '/admin/dynamic-submissions' },
          ],
        },
      ],
    },
    {
      title: 'Administration',
      items: [
        {
          label: 'Users', icon: icon('users'),
          children: [
            { label: 'All Users', href: '/admin/users' },
            { label: 'Create User', href: '/admin/users/create' },
          ],
        },
        {
          label: 'Roles & Permissions', icon: icon('key'),
          children: [
            { label: 'Roles', href: '/admin/roles' },
            { label: 'Create Role', href: '/admin/roles/create' },
            { label: 'Permissions Matrix', href: '/admin/permissions' },
          ],
        },
        {
          label: 'Settings', icon: icon('settings'),
          children: [
            { label: 'System Settings', href: '/admin/settings' },
            { label: 'Company Settings', href: '/admin/settings/company-settings' },
            { label: 'Email Settings', href: '/admin/settings/email-settings' },
            { label: 'SMS Settings', href: '/admin/settings/sms-settings' },
            { label: 'WhatsApp Settings', href: '/admin/settings/whatsapp-settings' },
            { label: 'Backup Settings', href: '/admin/settings/backup-settings' },
            { label: 'Audit Defaults', href: '/admin/settings/audit-settings' },
          ],
        },
      ],
    },
  ];
}

export function auditorMenu(counts: { openAudits?: number; isWater?: boolean } = {}): MenuSection[] {
  return [
    { items: [{ label: 'Dashboard', href: '/auditor/dashboard', icon: icon('dashboard') }] },
    {
      title: 'My Work',
      items: [
        {
          label: 'My Audits', icon: icon('clipboard'), badge: counts.openAudits,
          children: [
            { label: 'Assigned Audits', href: '/auditor/audits' },
            { label: 'My Reports', href: '/auditor/reports' },
          ],
        },
        { label: 'Audit Documents', href: '/auditor/audit-documents', icon: icon('folder') },
        { label: 'Audit and Assessment', href: '/auditor/compliance', icon: icon('clipboard') },
        { label: 'Act & Compliance', href: '/auditor/act-compliance', icon: icon('gavel') },
        { label: 'CAPAR Reports', href: '/auditor/capar', icon: icon('shield') },
        ...(counts.isWater ? [{ label: 'Groundwater NOC', href: '/auditor/water-noc', icon: icon('alert') }] : []),
        {
          label: 'Assessments & Risks', icon: icon('alert'),
          children: [
            { label: 'Assessments', href: '/auditor/assessments' },
            { label: 'Risk Reports', href: '/auditor/risks' },
            { label: 'Studies', href: '/auditor/studies' },
            { label: 'Work Permits', href: '/auditor/work-permits' },
          ],
        },
        {
          label: 'Assigned Modules', icon: icon('layers'),
          children: [
            { label: 'My Modules & Forms', href: '/auditor/modules' },
            { label: 'My Submissions', href: '/auditor/submissions' },
          ],
        },
        { label: 'Calendar', href: '/auditor/calendar', icon: icon('calendar') },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'My Profile', href: '/auditor/profile', icon: icon('userCheck') },
        { label: 'Notifications', href: '/auditor/notifications', icon: icon('bell') },
        { label: 'Settings', href: '/auditor/settings', icon: icon('settings') },
      ],
    },
  ];
}

export function employerMenu(counts: { employees?: number; upcomingAudits?: number; expiringDocuments?: number } = {}): MenuSection[] {
  return [
    { items: [{ label: 'Dashboard', href: '/employer/dashboard', icon: icon('dashboard') }] },
    {
      title: 'Organisation',
      items: [
        { label: 'Company Profile', href: '/employer/profile', icon: icon('building') },
        { label: 'Factory Profile', href: '/employer/factory-profile', icon: icon('factory') },
        { label: 'Audit Documents', href: '/employer/audit-documents', icon: icon('folder') },
        { label: 'Units', href: '/employer/units', icon: icon('layers') },
        { label: 'Departments', href: '/employer/departments', icon: icon('folder') },
        {
          label: 'Employees', icon: icon('users'), badge: counts.employees,
          children: [
            { label: 'All Employees', href: '/employer/employees' },
            { label: 'Add Employee', href: '/employer/employees/create' },
            { label: 'Designations', href: '/employer/designations' },
          ],
        },
      ],
    },
    {
      title: 'HR & Payroll',
      items: [
        {
          label: 'Attendance', icon: icon('clock'),
          children: [
            { label: 'Attendance Register', href: '/employer/attendance' },
            { label: 'Permission Requests', href: '/employer/attendance/permissions' },
            { label: 'Bulk Upload', href: '/employer/attendance/upload' },
          ],
        },
        { label: 'Leave Ledger', href: '/employer/leave-ledger', icon: icon('calendar') },
        { label: 'Salary Structure', href: '/employer/salary-structure', icon: icon('rupee') },
        {
          label: 'Payroll', icon: icon('rupee'),
          children: [
            { label: 'Payroll Runs', href: '/employer/payroll' },
            { label: 'Run Payroll', href: '/employer/payroll/run' },
            { label: 'History', href: '/employer/payroll/history' },
            { label: 'Payslips', href: '/employer/payroll/payslips' },
            { label: 'CTC Chart', href: '/employer/payroll/ctc-chart' },
          ],
        },
      ],
    },
    {
      title: 'Audits & Compliance',
      items: [
        { label: 'Audits', href: '/employer/audits', icon: icon('clipboard'), badge: counts.upcomingAudits },
        { label: 'Audit Reports', href: '/employer/audit-reports', icon: icon('fileText') },
        { label: 'CAPAR Reports', href: '/employer/capar', icon: icon('shield') },
        { label: 'Compliance Documents', href: '/employer/compliance-documents', icon: icon('shield'), badge: counts.expiringDocuments },
        { label: 'Groundwater NOC', href: '/employer/water-noc', icon: icon('alert') },
        { label: 'Modules & Forms', href: '/employer/modules', icon: icon('layers') },
        { label: 'My Submissions', href: '/employer/submissions', icon: icon('fileText') },
        { label: 'Calendar', href: '/employer/calendar', icon: icon('calendar') },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Billing', href: '/employer/billing', icon: icon('rupee') },
        { label: 'Downloads', href: '/employer/downloads', icon: icon('download') },
        { label: 'Notifications', href: '/employer/notifications', icon: icon('bell') },
        { label: 'Settings', href: '/employer/settings', icon: icon('settings') },
      ],
    },
  ];
}

export function employeeMenu(): MenuSection[] {
  return [
    { items: [{ label: 'Dashboard', href: '/employee/dashboard', icon: icon('dashboard') }] },
    {
      title: 'My Information',
      items: [
        { label: 'My Profile', href: '/employee/profile', icon: icon('userCheck') },
        { label: 'Personal Details', href: '/employee/personal-details', icon: icon('fileText') },
        { label: 'Employment Details', href: '/employee/employment-details', icon: icon('building') },
        { label: 'Service Record', href: '/employee/service-record', icon: icon('award') },
      ],
    },
    {
      title: 'Attendance & Pay',
      items: [
        { label: 'Attendance', href: '/employee/attendance', icon: icon('clock') },
        {
          label: 'Leave', icon: icon('calendar'),
          children: [
            { label: 'Leave Balance', href: '/employee/leave' },
            { label: 'Leave History', href: '/employee/leave/history' },
          ],
        },
        { label: 'Payslips', href: '/employee/payslips', icon: icon('rupee') },
        { label: 'Documents', href: '/employee/documents', icon: icon('folder') },
        { label: 'Calendar', href: '/employee/calendar', icon: icon('calendar') },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Notifications', href: '/employee/notifications', icon: icon('bell') },
        { label: 'Settings', href: '/employee/settings', icon: icon('settings') },
      ],
    },
  ];
}

export function verifierMenu(counts: { pending?: number } = {}): MenuSection[] {
  return [
    { items: [{ label: 'Dashboard', href: '/verifier/dashboard', icon: icon('dashboard') }] },
    {
      title: 'Verification',
      items: [
        { label: 'Assigned Reports', href: '/verifier/reports', icon: icon('verify'), badge: counts.pending },
        { label: 'CAPAR Reports', href: '/verifier/capar', icon: icon('shield') },
        { label: 'Module Submissions', href: '/verifier/submissions', icon: icon('layers') },
        { label: 'Approved', href: '/verifier/approved', icon: icon('verify') },
        { label: 'Rejected', href: '/verifier/rejected', icon: icon('alert') },
      ],
    },
    {
      title: 'Account',
      items: [
        { label: 'Notifications', href: '/verifier/notifications', icon: icon('bell') },
        { label: 'Settings', href: '/verifier/settings', icon: icon('settings') },
      ],
    },
  ];
}
