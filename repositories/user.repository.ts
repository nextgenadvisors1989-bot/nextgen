/**
 * Users, roles and permissions reads.
 *
 * The access model is three tables joined: `users` → `user_roles` → `roles`,
 * and `roles` → `role_permissions` → `permissions`. Everything here is written
 * to survive that shape changing under it — role lists come back as aggregates
 * (so a user row is one row, not one per role) and permission checks resolve
 * through the role grants rather than assuming a denormalised column.
 */
import { execute, query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { buildSearch, eqFilter, inFilter, paginatedQuery, type ListQuery, type SqlValue } from '@/lib/db/query-helpers';
import type { UserListQuery, RoleListQuery } from '@/lib/validations/user.validation';

/** Roles as a single aggregated column — `admin|employer`. */
const ROLE_SLUGS_SQL = `(SELECT GROUP_CONCAT(r.slug ORDER BY r.slug SEPARATOR '|')
    FROM user_roles ur JOIN roles r ON r.id = ur.role_id
   WHERE ur.user_id = u.id AND r.deleted_at IS NULL)`;
const ROLE_NAMES_SQL = `(SELECT GROUP_CONCAT(r.name ORDER BY r.name SEPARATOR ', ')
    FROM user_roles ur JOIN roles r ON r.id = ur.role_id
   WHERE ur.user_id = u.id AND r.deleted_at IS NULL)`;
const ROLE_IDS_SQL = `(SELECT GROUP_CONCAT(ur.role_id ORDER BY ur.role_id)
    FROM user_roles ur WHERE ur.user_id = u.id)`;
const PERMISSION_COUNT_SQL = `(SELECT COUNT(DISTINCT rp.permission_id)
    FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
   WHERE ur.user_id = u.id)`;

/**
 * Which panel the login belongs to. Role grants decide it, with the link tables
 * as a fallback for accounts that hold a role without a linked record yet.
 */
const PORTAL_SQL = `CASE
    WHEN (${ROLE_SLUGS_SQL}) LIKE '%super_admin%' OR (${ROLE_SLUGS_SQL}) LIKE '%admin%' THEN 'admin'
    WHEN (${ROLE_SLUGS_SQL}) LIKE '%auditor%' THEN 'auditor'
    WHEN (${ROLE_SLUGS_SQL}) LIKE '%verifier%' THEN 'verifier'
    WHEN (${ROLE_SLUGS_SQL}) LIKE '%employer%' THEN 'employer'
    WHEN (${ROLE_SLUGS_SQL}) LIKE '%employee%' THEN 'employee'
    ELSE 'unlinked'
  END`;

const USER_COLUMNS = `u.id, u.uuid, u.email, u.username, u.first_name, u.last_name, u.mobile, u.profile_photo,
  u.status, u.is_first_login, u.last_login_at, u.last_login_ip, u.failed_login_count, u.locked_until,
  u.created_at, u.updated_at, u.deleted_at`;

const SORTABLE: Record<string, string> = {
  first_name: 'u.first_name',
  last_name: 'u.last_name',
  email: 'u.email',
  username: 'u.username',
  status: 'u.status',
  last_login_at: 'u.last_login_at',
  created_at: 'u.created_at',
  updated_at: 'u.updated_at',
  id: 'u.id',
};

export interface UserListFilters extends UserListQuery {
  includeDeleted?: boolean;
}

export async function findUsers(filters: UserListFilters) {
  const params: SqlValue[] = [];
  let where = ' WHERE 1 = 1';
  where += buildSearch(filters.search ?? null, ['u.first_name', 'u.last_name', 'u.email', 'u.username', 'u.mobile'], params);

  const status = filters.status && filters.status !== 'all' ? String(filters.status) : null;
  if (status === 'locked') {
    // "Locked" is a state, not a stored status: it is an unexpired lockout.
    where += ' AND u.locked_until IS NOT NULL AND u.locked_until > NOW()';
  } else if (status) {
    where += eqFilter('u.status', status, params);
  }

  if (filters.role && filters.role !== 'all') {
    where += ` AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                            WHERE ur.user_id = u.id AND r.slug = ? AND r.deleted_at IS NULL)`;
    params.push(String(filters.role));
  }

  if (filters.portal && filters.portal !== 'all') {
    const portal = String(filters.portal);
    if (portal === 'unlinked') {
      where += ` AND (${ROLE_SLUGS_SQL}) IS NULL`;
    } else if (portal === 'admin') {
      where += ` AND ((${ROLE_SLUGS_SQL}) LIKE '%super_admin%' OR (${ROLE_SLUGS_SQL}) LIKE '%admin%')`;
    } else {
      where += ` AND (${ROLE_SLUGS_SQL}) LIKE ?`;
      params.push(`%${portal}%`);
    }
  }

  if (filters.locked === 'true') where += ' AND u.locked_until IS NOT NULL AND u.locked_until > NOW()';
  if (filters.locked === 'false') where += ' AND (u.locked_until IS NULL OR u.locked_until <= NOW())';
  if (filters.pending_activation === 'true') where += ' AND u.is_first_login = 1';
  if (filters.pending_activation === 'false') where += ' AND u.is_first_login = 0';
  if (filters.archived === 'true') {
    where += ' AND u.deleted_at IS NOT NULL';
  } else if (!filters.includeDeleted) {
    where += ' AND u.deleted_at IS NULL';
  }
  if (filters.from_date) {
    where += ' AND u.created_at >= ?';
    params.push(`${filters.from_date} 00:00:00`);
  }
  if (filters.to_date) {
    where += ' AND u.created_at <= ?';
    params.push(`${filters.to_date} 23:59:59`);
  }

  const baseSql = `SELECT ${USER_COLUMNS},
      ${ROLE_SLUGS_SQL} AS role_slugs,
      ${ROLE_NAMES_SQL} AS role_names,
      ${ROLE_IDS_SQL} AS role_ids,
      ${PERMISSION_COUNT_SQL} AS permission_count,
      ${PORTAL_SQL} AS portal,
      (u.locked_until IS NOT NULL AND u.locked_until > NOW()) AS is_locked,
      (u.status = 'active' AND u.deleted_at IS NULL) AS can_sign_in,
      (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > NOW()) AS active_sessions
    FROM users u${where}`;

  const countSql = `SELECT COUNT(*) FROM users u${where}`;
  const sortExpression = filters.sortBy ? SORTABLE[filters.sortBy] ?? null : null;

  return paginatedQuery<RowDataPacket>(baseSql, countSql, params, {
    ...(filters as unknown as ListQuery),
    sortBy: sortExpression,
    allowedSortColumns: Object.values(SORTABLE),
    defaultSort: 'u.created_at',
  });
}

export async function userStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(u.deleted_at IS NULL AND u.status = 'active') AS active,
            SUM(u.deleted_at IS NULL AND u.status = 'inactive') AS inactive,
            SUM(u.deleted_at IS NULL AND u.status = 'suspended') AS suspended,
            SUM(u.deleted_at IS NULL AND u.locked_until IS NOT NULL AND u.locked_until > NOW()) AS locked,
            SUM(u.deleted_at IS NULL AND u.is_first_login = 1) AS pendingActivation,
            SUM(u.deleted_at IS NULL AND u.last_login_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS activeLast30,
            SUM(u.deleted_at IS NOT NULL) AS archived,
            (SELECT COUNT(*) FROM sessions s WHERE s.revoked_at IS NULL AND s.expires_at > NOW()) AS sessions
       FROM users u`
  );
  return {
    total: Number(row?.total ?? 0),
    active: Number(row?.active ?? 0),
    inactive: Number(row?.inactive ?? 0),
    suspended: Number(row?.suspended ?? 0),
    locked: Number(row?.locked ?? 0),
    pendingActivation: Number(row?.pendingActivation ?? 0),
    activeLast30: Number(row?.activeLast30 ?? 0),
    archived: Number(row?.archived ?? 0),
    sessions: Number(row?.sessions ?? 0),
  };
}

/** Logins grouped by the portal their roles point at. */
export function usersByRole() {
  return query<RowDataPacket>(
    `SELECT r.id, r.slug, r.name, r.is_system_role,
            COUNT(DISTINCT u.id) AS total,
            (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permissions
       FROM roles r
       LEFT JOIN user_roles ur ON ur.role_id = r.id
       LEFT JOIN users u ON u.id = ur.user_id AND u.deleted_at IS NULL
      WHERE r.deleted_at IS NULL
      GROUP BY r.id
      ORDER BY total DESC, r.name ASC`
  );
}

/** Users waiting on an activation link, so the screen can nudge them. */
export function pendingActivations(limit = 10) {
  return query<RowDataPacket>(
    `SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name, u.email, u.username, u.created_at,
            ${ROLE_SLUGS_SQL} AS role_slugs
       FROM users u
      WHERE u.deleted_at IS NULL AND u.is_first_login = 1
      ORDER BY u.created_at DESC
      LIMIT ?`,
    [limit]
  );
}

export function userActivitySummary(userId: number) {
  return queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS actions,
            SUM(action = 'login') AS logins,
            SUM(status = 'failed') AS failures,
            MAX(created_at) AS lastAction
       FROM activity_logs WHERE user_id = ?`,
    [userId]
  );
}

export async function findUserById(userId: number) {
  return queryOne<RowDataPacket>(
    `SELECT ${USER_COLUMNS},
        ${ROLE_SLUGS_SQL} AS role_slugs,
        ${ROLE_NAMES_SQL} AS role_names,
        ${PERMISSION_COUNT_SQL} AS permission_count,
        ${PORTAL_SQL} AS portal,
        (u.locked_until IS NOT NULL AND u.locked_until > NOW()) AS is_locked,
        (u.status = 'active' AND u.deleted_at IS NULL) AS can_sign_in,
        CONCAT(COALESCE(c.first_name, ''), ' ', COALESCE(c.last_name, '')) AS created_by_name,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > NOW()) AS active_sessions
      FROM users u
      LEFT JOIN users c ON c.id = u.created_by
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );
}

export function userRoles(userId: number) {
  return query<RowDataPacket>(
    `SELECT r.id, r.slug, r.name, r.description, r.is_system_role, ur.assigned_at,
            (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permissions
       FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? AND r.deleted_at IS NULL
      ORDER BY r.name ASC`,
    [userId]
  );
}

/** Effective permission names, deduplicated across every role the user holds. */
export function userPermissions(userId: number) {
  return query<RowDataPacket>(
    `SELECT DISTINCT p.module, p.action, p.name, p.description
       FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = ?
      ORDER BY p.module ASC, p.action ASC`,
    [userId]
  );
}

export function userSessions(userId: number) {
  return query<RowDataPacket>(
    `SELECT id, ip_address, user_agent, expires_at, created_at
       FROM sessions
      WHERE user_id = ? AND revoked_at IS NULL AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 50`,
    [userId]
  );
}

/** The records this login is wired to (employer/auditor/employee portals). */
export function userLinks(userId: number) {
  return query<RowDataPacket>(
    `SELECT 'employer' AS kind, e.id, e.company_name AS label, eu.is_primary AS extra
       FROM employer_users eu JOIN employers e ON e.id = eu.employer_id
      WHERE eu.user_id = ? AND e.deleted_at IS NULL
      UNION ALL
     SELECT 'auditor', a.id, a.name, NULL FROM auditors a WHERE a.user_id = ? AND a.deleted_at IS NULL
      UNION ALL
     SELECT 'employee', emp.id, emp.name, NULL FROM employees emp WHERE emp.user_id = ? AND emp.deleted_at IS NULL`,
    [userId, userId, userId]
  );
}

/* ───────────────────────────────── roles ───────────────────────────────── */

const ROLE_COLUMNS = `r.id, r.name, r.slug, r.description, r.is_system_role, r.created_at, r.updated_at,
  (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permissions,
  (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
    WHERE ur.role_id = r.id AND u.deleted_at IS NULL) AS users`;

export async function findRoles(filters: RoleListQuery) {
  const params: SqlValue[] = [];
  let where = ' WHERE r.deleted_at IS NULL';
  where += buildSearch(filters.search ?? null, ['r.name', 'r.slug', 'r.description'], params);
  if (filters.kind === 'system') where += ' AND r.is_system_role = 1';
  if (filters.kind === 'custom') where += ' AND r.is_system_role = 0';

  const baseSql = `SELECT ${ROLE_COLUMNS},
      (SELECT GROUP_CONCAT(p.name ORDER BY p.name SEPARATOR ',')
         FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = r.id) AS permission_names
    FROM roles r${where}`;

  return paginatedQuery<RowDataPacket>(
    baseSql,
    `SELECT COUNT(*) FROM roles r${where}`,
    params,
    {
      ...(filters as unknown as ListQuery),
      allowedSortColumns: ['r.name', 'r.slug', 'r.created_at', 'r.updated_at', 'permissions', 'users', 'r.id'],
      defaultSort: 'r.name',
    }
  );
}

export async function roleStats() {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total,
            SUM(is_system_role = 1) AS system_roles,
            SUM(is_system_role = 0) AS custom_roles,
            (SELECT COUNT(*) FROM role_permissions) AS grants,
            (SELECT COUNT(*) FROM permissions) AS permissions
       FROM roles WHERE deleted_at IS NULL`
  );
  return {
    total: Number(row?.total ?? 0),
    systemRoles: Number(row?.system_roles ?? 0),
    customRoles: Number(row?.custom_roles ?? 0),
    grants: Number(row?.grants ?? 0),
    permissions: Number(row?.permissions ?? 0),
  };
}

export async function findRoleById(roleId: number) {
  return queryOne<RowDataPacket>(
    `SELECT ${ROLE_COLUMNS} FROM roles r WHERE r.id = ? AND r.deleted_at IS NULL LIMIT 1`,
    [roleId]
  );
}

export async function findRoleBySlug(slug: string) {
  return queryOne<RowDataPacket>(
    `SELECT ${ROLE_COLUMNS} FROM roles r WHERE r.slug = ? AND r.deleted_at IS NULL LIMIT 1`,
    [slug]
  );
}

export function rolePermissionNames(roleId: number) {
  return query<RowDataPacket>(
    `SELECT p.name
       FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?
      ORDER BY p.name ASC`,
    [roleId]
  );
}

export function roleMembers(roleId: number, limit = 50) {
  return query<RowDataPacket>(
    `SELECT u.id, CONCAT(u.first_name, ' ', u.last_name) AS name, u.email, u.username, u.status,
            u.last_login_at, ur.assigned_at
       FROM user_roles ur JOIN users u ON u.id = ur.user_id
      WHERE ur.role_id = ? AND u.deleted_at IS NULL
      ORDER BY u.first_name ASC, u.last_name ASC
      LIMIT ?`,
    [roleId, limit]
  );
}

/* ─────────────────────────────── permissions ───────────────────────────── */

export function permissionCatalogue() {
  return query<RowDataPacket>(
    `SELECT id, name, module, action, description
       FROM permissions
      ORDER BY module ASC, FIELD(action, 'read','create','update','delete','export','approve','reject','verify','share','download','upload'), action ASC`
  );
}

export function allRolePermissionPairs() {
  return query<RowDataPacket>(
    `SELECT r.slug AS role_slug, p.name AS permission_name
       FROM role_permissions rp
       JOIN roles r ON r.id = rp.role_id
       JOIN permissions p ON p.id = rp.permission_id
      WHERE r.deleted_at IS NULL
      ORDER BY r.slug ASC, p.name ASC`
  );
}

/** Roles for the matrix column headers: custom roles first, then the system set. */
export function matrixRoles() {
  return query<RowDataPacket>(
    `SELECT id, slug, name, description, is_system_role,
            (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = roles.id) AS permissions,
            (SELECT COUNT(*) FROM user_roles ur JOIN users u ON u.id = ur.user_id
              WHERE ur.role_id = roles.id AND u.deleted_at IS NULL) AS users
       FROM roles
      WHERE deleted_at IS NULL
      ORDER BY is_system_role ASC, name ASC`
  );
}

/* ──────────────────────────────── writes ──────────────────────────────── */

export async function updateUser(
  userId: number,
  changes: Record<string, string | number | null>,
  actorId: number
) {
  const columns = Object.keys(changes);
  if (!columns.length) return 0;
  const assignments = columns.map((column) => `${column} = ?`).join(', ');
  const result = await execute(
    `UPDATE users SET ${assignments}, updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => changes[column]), actorId, userId]
  );
  return Number(result.affectedRows ?? 0);
}

export async function setUserRoles(userId: number, roleIds: number[], assignedBy: number) {
  await execute('DELETE FROM user_roles WHERE user_id = ?', [userId]);
  for (const roleId of roleIds) {
    await execute('INSERT IGNORE INTO user_roles (user_id, role_id, assigned_by) VALUES (?, ?, ?)', [
      userId, roleId, assignedBy,
    ]);
  }
}

export async function archiveUser(userId: number, actorId: number) {
  // Soft delete: the record and its trail stay, the login stops working.
  const result = await execute(
    `UPDATE users SET deleted_at = NOW(), status = 'inactive', updated_by = ? WHERE id = ? AND deleted_at IS NULL`,
    [actorId, userId]
  );
  await execute('UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
  return Number(result.affectedRows ?? 0);
}

export async function restoreUser(userId: number, actorId: number) {
  return execute(
    `UPDATE users SET deleted_at = NULL, status = 'active', failed_login_count = 0, locked_until = NULL, updated_by = ?
      WHERE id = ?`,
    [actorId, userId]
  );
}

export async function unlockUser(userId: number) {
  return execute('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE id = ?', [userId]);
}

export async function revokeUserSessions(userId: number) {
  const result = await execute('UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
  return Number(result.affectedRows ?? 0);
}

export async function setPassword(userId: number, passwordHash: string, mustChange: boolean) {
  await execute(
    `UPDATE users SET password_hash = ?, is_first_login = ?, failed_login_count = 0, locked_until = NULL WHERE id = ?`,
    [passwordHash, mustChange ? 1 : 0, userId]
  );
  await revokeUserSessions(userId);
}

export async function upsertRole(input: {
  name: string;
  slug: string;
  description?: string | null;
  isSystemRole?: boolean;
}) {
  return execute(
    `INSERT INTO roles (name, slug, description, is_system_role) VALUES (?, ?, ?, ?)`,
    [input.name, input.slug, input.description ?? null, input.isSystemRole ? 1 : 0]
  );
}

export async function updateRole(roleId: number, changes: Record<string, string | null>) {
  const columns = Object.keys(changes);
  if (!columns.length) return 0;
  const assignments = columns.map((column) => `${column} = ?`).join(', ');
  const result = await execute(
    `UPDATE roles SET ${assignments} WHERE id = ? AND deleted_at IS NULL`,
    [...columns.map((column) => changes[column]), roleId]
  );
  return Number(result.affectedRows ?? 0);
}

export async function archiveRole(roleId: number) {
  const result = await execute('UPDATE roles SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [roleId]);
  return Number(result.affectedRows ?? 0);
}

/** Replaces a role's grants wholesale — the matrix is authoritative, not additive. */
export async function setRolePermissions(roleId: number, permissionNames: string[]) {
  await execute('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
  if (!permissionNames.length) return 0;

  const placeholders = permissionNames.map(() => '?').join(', ');
  const ids = await query<{ id: number } & RowDataPacket>(
    `SELECT id FROM permissions WHERE name IN (${placeholders})`,
    permissionNames
  );
  for (const row of ids) {
    await execute('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleId, row.id]);
  }
  return ids.length;
}

export async function permissionNamesExist(names: string[]) {
  if (!names.length) return [] as string[];
  const placeholders = names.map(() => '?').join(', ');
  const rows = await query<{ name: string } & RowDataPacket>(
    `SELECT name FROM permissions WHERE name IN (${placeholders})`,
    names
  );
  return rows.map((row) => row.name);
}

/** Users holding a role — used to refuse deleting a role that is in use. */
export async function roleUserCount(roleId: number) {
  const row = await queryOne<RowDataPacket>(
    `SELECT COUNT(*) AS total FROM user_roles ur JOIN users u ON u.id = ur.user_id
      WHERE ur.role_id = ? AND u.deleted_at IS NULL`,
    [roleId]
  );
  return Number(row?.total ?? 0);
}

export async function roleSlugExists(slug: string, excludeId?: number) {
  const params: SqlValue[] = [slug];
  let sql = 'SELECT id FROM roles WHERE slug = ? AND deleted_at IS NULL';
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  return queryOne<RowDataPacket>(`${sql} LIMIT 1`, params);
}

export async function userEmailExists(email: string, excludeId?: number) {
  const params: SqlValue[] = [email.toLowerCase()];
  let sql = 'SELECT id FROM users WHERE email = ? AND deleted_at IS NULL';
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  return queryOne<RowDataPacket>(`${sql} LIMIT 1`, params);
}

export async function usernameExists(username: string, excludeId?: number) {
  const params: SqlValue[] = [username.toLowerCase()];
  let sql = 'SELECT id FROM users WHERE username = ? AND deleted_at IS NULL';
  if (excludeId) {
    sql += ' AND id <> ?';
    params.push(excludeId);
  }
  return queryOne<RowDataPacket>(`${sql} LIMIT 1`, params);
}

export async function findRolesBySlugs(slugs: string[]) {
  if (!slugs.length) return [] as RowDataPacket[];
  const placeholders = slugs.map(() => '?').join(', ');
  return query<RowDataPacket>(
    `SELECT id, slug, name, is_system_role FROM roles WHERE slug IN (${placeholders}) AND deleted_at IS NULL`,
    slugs
  );
}

export async function existingUsernames(): Promise<Set<string>> {
  const rows = await query<{ username: string } & RowDataPacket>('SELECT username FROM users WHERE deleted_at IS NULL');
  return new Set(rows.map((row) => row.username));
}

/** Unlinked portal helpers: bind a login to an employer/auditor/employee record. */
export async function linkEmployer(userId: number, employerId: number) {
  await execute('INSERT IGNORE INTO employer_users (employer_id, user_id, is_primary) VALUES (?, ?, 0)', [employerId, userId]);
}

export async function linkAuditor(userId: number, auditorId: number) {
  await execute('UPDATE auditors SET user_id = ? WHERE id = ? AND deleted_at IS NULL', [userId, auditorId]);
}

export async function linkEmployee(userId: number, employeeId: number) {
  await execute('UPDATE employees SET user_id = ? WHERE id = ? AND deleted_at IS NULL', [userId, employeeId]);
}

export async function portalLinkCandidates() {
  const [employers, auditors, employees] = await Promise.all([
    query<RowDataPacket>(
      'SELECT id, company_name AS label FROM employers WHERE deleted_at IS NULL ORDER BY company_name ASC LIMIT 500'
    ),
    query<RowDataPacket>(
      'SELECT id, name AS label FROM auditors WHERE deleted_at IS NULL AND user_id IS NULL ORDER BY name ASC LIMIT 500'
    ),
    query<RowDataPacket>(
      `SELECT e.id, CONCAT(e.name, ' — ', e.employee_number) AS label
         FROM employees e WHERE e.deleted_at IS NULL AND e.user_id IS NULL
        ORDER BY e.name ASC LIMIT 500`
    ),
  ]);
  return { employers, auditors, employees };
}

/** Sessions across the platform, for the "active sessions" tile. */
export function liveSessions(limit = 25) {
  return query<RowDataPacket>(
    `SELECT s.id, s.user_id, s.ip_address, s.user_agent, s.created_at, s.expires_at,
            CONCAT(u.first_name, ' ', u.last_name) AS user_name, u.email
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.revoked_at IS NULL AND s.expires_at > NOW() AND u.deleted_at IS NULL
      ORDER BY s.created_at DESC
      LIMIT ?`,
    [limit]
  );
}
