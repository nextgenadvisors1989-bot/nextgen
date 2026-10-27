import type { AuditFields } from './api';

export type EmployerStatus = 'active' | 'inactive';

export interface Employer extends AuditFields {
  id: number;
  uuid: string;
  company_name: string;
  employer_code: string;
  gst_number: string | null;
  pan_number: string | null;
  cin_number: string | null;
  industry_type: string | null;
  company_type: string | null;
  year_of_establishment: number | null;
  website_url: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  fax: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  contact_person_name: string | null;
  contact_person_designation: string | null;
  contact_person_email: string | null;
  contact_person_mobile: string | null;
  contact_person_alternate_mobile: string | null;
  number_of_units: number;
  approximate_employee_count: number | null;
  compliance_contact_person: string | null;
  compliance_contact_email: string | null;
  compliance_contact_phone: string | null;
  payroll_contact_person: string | null;
  payroll_contact_email: string | null;
  payroll_contact_phone: string | null;
  notes: string | null;
  status: EmployerStatus;
  // Computed by list/detail queries
  unit_count?: number;
  employee_count?: number;
  audit_count?: number;
  pending_audit_count?: number;
  expiring_document_count?: number;
}

export interface CompanyUnit extends AuditFields {
  id: number;
  employer_id: number;
  unit_name: string;
  unit_code: string | null;
  location: string | null;
  address: string | null;
  contact_person_name: string | null;
  contact_person_email: string | null;
  contact_person_phone: string | null;
  employee_count: number | null;
  status: 'active' | 'inactive';
}

export interface Department extends AuditFields {
  id: number;
  employer_id: number;
  unit_id: number | null;
  department_name: string;
  department_code: string | null;
  head_of_department: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  employee_count: number | null;
  status: 'active' | 'inactive';
  unit_name?: string | null;
}

export interface EmployerStats {
  totalUnits: number;
  totalDepartments: number;
  totalEmployees: number;
  activeEmployees: number;
  totalAudits: number;
  completedAudits: number;
  pendingAudits: number;
  complianceDocuments: number;
  expiredDocuments: number;
  expiringSoonDocuments: number;
}

export const EMPLOYER_INDUSTRIES = [
  'Manufacturing', 'Information Technology', 'Healthcare', 'Construction', 'Textiles',
  'Pharmaceuticals', 'Food & Beverage', 'Chemical', 'Automotive', 'Logistics & Warehousing',
  'Power & Energy', 'Mining', 'Retail', 'Hospitality', 'Education', 'Financial Services',
  'Telecommunications', 'Agriculture', 'Real Estate', 'Other',
] as const;

export const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand',
  'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli',
  'Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
] as const;

export const COMPANY_TYPES = [
  'Private Limited', 'Public Limited', 'One Person Company', 'LLP', 'Partnership',
  'Proprietorship', 'Trust', 'Society', 'Government', 'MSME', 'Startup',
] as const;
