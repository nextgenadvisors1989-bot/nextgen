/**
 * Role definitions and the platform permission catalogue.
 * `name` follows the `<module>.<action>` convention and is what the API layer checks.
 */

export const ROLE_DEFINITIONS = [
  { slug: 'super_admin', name: 'Super Administrator', description: 'Unrestricted platform access including settings and backups', dashboard: '/admin/dashboard' },
  { slug: 'admin', name: 'Administrator', description: 'Manages employers, auditors, audits, compliance and CMS', dashboard: '/admin/dashboard' },
  { slug: 'auditor', name: 'Auditor', description: 'Executes assigned audits and submits reports', dashboard: '/auditor/dashboard' },
  { slug: 'employer', name: 'Employer', description: 'Company administrator managing employees, payroll and compliance', dashboard: '/employer/dashboard' },
  { slug: 'employee', name: 'Employee', description: 'Self-service access to profile, attendance and payslips', dashboard: '/employee/dashboard' },
  { slug: 'verifier', name: 'Verifier', description: 'Reviews, approves or returns submitted reports', dashboard: '/verifier/dashboard' },
] as const;

export const PERMISSION_MODULES = [
  'dashboard', 'employer', 'company_unit', 'department', 'employee', 'employee_document',
  'auditor', 'auditor_type', 'role', 'permission', 'module', 'form', 'submission',
  'audit_assignment', 'audit_report', 'assessment', 'risk', 'study', 'work_permit',
  'compliance_act', 'compliance_rule', 'compliance_regulation', 'compliance_notification',
  'compliance_document', 'verifier', 'calendar', 'holiday', 'payroll', 'payslip', 'attendance',
  'leave', 'salary_structure', 'file', 'notification', 'cms_page', 'cms_media', 'cms_resource',
  'report', 'activity_log', 'settings', 'user', 'contact_enquiry', 'capar', 'capar_category', 'water_noc', 'billing', 'designation', 'evidence',
] as const;

export const PERMISSION_ACTIONS = [
  'create', 'read', 'update', 'delete', 'export', 'approve', 'reject', 'verify',
  'share', 'download', 'upload',
] as const;

export type PermissionModule = (typeof PERMISSION_MODULES)[number];
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

export function permissionName(module: string, action: string): string {
  return `${module}.${action}`;
}

/** Modules where read-only roles still need list access — used when generating grants. */
const VIEW_ONLY_MODULES: string[] = [
  'dashboard', 'calendar', 'holiday', 'notification', 'report', 'file', 'activity_log',
];

export interface RoleGrantRule {
  role: string;
  /** '*' means every action on every module. */
  all?: boolean;
  grants?: Record<string, PermissionAction[]>;
  denies?: string[];
}

/**
 * Default grants. `super_admin` is intentionally unrestricted; other roles get
 * the minimum needed for their panel, and finer control is via the permissions matrix UI.
 */
