import type { AuditFields } from './api';

export type AuditStatus =
  | 'Not Started' | 'In Progress' | 'Draft Saved' | 'Submitted' | 'Under Review'
  | 'Approved' | 'Rejected' | 'Changes Requested' | 'Overdue' | 'Cancelled';

export type AuditPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export interface AuditAssignment extends AuditFields {
  id: number;
  uuid: string;
  assignment_number: string;
  assignment_type: 'AUDIT' | 'ASSESSMENT' | 'RISK' | 'STUDY' | 'WORK_PERMIT' | 'INSPECTION';
  audit_title: string;
  module_id: number | null;
  form_id: number | null;
  employer_id: number;
  unit_id: number | null;
  department_id: number | null;
  auditor_id: number;
  verifier_id: number | null;
  assigned_by: number | null;
  start_date: string | null;
  end_date: string | null;
  due_date: string | null;
  completed_at: string | null;
  audit_end_meeting_at: string | null;
  priority: AuditPriority;
  status: AuditStatus;
  progress_percent: number;
  instructions: string | null;
  scope: string | null;
  fee_amount: number | null;
  revision_count: number;
  employer_name?: string;
  unit_name?: string | null;
  auditor_name?: string;
  verifier_name?: string | null;
  module_name?: string | null;
  form_name?: string | null;
  report_id?: number | null;
  report_status?: string | null;
  days_remaining?: number | null;
}

export const AUDIT_STATUSES: AuditStatus[] = [
  'Not Started', 'In Progress', 'Draft Saved', 'Submitted', 'Under Review',
  'Approved', 'Rejected', 'Changes Requested', 'Overdue', 'Cancelled',
];

export const AUDIT_PRIORITIES: AuditPriority[] = ['Low', 'Medium', 'High', 'Urgent'];

/** Colour tokens shared by status badges, charts and calendar chips. */
export const AUDIT_STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'Not Started': { bg: 'bg-slate-100', text: 'text-slate-700', dot: '#64748b' },
  'In Progress': { bg: 'bg-blue-100', text: 'text-blue-700', dot: '#3b82f6' },
  'Draft Saved': { bg: 'bg-amber-100', text: 'text-amber-700', dot: '#f59e0b' },
  Submitted: { bg: 'bg-indigo-100', text: 'text-indigo-700', dot: '#6366f1' },
  'Under Review': { bg: 'bg-purple-100', text: 'text-purple-700', dot: '#a855f7' },
  Approved: { bg: 'bg-emerald-100', text: 'text-emerald-700', dot: '#10b981' },
  Rejected: { bg: 'bg-red-100', text: 'text-red-700', dot: '#ef4444' },
  'Changes Requested': { bg: 'bg-orange-100', text: 'text-orange-700', dot: '#f97316' },
  Overdue: { bg: 'bg-rose-100', text: 'text-rose-700', dot: '#e11d48' },
  Cancelled: { bg: 'bg-gray-100', text: 'text-gray-600', dot: '#9ca3af' },
};
