/**
 * Runs every SQL file in database/seeds in filename order, then synchronises the
 * permission catalogue and role grants from lib/auth/rbac.ts so the permission
 * matrix stored in MySQL always matches the checks executed by the app.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import mysql from 'mysql2/promise';
import { loadEnv } from '../lib/utils/env';
import { executeSqlFile } from '../lib/db/sql-file';
import {
  PERMISSION_MODULES, PERMISSION_ACTIONS, permissionName, ROLE_DEFINITIONS,
  grantsForRole, roleHasFullAccess,
} from '../lib/auth/rbac-seed';

export async function runSeeds(): Promise<void> {
  loadEnv();
  const seedsDir = resolve(process.cwd(), 'database/seeds');
  // `--permissions-only` re-syncs the permission catalogue and role grants from code without
  // re-running the SQL seed files (which reset reference data such as leave types).
  const permissionsOnly = process.argv.includes('--permissions-only');
  const files = permissionsOnly ? [] : readdirSync(seedsDir).filter((f) => f.endsWith('.sql')).sort();

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: 'utf8mb4_unicode_ci',
  });

  for (const file of files) {
    try {
      const result = await executeSqlFile(conn, readFileSync(join(seedsDir, file), 'utf8'), file);
      console.log(`✓  seed ${file}  (${result.statements} statement(s))`);
    } catch (error) {
      console.error(`✗  ${(error as Error).message}`);
      await conn.end();
      process.exit(1);
    }
  }

  // ── Permission catalogue ───────────────────────────────────────────────
  for (const module of PERMISSION_MODULES) {
    for (const action of PERMISSION_ACTIONS) {
      await conn.query(
        `INSERT INTO permissions (name, module, action, description)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE module = VALUES(module), action = VALUES(action)`,
        [permissionName(module, action), module, action, `${action} access to ${module.replace(/_/g, ' ')}`]
      );
    }
  }
  console.log(`✓  ${PERMISSION_MODULES.length * PERMISSION_ACTIONS.length} permission definitions synchronised`);

  // ── Role grants ────────────────────────────────────────────────────────
  const [roles] = await conn.query<any[]>('SELECT id, slug FROM roles');
  const [permissionRows] = await conn.query<any[]>('SELECT id, name FROM permissions');
  const permissionIdByName = new Map<string, number>(permissionRows.map((row) => [row.name, row.id]));

  let grantCount = 0;
  for (const role of ROLE_DEFINITIONS) {
    const roleRow = roles.find((row) => row.slug === role.slug);
    if (!roleRow) {
      console.warn(`!  role ${role.slug} missing — skipped`);
      continue;
    }

    const granted = grantsForRole(role.slug);
    // Rebuild the grant set so permissions removed in code actually disappear.
    await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [roleRow.id]);

    for (const name of granted) {
      const permissionId = permissionIdByName.get(name);
      if (!permissionId) continue;
      await conn.query('INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [roleRow.id, permissionId]);
      grantCount += 1;
    }
    console.log(`✓  ${role.slug.padEnd(12)} → ${String(granted.length).padStart(3)} permission(s)${roleHasFullAccess(role.slug) ? '  (full access)' : ''}`);
  }

  const [counts] = await conn.query<any[]>(
    `SELECT
       (SELECT COUNT(*) FROM roles) AS roles,
       (SELECT COUNT(*) FROM permissions) AS permissions,
       (SELECT COUNT(*) FROM role_permissions) AS grants,
       (SELECT COUNT(*) FROM personal_file_checklist_items) AS checklist_items,
       (SELECT COUNT(*) FROM payroll_heads) AS payroll_heads,
       (SELECT COUNT(*) FROM leave_types) AS leave_types`
  );
  console.log(`\nTotal grants assigned this run: ${grantCount}`);
  console.log(counts[0]);
  await conn.end();
}

/**
 * Runs only when this file is the entry point, so `reset-database.ts` can import
 * the same routine without triggering a second run.
 */
const invokedDirectly = process.argv.some((arg) => arg.includes('run-seeds'));
if (invokedDirectly) {
  runSeeds().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