export const DEFAULT_ROLE_GRANTS: RoleGrantRule[] = [
  { role: 'super_admin', all: true },
  {
    role: 'admin',
    denies: ['settings.delete', 'user.delete'],
    grants: Object.fromEntries([
      ...PERMISSION_MODULES.map((m) => [m, ['create', 'read', 'update', 'export'] as PermissionAction[]]),
      ['employer', ['create', 'read', 'update', 'delete', 'export'] as PermissionAction[]],
      ['employee', ['create', 'read', 'update', 'delete', 'export'] as PermissionAction[]],
      ['auditor', ['create', 'read', 'update', 'delete', 'export'] as PermissionAction[]],
      ['audit_assignment', ['create', 'read', 'update', 'delete', 'export'] as PermissionAction[]],
      ['audit_report', ['create', 'read', 'update', 'delete', 'export', 'approve', 'reject'] as PermissionAction[]],
      // The compliance registers are edited and culled by hand, so the admin
      // role keeps delete on them (unlike the generic module default) and may
      // verify an employer's document against the original.
      ['compliance_act', ['create', 'read', 'update', 'delete', 'export'] as PermissionAction[]],
      ['compliance_rule', ['create', 'read', 'update', 'delete', 'export'] as PermissionAction[]],
      ['compliance_regulation', ['create', 'read', 'update', 'delete', 'export'] as PermissionAction[]],
      ['compliance_notification', ['create', 'read', 'update', 'delete', 'export'] as PermissionAction[]],
      ['compliance_document', ['create', 'read', 'update', 'delete', 'export', 'verify', 'upload', 'download'] as PermissionAction[]],
      ['verifier', ['create', 'read', 'update', 'approve', 'reject'] as PermissionAction[]],
      // The platform's own calendar and the holiday master are curated by hand:
      // an event created by mistake, or a holiday declared twice, must be
      // removable, which the generic module default does not allow.
      ['calendar', ['create', 'read', 'update', 'delete', 'export', 'approve'] as PermissionAction[]],
      ['holiday', ['create', 'read', 'update', 'delete', 'export'] as PermissionAction[]],
      // Payroll is the one register where the generic default is not enough: a
      // payslip is downloaded and reprinted, attendance is bulk-uploaded and
      // corrected a day later, leave is approved or refused, and a salary
      // structure set by mistake is removable before it has ever been paid on.
      ['payroll', ['create', 'read', 'update', 'export', 'approve'] as PermissionAction[]],
      ['payslip', ['create', 'read', 'update', 'export', 'download', 'approve'] as PermissionAction[]],
      ['attendance', ['create', 'read', 'update', 'delete', 'export', 'upload'] as PermissionAction[]],
      ['leave', ['create', 'read', 'update', 'delete', 'export', 'approve', 'reject'] as PermissionAction[]],
      ['salary_structure', ['create', 'read', 'update', 'delete'] as PermissionAction[]],
      ['file', ['create', 'read', 'update', 'delete', 'download', 'upload', 'share'] as PermissionAction[]],
      ['settings', ['read', 'update'] as PermissionAction[]],
      // CAPAR: the admin reads every report, verifies and approves it, and curates the finding categories.
      ['capar', ['create', 'read', 'update', 'delete', 'export', 'download', 'upload', 'verify', 'approve', 'reject'] as PermissionAction[]],
      ['capar_category', ['create', 'read', 'update', 'delete'] as PermissionAction[]],
      ['billing', ['create', 'read', 'update', 'delete', 'export', 'download'] as PermissionAction[]],
      ['designation', ['create', 'read', 'update', 'delete', 'export'] as PermissionAction[]],
      ['evidence', ['create', 'read', 'update', 'delete', 'download', 'upload'] as PermissionAction[]],
      // Groundwater NOC register and the water meter log.
      ['water_noc', ['create', 'read', 'update', 'delete', 'export', 'download', 'upload'] as PermissionAction[]],
    ]),
  },
  {
    role: 'auditor',
    grants: {
      dashboard: ['read'],
      auditor: ['read', 'update'],
      audit_assignment: ['read', 'update'],
      audit_report: ['create', 'read', 'update', 'export', 'download'],
      module: ['read'],
      form: ['read'],
      submission: ['create', 'read', 'update', 'delete', 'download'],
      assessment: ['create', 'read', 'update'],
      risk: ['create', 'read', 'update'],
      study: ['create', 'read', 'update'],
      work_permit: ['create', 'read', 'update'],
      // An auditor writes the CAPAR for the facilities it audits and may discard a draft it started.
      capar: ['create', 'read', 'update', 'delete', 'export', 'download', 'upload'],
      capar_category: ['read'],
      // The employer's submitted document pack: an auditor reads and downloads the sections the administrator gave it.
      evidence: ['read', 'download'],
      // Only auditors of the Water type may use it: the service checks the auditor type, the role grant just opens the door.
      water_noc: ['create', 'read', 'update', 'export', 'download', 'upload'],
      employer: ['read'],
      employee: ['read'],
      // An auditor maintains the meetings that hang off its own audits: it may
      // add one, move it, and remove one it created by mistake.
      calendar: ['read', 'create', 'update', 'delete', 'export'],
      holiday: ['read'],
      notification: ['read', 'update'],
      file: ['create', 'read', 'upload', 'download'],
      report: ['read', 'export', 'download'],
      activity_log: ['read'],
    },
  },
  {
    role: 'employer',
    grants: {
      dashboard: ['read'],
      employer: ['read', 'update'],
      company_unit: ['create', 'read', 'update', 'delete'],
      department: ['create', 'read', 'update', 'delete'],
      employee: ['create', 'read', 'update', 'delete', 'export'],
      employee_document: ['create', 'read', 'update', 'delete', 'upload', 'download'],
      audit_assignment: ['read'],
      audit_report: ['read', 'download'],
      capar: ['read', 'download'],
      water_noc: ['read', 'download'],
      billing: ['read', 'download'],
      designation: ['create', 'read', 'update', 'delete'],
      // The employer fills its own document pack, attaches files and submits it.
      evidence: ['create', 'read', 'update', 'delete', 'download', 'upload'],
      module: ['read'],
      form: ['read'],
      submission: ['create', 'read', 'update', 'delete', 'download', 'upload'],
      compliance_document: ['create', 'read', 'update', 'delete', 'upload', 'download'],
      payroll: ['create', 'read', 'update', 'export'],
      payslip: ['create', 'read', 'update', 'export', 'download'],
      attendance: ['create', 'read', 'update', 'delete', 'export', 'upload'],
      leave: ['create', 'read', 'update', 'delete', 'export', 'approve', 'reject'],
      salary_structure: ['create', 'read', 'update', 'delete'],
      calendar: ['read', 'export'],
      holiday: ['read'],
      notification: ['read', 'update'],
      file: ['create', 'read', 'update', 'delete', 'upload', 'download'],
      report: ['read', 'export', 'download'],
      activity_log: ['read'],
      settings: ['read', 'update'],
      employee_document_download: ['download'],
    },
  },
  {
    role: 'employee',
    grants: {
      dashboard: ['read'],
      // Self-service writes: the employee-panel routes derive the employee id from
      // the session and never accept one from the body, so `update` here only ever
      // reaches the caller's own record.
      employee: ['read', 'update'],
      employee_document: ['read', 'download'],
      payslip: ['read', 'download'],
      module: ['read'],
      form: ['read'],
      submission: ['create', 'read', 'update', 'download', 'upload'],
      attendance: ['read'],
      leave: ['create', 'read', 'update'],
      notification: ['read', 'update'],
      file: ['read', 'download', 'upload'],
      calendar: ['read'],
      holiday: ['read'],
      settings: ['read', 'update'],
    },
  },
  {
    role: 'verifier',
    grants: {
      dashboard: ['read'],
      auditor: ['read'],
      audit_assignment: ['read'],
      audit_report: ['read', 'update', 'export', 'download', 'verify', 'approve', 'reject'],
      verifier: ['read', 'update', 'verify', 'approve', 'reject'],
      capar: ['read', 'export', 'download', 'verify', 'approve', 'reject'],
      capar_category: ['read'],
      employer: ['read'],
      module: ['read'],
      form: ['read'],
      submission: ['read', 'download', 'verify', 'approve', 'reject'],
      notification: ['read', 'update'],
      file: ['read', 'download'],
      report: ['read', 'export', 'download'],
      activity_log: ['read'],
      calendar: ['read'],
      holiday: ['read'],
    },
  },
];

