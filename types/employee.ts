import type { AuditFields } from './api';

export type EmployeeStatus = 'active' | 'inactive' | 'terminated' | 'resigned';

export interface Employee extends AuditFields {
  id: number;
  uuid: string;
  employer_id: number;
  unit_id: number | null;
  department_id: number | null;
  employee_number: string;
  name: string;
  father_name: string | null;
  mother_name: string | null;
  spouse_name: string | null;
  sex: 'Male' | 'Female' | 'Other' | null;
  marital_status: 'Single' | 'Married' | 'Divorced' | 'Widowed' | null;
  religion: string | null;
  mother_tongue: string | null;
  blood_group: string | null;
  date_of_birth: string | null;
  languages_known: string | null;
  photo: string | null;
  aadhaar_number: string | null;
  pan_number: string | null;
  present_address: string | null;
  permanent_address: string | null;
  is_permanent_same_as_present: boolean;
  state: string | null;
  pincode: string | null;
  telephone: string | null;
  mobile: string | null;
  email: string | null;
  native_place: string | null;
  staying_in: 'Own' | 'Rented' | null;
  family_income_per_annum: string | number | null;
  date_of_joining: string | null;
  date_of_confirmation: string | null;
  post_applied_for: string | null;
  department: string | null;
  nature_of_work: string | null;
  designation: string | null;
  category: 'Worker' | 'Staff' | null;
  workforce_origin: 'State local' | 'Migrant' | null;
  employment_type: 'Permanent' | 'Temporary' | 'Contract' | null;
  grade: string | null;
  skill_grade: string | null;
  place_of_work: string | null;
  shift_relay: string | null;
  working_hours_from: string | null;
  working_hours_to: string | null;
  interval_lunch_time: string | null;
  tea_break: string | null;
  weekly_off: string | null;
  probation_months: number;
  basic_salary: string | number | null;
  da: string | number | null;
  hra: string | number | null;
  ta: string | number | null;
  pa: string | number | null;
  ea: string | number | null;
  npba: string | number | null;
  other_allowances: string | number | null;
  gross_salary: string | number | null;
  wage_type: 'Per Day' | 'Per Month' | null;
  expected_salary: string | number | null;
  pf_number: string | null;
  pf_effective_date: string | null;
  uan: string | null;
  esi_number: string | null;
  esi_dispensary: string | null;
  mediclaim_number: string | null;
  previous_pf_account_number: string | null;
  previous_employer_exit_date: string | null;
  scheme_certificate_number: string | null;
  pension_payment_order_number: string | null;
  is_international_worker: boolean;
  country: string | null;
  passport_number: string | null;
  passport_validity: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  ifsc_code: string | null;
  user_id: number | null;
  username: string | null;
  is_first_login: boolean;
  status: EmployeeStatus;
  date_of_resignation: string | null;
  date_of_relieving: string | null;
  resignation_reason: string | null;
  is_re_employment_eligible: boolean;
  re_employment_remarks: string | null;
  employer_name?: string;
  unit_name?: string | null;
  department_name?: string | null;
}

export interface EmployeeQualification {
  id: number;
  employee_id: number;
  qualification: string;
  specialization: string | null;
  institution: string | null;
  board_university: string | null;
  year_of_passing: string | null;
  percentage: string | null;
  grade: string | null;
  remarks: string | null;
}

export interface EmployeeExperience {
  id: number;
  employee_id: number;
  company_name: string;
  designation: string | null;
  department: string | null;
  date_from: string | null;
  date_to: string | null;
  total_period: string | null;
  last_salary: string | number | null;
  reason_for_leaving: string | null;
}

export interface EmployeeDependent {
  id: number;
  employee_id: number;
  dependent_name: string;
  relationship: string | null;
  date_of_birth: string | null;
  age: number | null;
  sex: 'Male' | 'Female' | 'Other' | null;
  occupation: string | null;
  aadhaar_number: string | null;
  is_nominee: boolean;
}

export interface EmployeeReference {
  id: number;
  employee_id: number;
  reference_name: string;
  designation: string | null;
  organization: string | null;
  address: string | null;
  mobile: string | null;
  email: string | null;
  relationship: string | null;
}

export interface EmployeeNominee {
  id: number;
  employee_id: number;
  form_type: 'EPF_FORM_2' | 'EPS_FORM_2' | 'GRATUITY_FORM_F' | 'ESI_FORM_1';
  nominee_name: string;
  relationship: string | null;
  date_of_birth: string | null;
  address: string | null;
  share_percentage: string | number | null;
  is_minor: boolean;
  guardian_name: string | null;
}

export interface EmployeeServiceRecord {
  id: number;
  employee_id: number;
  employer_name: string | null;
  designation: string | null;
  department: string | null;
  date_from: string | null;
  date_to: string | null;
  total_period: string | null;
  last_drawn_salary: string | number | null;
  reason_for_leaving: string | null;
  remarks: string | null;
}

export interface EmployeeDocument {
  id: number;
  employee_id: number;
  document_type: string;
  document_name: string;
  file_id: number | null;
  file_path: string | null;
  file_size: number | null;
  mime_type: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  document_number: string | null;
  is_verified: boolean;
  verified_at: string | null;
  remarks: string | null;
}

export interface EmployeeWithRelations extends Employee {
  qualifications: EmployeeQualification[];
  experience: EmployeeExperience[];
  dependents: EmployeeDependent[];
  references: EmployeeReference[];
  nominees: EmployeeNominee[];
  serviceRecords: EmployeeServiceRecord[];
  documents: EmployeeDocument[];
  interview: Record<string, unknown> | null;
  checklist: { item_id: number; item_code: string; item_label: string; is_checked: number; remarks: string | null }[];
}

/** The 14 wizard steps of the employee onboarding form. */
export const EMPLOYEE_WIZARD_STEPS = [
  { key: 'personal', title: 'Personal Details', description: 'Name, family, identification and demographics' },
  { key: 'contact', title: 'Contact & Address', description: 'Present and permanent address details' },
  { key: 'employment', title: 'Employment Details', description: 'DOJ, designation, department and shift' },
  { key: 'wage', title: 'Wage Structure', description: 'Basic, DA, HRA and other allowances' },
  { key: 'statutory', title: 'Statutory Details', description: 'PF, UAN, ESI and mediclaim' },
  { key: 'bank', title: 'Bank & Passport', description: 'Bank account, IFSC and passport details' },
  { key: 'nominee', title: 'Nominee Details', description: 'EPF Form 2 and Gratuity Form F nominees' },
  { key: 'qualifications', title: 'Qualifications', description: 'Educational qualifications table' },
  { key: 'experience', title: 'Previous Experience', description: 'Employment history table' },
  { key: 'dependents', title: 'Dependents', description: 'Family members and dependents table' },
  { key: 'references', title: 'References', description: 'Professional references table' },
  { key: 'interview', title: 'Interview Assessment', description: 'Interview ratings and recommendation' },
  { key: 'checklist', title: 'Personal File Checklist', description: '16-item personnel file verification' },
  { key: 'account', title: 'Login Account', description: 'Portal credentials and account activation' },
] as const;

export const DOCUMENT_TYPES = [
  'Aadhaar Card', 'PAN Card', 'Voter ID', 'Driving Licence', 'Passport', 'Ration Card',
  'Educational Certificate', 'Experience Certificate', 'Relieving Letter', 'Offer Letter',
  'Appointment Letter', 'Medical Certificate', 'Police Verification', 'Bank Passbook',
  'Photo', 'Signature', 'PF Form 2', 'Gratuity Form F', 'ESI Form 1', 'Other',
] as const;
