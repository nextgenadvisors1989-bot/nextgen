export type UserStatus = 'active' | 'inactive' | 'suspended';

export interface User {
  id: number;
  uuid: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  mobile: string | null;
  profile_photo: string | null;
  status: UserStatus;
  is_first_login: boolean;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type RoleSlug = 'super_admin' | 'admin' | 'auditor' | 'employer' | 'employee' | 'verifier';

export interface Role {
  id: number;
  name: string;
  slug: RoleSlug | string;
  description: string | null;
  is_system_role: boolean;
}

export interface Permission {
  id: number;
  name: string;
  module: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'export' | 'approve' | 'reject' | 'verify' | 'share' | 'download' | 'upload';
  description: string | null;
}

/** The full identity of the signed-in principal, resolved once per request. */
export interface AuthUser {
  id: number;
  uuid: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  mobile: string | null;
  profilePhoto: string | null;
  status: UserStatus;
  isFirstLogin: boolean;
  lastLoginAt: string | null;
  roles: { id: number; name: string; slug: string }[];
  primaryRole: string;
  permissions: string[];
  dashboardPath: string;
  /** Scoping keys so a user can only ever reach their own data. */
  employerId: number | null;
  auditorId: number | null;
  employeeId: number | null;
  sessionId: string;
}

export interface SessionPayload {
  sid: string;
  uid: number;
  nonce: string;
  /** Primary role slug, used by middleware for panel routing. */
  role?: string | null;
  iat?: number;
  exp?: number;
}
