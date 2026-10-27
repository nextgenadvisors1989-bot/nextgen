'use client';

import { usePathname } from 'next/navigation';
import { Breadcrumb } from '@/components/ui/breadcrumb';

const LABELS: Record<string, string> = {
  admin: 'Admin', auditor: 'Auditor', employer: 'Employer', employee: 'Employee', verifier: 'Verifier',
  dashboard: 'Dashboard', employers: 'Employers', employees: 'Employees', auditors: 'Auditors',
  'auditor-types': 'Auditor Types', 'audit-assignments': 'Audit Assignments', 'audit-reports': 'Audit Reports',
  assessments: 'Assessments', risks: 'Risks', studies: 'Studies', 'work-permits': 'Work Permits',
  compliance: 'Compliance', acts: 'Acts', rules: 'Rules', regulations: 'Regulations',
  notifications: 'Notifications', documents: 'Documents', 'verifier-queue': 'Verifier Queue',
  calendar: 'Calendar', 'payroll-monitoring': 'Payroll Monitoring', 'attendance-monitoring': 'Attendance Monitoring',
  'leave-monitoring': 'Leave Monitoring', files: 'Files', cms: 'CMS', pages: 'Pages', media: 'Media',
  resources: 'Resources', reports: 'Reports', 'activity-logs': 'Activity Logs', settings: 'Settings',
  'company-settings': 'Company Settings', 'email-settings': 'Email Settings', 'sms-settings': 'SMS Settings',
  'whatsapp-settings': 'WhatsApp Settings', 'backup-settings': 'Backup Settings', roles: 'Roles',
  permissions: 'Permission Matrix', users: 'Users', 'dynamic-modules': 'Dynamic Modules', create: 'Create', edit: 'Edit',
  profile: 'Profile', units: 'Units', departments: 'Departments', attendance: 'Attendance',
  'leave-ledger': 'Leave Ledger', 'salary-structure': 'Salary Structure', payroll: 'Payroll',
  'audit-settings': 'Audit Settings', 'audit-trails': 'Audit Trails', 'login-attempts': 'Login Attempts',
  'error-logs': 'Error Logs', 'dynamic-submissions': 'Dynamic Submissions', audits: 'My Audits',
  start: 'Start', draft: 'Draft', review: 'Review', sections: 'Blocks',
  payslips: 'Payslips', history: 'History', 'compliance-documents': 'Compliance Documents',
  downloads: 'Downloads', 'service-record': 'Service Record', 'personal-details': 'Personal Details',
  'employment-details': 'Employment Details', leave: 'Leave', modules: 'Modules', forms: 'Forms',
  submissions: 'Submissions', preview: 'Preview', pdf: 'PDF', templates: 'Templates',
};

/** Derives breadcrumbs from the URL so every page gets them without boilerplate. */
export function AutoBreadcrumbs({ overrides = {} }: { overrides?: Record<string, string> }) {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);

  const items = segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join('/')}`;
    const isId = /^\d+$/.test(segment);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(segment);
    const label = isId || isUuid
      ? 'Details'
      : overrides[segment] ?? LABELS[segment] ?? segment.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    return { label, href: index === segments.length - 1 ? undefined : href };
  });

  return <Breadcrumb items={[{ label: 'Home', href: '/' }, ...items]} />;
}
