/** Shapes the CAPAR screens read from /api/capar. */
export type CaparStatus = 'Draft' | 'Submitted' | 'Under Review' | 'Returned' | 'Approved';
export type CaparPanel = 'admin' | 'auditor' | 'verifier' | 'employer';

export interface CaparListRow {
  id: number;
  report_number: string;
  title: string;
  status: CaparStatus;
  audit_date: string | null;
  facility_name: string;
  employer_id: number;
  employer_name: string;
  auditor_name: string;
  verifier_name: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  revision_count: number;
  finding_count: number;
  violation_count: number;
  pending_count: number;
  open_count: number;
}

export interface CaparFile {
  link_id: number;
  file_id: number;
  kind: 'Photo' | 'Evidence';
  caption: string | null;
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  url: string;
}

export interface CaparFinding {
  id: number;
  report_id: number;
  category_id: number | null;
  category_name: string | null;
  sort_order: number;
  outcome: 'Violation' | 'No Violation';
  item_status: 'Incomplete' | 'Not findings' | 'Verified';
  act_rule: string | null;
  act_id: number | null;
  provision_id: number | null;
  compliance_note: string | null;
  recommendation: string | null;
  assessment: string | null;
  signed_by: string | null;
  signed_at: string | null;
  act_short_name: string | null;
  resource_id: number | null;
  resource_title: string | null;
  resource_external_url: string | null;
  resource_file_id: number | null;
  minimum_requirement: string | null;
  local_law: string | null;
  finding: string | null;
  root_cause: string | null;
  action_plan: string | null;
  timeline_date: string | null;
  timeline_note: string | null;
  action_status: 'Open' | 'In Progress' | 'Closed';
  closed_on: string | null;
  verification_status: 'Pending' | 'Eligible' | 'Not Eligible';
  verification_remark: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
  files: CaparFile[];
}

export interface CaparReport {
  id: number;
  report_number: string;
  title: string;
  status: CaparStatus;
  employer_id: number;
  employer_name: string;
  unit_id: number | null;
  unit_name: string | null;
  assignment_id: number | null;
  assignment_number: string | null;
  auditor_id: number;
  auditor_name: string;
  verifier_id: number | null;
  verifier_name: string | null;
  facility_name: string;
  facility_address: string | null;
  representative_name: string | null;
  representative_title: string | null;
  audit_date: string | null;
  audit_firm: string | null;
  auditor_print_name: string | null;
  standard_reference: string | null;
  summary_notes: string | null;
  closing_meeting_date: string | null;
  closing_statement: string | null;
  facility_signatory: string | null;
  facility_signed_date: string | null;
  review_comments: string | null;
  revision_count: number;
  submitted_at: string | null;
  approved_at: string | null;
}

export interface CaparCategory {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
  status: 'active' | 'inactive';
  finding_count?: number;
}

export interface CaparEvent {
  id: number;
  action: 'Submitted' | 'Returned' | 'Approved' | 'Reopened';
  comments: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface CaparDetail {
  report: CaparReport;
  findings: CaparFinding[];
  categories: CaparCategory[];
  events: CaparEvent[];
  role: CaparPanel;
  can: { edit: boolean; submit: boolean; delete: boolean; verify: boolean; decide: boolean; reopen: boolean; download: boolean };
  branding: { logoUrl: string | null; letterheadUrl: string | null };
}

export const CAPAR_STATUS_TONE: Record<string, 'slate' | 'info' | 'violet' | 'warning' | 'success'> = {
  Draft: 'slate', Submitted: 'info', 'Under Review': 'violet', Returned: 'warning', Approved: 'success',
};
