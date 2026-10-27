export interface StoredFile {
  id: number;
  uuid: string;
  original_name: string;
  stored_name: string;
  storage_path: string;
  mime_type: string | null;
  extension: string | null;
  size_bytes: number;
  entity_type: string;
  entity_id: number | null;
  category: string | null;
  version: number;
  parent_file_id: number | null;
  is_current_version: boolean;
  access_level: 'private' | 'employer' | 'auditor' | 'verifier' | 'public' | 'restricted';
  description: string | null;
  tags: string | null;
  download_count: number;
  is_archived: boolean;
  uploaded_by: number | null;
  uploader_name?: string | null;
  created_at: string;
}

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv', 'text/plain', 'application/zip',
] as const;

export const MAX_FILE_SIZE_MB = Number(process.env.UPLOAD_MAX_FILE_SIZE_MB ?? 25);

/**
 * Client-safe catalogues for the document vault screens.
 *
 * These mirror the enums in the `files` table and `lib/files/file-service.ts`
 * (which cannot be imported into client components because it touches the
 * filesystem). The service re-exports them so there is still one definition.
 */
export const FILE_ENTITY_TYPES = [
  'EMPLOYER', 'EMPLOYEE', 'AUDITOR', 'AUDIT_ASSIGNMENT', 'AUDIT_REPORT', 'SUBMISSION',
  'PAYSLIP', 'PAYROLL_RUN', 'COMPLIANCE_DOCUMENT', 'WORK_PERMIT', 'CMS_MEDIA', 'STUDY',
  'RISK', 'ASSESSMENT', 'USER', 'OTHER', 'CAPAR', 'WATER_NOC',
] as const;
export type FileEntityType = (typeof FILE_ENTITY_TYPES)[number];

export const FILE_ACCESS_LEVELS = ['private', 'employer', 'auditor', 'verifier', 'public', 'restricted'] as const;
export type FileAccessLevel = (typeof FILE_ACCESS_LEVELS)[number];

/** Human labels for the entity-type filter and badges. */
export const FILE_ENTITY_LABELS: Record<string, string> = {
  EMPLOYER: 'Employer',
  EMPLOYEE: 'Employee',
  AUDITOR: 'Auditor',
  AUDIT_ASSIGNMENT: 'Audit assignment',
  AUDIT_REPORT: 'Audit report',
  SUBMISSION: 'Module submission',
  PAYSLIP: 'Payslip',
  PAYROLL_RUN: 'Payroll run',
  COMPLIANCE_DOCUMENT: 'Compliance document',
  WORK_PERMIT: 'Work permit',
  CMS_MEDIA: 'CMS media',
  STUDY: 'Study report',
  RISK: 'Risk report',
  ASSESSMENT: 'Assessment',
  USER: 'User',
  OTHER: 'General',
  CAPAR: 'CAPAR report',
  WATER_NOC: 'Groundwater NOC',
};

export const FILE_ACCESS_LABELS: Record<string, string> = {
  private: 'Private',
  employer: 'Employer',
  auditor: 'Auditor',
  verifier: 'Verifier',
  public: 'Public',
  restricted: 'Restricted',
};
