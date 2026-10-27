export interface ComplianceAct {
  id: number;
  act_name: string;
  short_name: string | null;
  act_number: string | null;
  act_year: number | null;
  jurisdiction: 'Central' | 'State' | 'International';
  state_name: string | null;
  ministry: string | null;
  enactment_date: string | null;
  effective_date: string | null;
  last_amended_date: string | null;
  summary: string | null;
  full_text: string | null;
  status: 'active' | 'repealed' | 'amended' | 'draft';
  rule_count?: number;
  created_at?: string;
}

export interface ComplianceRule {
  id: number;
  act_id: number;
  rule_number: string | null;
  rule_title: string;
  rule_text: string | null;
  compliance_type: 'Mandatory' | 'Recommended' | 'Best Practice';
  frequency: string | null;
  due_day_of_month: number | null;
  responsible_role: string | null;
  penalty_details: string | null;
  evidence_required: string | null;
  status: 'active' | 'inactive';
  act_name?: string;
  act_short_name?: string | null;
}

export interface ComplianceRegulation {
  id: number;
  act_id: number | null;
  rule_id: number | null;
  regulation_name: string;
  regulation_number: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  effective_date: string | null;
  scope: string | null;
  obligations: string | null;
  reporting_authority: string | null;
  reporting_frequency: string | null;
  penalty_provision: string | null;
  status: 'active' | 'superseded' | 'withdrawn';
  act_name?: string | null;
}

export interface ComplianceNotification {
  id: number;
  notification_number: string;
  title: string;
  notification_date: string | null;
  issuing_authority: string | null;
  act_id: number | null;
  gazette_reference: string | null;
  subject: string | null;
  body: string | null;
  effective_date: string | null;
  action_required: string | null;
  status: 'active' | 'superseded' | 'withdrawn';
}

export interface ComplianceDocument {
  id: number;
  uuid: string;
  document_name: string;
  document_type: 'Licence' | 'Certificate' | 'Permit' | 'Registration' | 'Return' | 'Approval' | 'Agreement' | 'Insurance' | 'Other';
  employer_id: number;
  unit_id: number | null;
  act_id: number | null;
  document_number: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  remind_days_before: number;
  renewal_responsibility: string | null;
  fee_amount: number | string | null;
  compliance_status: 'Valid' | 'Expiring Soon' | 'Expired' | 'Applied for Renewal' | 'Not Applicable';
  file_id: number | null;
  file_path: string | null;
  notes: string | null;
  is_verified: boolean;
  employer_name?: string;
  unit_name?: string | null;
  days_to_expiry?: number | null;
}

export const COMPLIANCE_DOCUMENT_TYPES = ['Licence', 'Certificate', 'Permit', 'Registration', 'Return', 'Approval', 'Agreement', 'Insurance', 'Other'] as const;
export const EXPIRY_STATUSES = ['Valid', 'Expiring Soon', 'Expired', 'Applied for Renewal', 'Not Applicable'] as const;