export const ROLE_DASHBOARD: Record<string, string> = Object.fromEntries(
  ROLE_DEFINITIONS.map((r) => [r.slug, r.dashboard])
);

export const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_DEFINITIONS.map((r) => [r.slug, r.name])
);

export function dashboardForRole(roleSlug: string | null | undefined): string {
  if (!roleSlug) return '/login';
  return ROLE_DASHBOARD[roleSlug] ?? '/login';
}

export function dashboardForRoles(roleSlugs: string[]): string {
  for (const role of ['super_admin', 'admin', 'auditor', 'employer', 'verifier', 'employee']) {
    if (roleSlugs.includes(role)) return ROLE_DASHBOARD[role];
  }
  return '/login';
}

/** Role slug -> permission names, materialised for the seed script. */
export function grantsForRole(roleSlug: string): string[] {
  const rule = DEFAULT_ROLE_GRANTS.find((r) => r.role === roleSlug);
  if (!rule) return [];
  if (rule.all) {
    return PERMISSION_MODULES.flatMap((m) => PERMISSION_ACTIONS.map((a) => permissionName(m, a)));
  }
  const names = new Set<string>();
  for (const [module, actions] of Object.entries(rule.grants ?? {})) {
    for (const action of actions) names.add(permissionName(module, action));
  }
  // Every role may read the dashboard/calendar/notification surface.
  for (const module of VIEW_ONLY_MODULES) names.add(permissionName(module, 'read'));
  for (const denied of rule.denies ?? []) names.delete(denied);
  return [...names];
}

export function hasPermission(userPermissions: string[], required: string | string[]): boolean {
  if (userPermissions.includes('*')) return true;
  const needed = Array.isArray(required) ? required : [required];
  return needed.some((perm) => userPermissions.includes(perm));
}

export function hasAllPermissions(userPermissions: string[], required: string[]): boolean {
  if (userPermissions.includes('*')) return true;
  return required.every((perm) => userPermissions.includes(perm));
}
