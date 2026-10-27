/** Application-wide constants shared by UI, services, validators and PDFs. */

export const APP_NAME = process.env.APP_NAME ?? 'ComplianceOS';
export const APP_URL = process.env.APP_URL ?? 'http://localhost:3000';

export const COMPANY_LEGAL = {
  name: 'ComplianceOS Technologies Private Limited',
  address: '4th Floor, Anna Salai, Chennai 600002, Tamil Nadu, India',
  email: 'support@complianceos.example',
  phone: '+91 44 4000 0000',
  gstin: '33AABCC1234D1Z5',
  cin: 'U72900TN2019PTC123456',
};

export const PERMISSION_DENIED_MESSAGE = 'You do not have permission to perform this action';

export const RECORD_STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  suspended: 'Suspended',
  resigned: 'Resigned',
  terminated: 'Terminated',
};

export const STATUS_BADGE_CLASSES: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  inactive: 'bg-slate-100 text-slate-600',
  suspended: 'bg-amber-100 text-amber-700',
  resigned: 'bg-blue-100 text-blue-700',
  terminated: 'bg-red-100 text-red-700',
  Draft: 'bg-slate-100 text-slate-700',
  Calculated: 'bg-blue-100 text-blue-700',
  Approved: 'bg-emerald-100 text-emerald-700',
  Locked: 'bg-purple-100 text-purple-700',
  Paid: 'bg-teal-100 text-teal-700',
  Cancelled: 'bg-gray-100 text-gray-600',
  Pending: 'bg-amber-100 text-amber-700',
  Failed: 'bg-red-100 text-red-700',
  Valid: 'bg-emerald-100 text-emerald-700',
  'Expiring Soon': 'bg-amber-100 text-amber-700',
  Expired: 'bg-red-100 text-red-700',
  'Applied for Renewal': 'bg-blue-100 text-blue-700',
  Open: 'bg-amber-100 text-amber-700',
  Closed: 'bg-slate-100 text-slate-600',
};

export const PRIORITY_BADGE_CLASSES: Record<string, string> = {
  Low: 'bg-slate-100 text-slate-600',
  Medium: 'bg-blue-100 text-blue-700',
  High: 'bg-orange-100 text-orange-700',
  Urgent: 'bg-red-100 text-red-700',
};

export const RISK_LEVEL_CLASSES: Record<string, string> = {
  Low: 'bg-emerald-100 text-emerald-700',
  Medium: 'bg-amber-100 text-amber-700',
  High: 'bg-orange-100 text-orange-700',
  Extreme: 'bg-red-100 text-red-700',
};

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
export const MARITAL_STATUSES = ['Single', 'Married', 'Divorced', 'Widowed'];
export const GENDERS = ['Male', 'Female', 'Other'];
export const EMPLOYEE_CATEGORIES = ['Worker', 'Staff'];
export const STAYING_OPTIONS = ['Own', 'Rented'];
export const WAGE_TYPES = ['Per Day', 'Per Month'];
export const WEEKLY_OFFS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Rotational'];
export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const PAYROLL_STATUSES = ['Draft', 'Calculated', 'Approved', 'Locked', 'Paid', 'Cancelled'];
export const ATTENDANCE_STATUSES = [
  'Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Weekly Off', 'On Duty', 'Late', 'Comp Off',
];
export const WORK_PERMIT_TYPES = [
  'Hot Work', 'Cold Work', 'Confined Space', 'Height Work', 'Electrical', 'Excavation',
  'Lifting', 'Radiation', 'Chemical', 'General',
];
export const STUDY_TYPES = ['HAZOP', 'HACCP', 'FMEA', 'FTA', 'ETA', 'LOPA', 'BOWTIE', 'WHAT_IF', 'OTHER'];
export const ASSESSMENT_TYPES = ['HIRA', 'JSA', 'JHA', 'ENVIRONMENTAL', 'OCCUPATIONAL_HEALTH', 'FIRE', 'ERGONOMIC', 'OTHER'];
export const RISK_CATEGORIES = [
  'Physical', 'Chemical', 'Biological', 'Ergonomic', 'Mechanical', 'Electrical', 'Fire', 'Psychological', 'Other',
];
export const RISK_LEVELS = ['Low', 'Medium', 'High', 'Extreme'];
export const CALENDAR_EVENT_TYPES = [
  'AUDIT', 'AUDIT_END_MEETING', 'REPORT_DUE', 'COMPLIANCE_EXPIRY', 'PAYROLL_RUN', 'LEAVE',
  'HOLIDAY', 'TRAINING', 'MEETING', 'INSPECTION', 'PERMIT_VALIDITY', 'REMINDER', 'OTHER',
];

/** Statutory defaults (India) — overridable per employer in salary structure. */
export const STATUTORY_DEFAULTS = {
  pfEmployeePercent: 12,
  pfEmployerPercent: 12,
  pfWageCeiling: 15000,
  epsPercent: 8.33,
  edliPercent: 0.5,
  pfAdminPercent: 0.5,
  esiEmployeePercent: 0.75,
  esiEmployerPercent: 3.25,
  esiWageCeiling: 21000,
  bonusPercent: 8.33,
  bonusWageCeiling: 7000,
  gratuityFactor: 15 / 26,
  gratuityMinimumYears: 5,
  overtimeRateMultiplier: 2,
  normalWorkingHoursPerDay: 8,
  normalWorkingDaysPerMonth: 26,
};

export const COMPLIANCE_REMINDER_DAYS = [90, 60, 30, 15, 7, 1];
export const AUDIT_REMINDER_DAYS = [7, 3, 1];
