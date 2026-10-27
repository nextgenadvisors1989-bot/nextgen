export interface ApiSuccess<T = unknown> {
  success: true;
  message?: string;
  data?: T;
  pagination?: Pagination;
  [key: string]: unknown;
}

export interface ApiError {
  success: false;
  message: string;
  errors?: Record<string, string[]> | ValidationIssue[];
  code?: string;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;

export interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  from: number;
  to: number;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: unknown;
}

export interface AuditFields {
  created_at?: string;
  updated_at?: string;
  created_by?: number | null;
  updated_by?: number | null;
  deleted_at?: string | null;
}
