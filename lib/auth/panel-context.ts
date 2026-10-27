/**
 * Server-side helper that assembles everything a panel shell needs: the signed-in
 * identity, the recent notifications and the sidebar badge counts.
 */
import { getCurrentUser } from './auth';
import { listNotifications } from '@/lib/notifications/notification-service';
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { ROLE_LABEL } from './rbac';
import { requirePageUser } from './permission-check';
import type { AuthUser } from '@/types/user';
import type { TopbarUser, TopbarNotification } from '@/components/navigation/topbar';

export interface PanelContext {
  user: AuthUser;
  topbar: TopbarUser;
  notifications: TopbarNotification[];
  unreadCount: number;
}

const PANEL_PATHS: Record<string, { profile: string; settings: string }> = {
  admin: { profile: '/admin/settings', settings: '/admin/settings' },
  auditor: { profile: '/auditor/profile', settings: '/auditor/settings' },
  employer: { profile: '/employer/profile', settings: '/employer/settings' },
  employee: { profile: '/employee/profile', settings: '/employee/settings' },
  verifier: { profile: '/verifier/settings', settings: '/verifier/settings' },
};

export function toTopbarUser(user: AuthUser, panel: keyof typeof PANEL_PATHS): TopbarUser {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    roleLabel: ROLE_LABEL[user.primaryRole] ?? user.primaryRole,
    profilePhoto: user.profilePhoto,
    dashboardPath: user.dashboardPath,
    profilePath: PANEL_PATHS[panel]?.profile ?? '/',
    settingsPath: PANEL_PATHS[panel]?.settings ?? '/',
  };
}

export async function getPanelContext(panel: keyof typeof PANEL_PATHS): Promise<PanelContext> {
  const user = await getCurrentUser();
  if (!user) {
    // Callers always run behind requirePageUser, but be explicit rather than crash.
    throw new Error('Panel context requested without an authenticated user');
  }

  const { data, unreadCount } = await listNotifications(user.id, { page: 1, limit: 8 });

  return {
    user,
    topbar: toTopbarUser(user, panel),
    notifications: data as unknown as TopbarNotification[],
    unreadCount,
  };
}

/** Aggregate badge counts for the admin sidebar. */
export async function getAdminCounts() {
  const [employees, employers, pendingVerification, openAudits] = await Promise.all([
    queryOne<RowDataPacket>('SELECT COUNT(*) AS total FROM employees WHERE deleted_at IS NULL AND status = ?', ['active']),
    queryOne<RowDataPacket>('SELECT COUNT(*) AS total FROM employers WHERE deleted_at IS NULL AND status = ?', ['active']),
    queryOne<RowDataPacket>('SELECT COUNT(*) AS total FROM audit_reports WHERE deleted_at IS NULL AND status IN (?, ?)', ['Submitted', 'Under Review']),
    queryOne<RowDataPacket>("SELECT COUNT(*) AS total FROM audit_assignments WHERE deleted_at IS NULL AND status NOT IN ('Approved','Cancelled')"),
  ]);
  return {
    employees: Number(employees?.total ?? 0),
    employers: Number(employers?.total ?? 0),
    pendingVerification: Number(pendingVerification?.total ?? 0),
    openAudits: Number(openAudits?.total ?? 0),
  };
}

export async function getEmployerCounts(employerId: number | null) {
  if (!employerId) return { employees: 0, upcomingAudits: 0, expiringDocuments: 0 };
  const [employees, audits, documents] = await Promise.all([
    queryOne<RowDataPacket>('SELECT COUNT(*) AS total FROM employees WHERE employer_id = ? AND deleted_at IS NULL AND status = ?', [employerId, 'active']),
    queryOne<RowDataPacket>("SELECT COUNT(*) AS total FROM audit_assignments WHERE employer_id = ? AND deleted_at IS NULL AND status NOT IN ('Approved','Cancelled')", [employerId]),
    queryOne<RowDataPacket>(
      "SELECT COUNT(*) AS total FROM compliance_documents WHERE employer_id = ? AND deleted_at IS NULL AND expiry_date IS NOT NULL AND compliance_status NOT IN ('Not Applicable','Applied for Renewal') AND DATEDIFF(expiry_date, CURDATE()) <= 90",
      [employerId]
    ),
  ]);
  return {
    employees: Number(employees?.total ?? 0),
    upcomingAudits: Number(audits?.total ?? 0),
    expiringDocuments: Number(documents?.total ?? 0),
  };
}

export async function getAuditorCounts(auditorId: number | null) {
  if (!auditorId) return { openAudits: 0, isWater: false };
  const [row, water] = await Promise.all([
    queryOne<RowDataPacket>(
      "SELECT COUNT(*) AS total FROM audit_assignments WHERE auditor_id = ? AND deleted_at IS NULL AND status NOT IN ('Approved','Cancelled')",
      [auditorId]
    ),
    // The groundwater NOC register is for Water auditors only, so only they get the menu entry.
    queryOne<RowDataPacket>(
      "SELECT 1 AS ok FROM auditors a JOIN auditor_types t ON t.id = a.auditor_type_id WHERE a.id = ? AND t.code = 'WATER' AND a.deleted_at IS NULL",
      [auditorId]
    ),
  ]);
  return { openAudits: Number(row?.total ?? 0), isWater: Boolean(water) };
}

export async function getVerifierCounts(userId: number) {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total
       FROM verifier_assignments va
      WHERE va.verifier_id = ? AND va.status IN ('pending','in_review')`,
    [userId]
  );
  return { pending: Number(row?.total ?? 0) };
}

export { requirePageUser };
