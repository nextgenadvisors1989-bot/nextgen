import type { AuditFields } from './api';

export interface AuditorType extends AuditFields {
  id: number;
  name: string;
  code: string;
  description: string | null;
  specialization: string | null;
  status: 'active' | 'inactive';
}

export interface Auditor extends AuditFields {
  id: number;
  uuid: string;
  user_id: number | null;
  auditor_code: string;
  name: string;
  email: string;
  mobile: string | null;
  alternate_mobile: string | null;
  auditor_type_id: number | null;
  role_title: string | null;
  specialization: string | null;
  qualification: string | null;
  experience_years: number | string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  photo: string | null;
  signature_path: string | null;
  pan_number: string | null;
  aadhaar_number: string | null;
  bank_name: string | null;
  bank_account_number: string | null;
  ifsc_code: string | null;
  date_of_joining: string | null;
  assigned_employer_id: number | null;
  max_concurrent_audits: number;
  status: 'active' | 'inactive';
  username: string | null;
  is_first_login: boolean;
  rating: number | string | null;
  auditor_type_name?: string | null;
  employer_name?: string | null;
  total_assignments?: number;
  completed_assignments?: number;
  pending_assignments?: number;
  overdue_assignments?: number;
  average_turnaround_days?: number | string | null;
}

export const AUDITOR_SPECIALIZATIONS = [
  'Manufacturing', 'Construction', 'IT & Software', 'Healthcare', 'Food Safety',
  'Chemical & Petrochemical', 'Electrical Safety', 'Fire Safety', 'Environmental',
  'Occupational Health', 'Water & Wastewater', 'Textiles', 'Pharmaceuticals', 'Logistics',
] as const;
