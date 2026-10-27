/** Shapes the groundwater NOC screens read from /api/water-noc. */
export type NocStatus = 'Applied' | 'Valid' | 'Expiring Soon' | 'Expired' | 'Cancelled';
export type UsageStatus = 'Within limit' | 'Near limit' | 'Over limit' | 'No data';
export type ConditionState = 'Not Checked' | 'Compliant' | 'Non-Compliant' | 'Not Applicable';
export type NocPanel = 'admin' | 'auditor' | 'employer';

export interface NocListRow {
  id: number;
  noc_number: string;
  title: string;
  employer_id: number;
  employer_name: string;
  unit_name: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  approved_quantity_lpd: number;
  derived_status: NocStatus;
  conditions_total: number;
  conditions_compliant: number;
  conditions_non_compliant: number;
  conditions_unchecked: number;
  avg_kld_30: number | null;
  percent_30: number | null;
  usage_status: UsageStatus;
  last_reading_date: string | null;
}

export interface NocRecord {
  id: number;
  noc_number: string;
  title: string;
  employer_id: number;
  employer_name: string;
  unit_id: number | null;
  unit_name: string | null;
  document_id: number | null;
  issuing_authority: string | null;
  applied_on: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  renewal_cycle_years: number;
  purpose: string;
  approved_quantity_lpd: number;
  purpose_domestic_lpd: number | null;
  purpose_gardening_lpd: number | null;
  purpose_other_lpd: number | null;
  well_type: string | null;
  well_depth_m: number | null;
  well_diameter_in: number | null;
  pump_hp: number | null;
  pumping_hours_per_day: number | null;
  abstraction_structures: number | null;
  status: NocStatus;
  derived_status: NocStatus;
  file_id: number | null;
  notes: string | null;
}

export interface NocCondition {
  id: number;
  noc_id: number;
  sort_order: number;
  clause_no: string | null;
  condition_text: string;
  compliance: ConditionState;
  remarks: string | null;
  checked_by_name: string | null;
  checked_at: string | null;
}

export interface WaterMeter {
  id: number;
  name: string;
  source: string;
  reading_unit: 'KL' | 'L';
  counts_toward_noc: number | boolean;
  status: 'active' | 'inactive';
  notes: string | null;
  last_reading_date: string | null;
  last_reading_value: number | null;
  reading_count: number;
  recentKl: number;
  recentKld: number;
}

export interface MeterReadingRow {
  id: number;
  meter_id: number;
  reading_date: string;
  reading_value: number;
  is_reset: number | boolean;
  remarks: string | null;
  entered_by_name: string | null;
}

export interface UsageFigures {
  litres: number;
  days: number;
  avgKld: number;
  approvedKld: number;
  percent: number | null;
  status: UsageStatus;
}

export interface MonthFigures extends UsageFigures {
  month: string;
}

export interface NocDetail {
  noc: NocRecord;
  conditions: NocCondition[];
  meters: WaterMeter[];
  readings: MeterReadingRow[];
  usage: { recent: UsageFigures; overall: UsageFigures; months: MonthFigures[]; sourceMeters: string[]; firstDate: string | null; lastDate: string | null };
  role: NocPanel;
  can: { edit: boolean; delete: boolean; upload: boolean; download: boolean };
  fileUrl: string | null;
}

export const NOC_STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'slate'> = {
  Valid: 'success', 'Expiring Soon': 'warning', Expired: 'danger', Applied: 'info', Cancelled: 'slate',
};

export const USAGE_TONE: Record<string, 'success' | 'warning' | 'danger' | 'slate'> = {
  'Within limit': 'success', 'Near limit': 'warning', 'Over limit': 'danger', 'No data': 'slate',
};
