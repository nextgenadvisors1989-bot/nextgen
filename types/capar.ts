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
  source: 'auditor' | 'employer';
  original_name: string;
  mime_type: string | null;
  size_bytes: number;
  url: string;
}

export interface CaparMessage {
  id: number;
  finding_id: number;
  sender_role: 'employer' | 'auditor';
  sender_name: string;
  subject: string;
  body: string;
  created_at: string;
  files: { file_id: number; name: string; mime_type: string | null; size: number; url: string }[];
}

export interface CaparFinding {
  id: number;
  report_id: number;
  category_id: number | null;
  category_name: string | null;
  evidence_item_id: number | null;
  evidence_item_name: string | null;
  evidence_section_id: number | null;
  evidence_section_name: string | null;
  evidence_group_id: number | null;
  evidence_group_name: string | null;
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
  response_status: 'Pending' | 'Employer Submitted' | 'Approved' | 'Declined';
  response_text: string | null;
  employer_signed: boolean;
  employer_signed_by: string | null;
  employer_signed_at: string | null;
  response_reviewed_by: string | null;
  response_reviewed_at: string | null;
  response_review_note: string | null;
  messages: CaparMessage[];
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
  audit_type_id: number | null;
  audit_type_name: string | null;
  buyer_standards: string | null;
  audit_purpose: string | null;
  has_signature: boolean;
  others_selected: number | boolean;
  others_note: string | null;
  signed_at: string | null;
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

export interface CaparChecklistSection {
  id: number;
  name: string;
  items: { id: number; group_name: string | null; name: string }[];
}

export interface CaparDetail {
  report: CaparReport;
  findings: CaparFinding[];
  categories: CaparCategory[];
  checklist: CaparChecklistSection[];
  /** The six common categories; `selected` is what the auditor ticked for this report. */
  groups: { id: number; name: string; selected: boolean }[];
  /** Details this person cannot change (they come from the administrator records). */
  locked: string[];
  events: CaparEvent[];
  role: CaparPanel;
  can: { edit: boolean; submit: boolean; delete: boolean; verify: boolean; decide: boolean; reopen: boolean; download: boolean; respond: boolean; review: boolean; message: boolean };
  branding: { logoUrl: string | null; letterheadUrl: string | null };
}

export const CAPAR_STATUS_TONE: Record<string, 'slate' | 'info' | 'violet' | 'warning' | 'success'> = {
  Draft: 'slate', Submitted: 'info', 'Under Review': 'violet', Returned: 'warning', Approved: 'success',
};

/** What a status is called on screen: a submitted report waits for the employer. */
export const CAPAR_STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft', Submitted: 'Pending', 'Under Review': 'Employer submitted', Returned: 'Returned', Approved: 'Closed',
};
