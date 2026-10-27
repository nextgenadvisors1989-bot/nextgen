export type PayrollRunStatus = 'Draft' | 'Calculated' | 'Approved' | 'Locked' | 'Paid' | 'Cancelled';
export type AttendanceStatus = 'Present' | 'Absent' | 'Half Day' | 'Leave' | 'Holiday' | 'Weekly Off' | 'On Duty' | 'Late' | 'Comp Off';

export interface PayrollHead {
  id: number;
  head_code: string;
  head_name: string;
  head_name_ta: string | null;
  head_type: 'Earning' | 'Deduction' | 'Employer Contribution';
  calculation_type: 'Fixed' | 'Percent of Basic' | 'Percent of Gross' | 'Formula' | 'Attendance Based';
  percent_value: number | string | null;
  is_statutory: boolean;
  is_taxable: boolean;
  show_on_payslip: boolean;
  sort_order: number;
  status: 'active' | 'inactive';
}

export interface PayrollRun {
  id: number;
  uuid: string;
  run_number: string;
  employer_id: number;
  unit_id: number | null;
  department_id: number | null;
  month: number;
  year: number;
  period_from: string;
  period_to: string;
  total_employees: number;
  total_gross: number | string;
  total_deductions: number | string;
  total_net: number | string;
  total_pf_employee: number | string;
  total_pf_employer: number | string;
  total_esi_employee: number | string;
  total_esi_employer: number | string;
  total_pt: number | string;
  status: PayrollRunStatus;
  processed_at: string | null;
  approved_at: string | null;
  locked_at: string | null;
  employer_name?: string;
  department_name?: string | null;
}

export interface Payslip {
  id: number;
  uuid: string;
  payslip_number: string;
  payroll_run_id: number;
  employer_id: number;
  employee_id: number;
  month: number;
  year: number;
  period_from: string;
  period_to: string;
  working_days: number | string;
  paid_days: number | string;
  lop_days: number | string;
  present_days: number | string;
  absent_days: number | string;
  leave_days: number | string;
  holiday_days: number | string;
  weekly_off_days: number | string;
  overtime_hours: number | string;
  overtime_amount: number | string;
  basic: number | string;
  da: number | string;
  hra: number | string;
  ta: number | string;
  pa: number | string;
  ea: number | string;
  npba: number | string;
  other_allowances: number | string;
  gross_earnings: number | string;
  pf_employee: number | string;
  pf_employer: number | string;
  esi_employee: number | string;
  esi_employer: number | string;
  professional_tax: number | string;
  lwf_amount: number | string;
  tds_amount: number | string;
  advance_deduction: number | string;
  other_deductions: number | string;
  total_deductions: number | string;
  net_pay: number | string;
  net_pay_in_words: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  ifsc_code: string | null;
  payment_status: 'Pending' | 'Paid' | 'Failed' | 'On Hold';
  is_published: boolean;
  employee_name?: string;
  employee_number?: string;
  designation?: string | null;
  department_name?: string | null;
  employer_name?: string;
  items?: PayslipItem[];
}

export interface PayslipItem {
  id?: number;
  head_code: string;
  head_name: string;
  head_name_ta?: string | null;
  head_type: 'Earning' | 'Deduction' | 'Employer Contribution';
  amount: number;
  is_statutory?: boolean;
}

export interface AttendanceRecord {
  id: number;
  employer_id: number;
  employee_id: number;
  attendance_date: string;
  month: number;
  year: number;
  status: AttendanceStatus;
  leave_type: string | null;
  in_time: string | null;
  out_time: string | null;
  worked_hours: number | string | null;
  overtime_hours: number | string;
  late_minutes: number;
  is_paid: boolean;
  remarks: string | null;
  source: 'Manual' | 'Bulk Upload' | 'Biometric' | 'Import';
  employee_name?: string;
  employee_number?: string;
  department_name?: string | null;
}

export interface LeaveLedger {
  id: number;
  employer_id: number;
  employee_id: number;
  leave_type_id: number;
  year: number;
  opening_balance: number | string;
  accrued: number | string;
  availed: number | string;
  encashed: number | string;
  lapsed: number | string;
  closing_balance: number | string;
  employee_name?: string;
  employee_number?: string;
  leave_type_name?: string;
  leave_type_code?: string;
}

export interface SalaryStructure {
  id: number;
  employer_id: number;
  employee_id: number;
  structure_name: string | null;
  effective_from: string;
  effective_to: string | null;
  basic: number | string;
  da: number | string;
  hra: number | string;
  ta: number | string;
  pa: number | string;
  ea: number | string;
  npba: number | string;
  other_allowances: number | string;
  gross_salary: number | string;
  wage_type: 'Per Day' | 'Per Month';
  daily_wage: number | string | null;
  pf_applicable: boolean;
  pf_employee_percent: number | string;
  pf_employer_percent: number | string;
  pf_wage_ceiling: number | string | null;
  vpf_percent: number | string;
  esi_applicable: boolean;
  esi_employee_percent: number | string;
  esi_employer_percent: number | string;
  esi_wage_ceiling: number | string | null;
  pt_state: string | null;
  pt_amount: number | string;
  lwf_applicable: boolean;
  lwf_amount: number | string;
  is_active: boolean;
  revision_number: number;
  employee_name?: string;
  employee_number?: string;
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const PAYSLIP_MONTHS_TA = [
  'ஜனவரி', 'பிப்ரவரி', 'மார்ச்', 'ஏப்ரல்', 'மே', 'ஜூன்',
  'ஜூலை', 'ஆகஸ்ட்', 'செப்டம்பர்', 'அக்டோபர்', 'நவம்பர்', 'டிசம்பர்',
] as const;
