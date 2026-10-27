/**
 * Creates (or resets) an administrator account from the command line.
 *
 *   npm run create:admin -- --email you@company.com --name "Jane Doe" --password 'Str0ng@Pass' --role super_admin
 *
 * Omit --password to have a strong temporary password generated and printed once.
 */
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { loadEnv } from '../lib/utils/env';
import { generateTemporaryPassword } from '../lib/auth/password';
import { ROLE_DEFINITIONS } from '../lib/auth/rbac-seed';

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  return process.argv[index + 1] ?? fallback;
}

async function main() {
  loadEnv();

  const email = arg('email');
  const name = arg('name');
  const role = arg('role', 'super_admin') as string;
  const password = arg('password');
  const mobile = arg('mobile');

  if (!email || !name) {
    console.error('Usage: npm run create:admin -- --email <email> --name "<Full Name>" [--password <pw>] [--role super_admin] [--mobile +91…]');
    process.exit(1);
  }
  if (!ROLE_DEFINITIONS.some((r) => r.slug === role)) {
    console.error(`Unknown role "${role}". Valid roles: ${ROLE_DEFINITIONS.map((r) => r.slug).join(', ')}`);
    process.exit(1);
  }

  const plainPassword = password ?? generateTemporaryPassword(14);
  const [firstName, ...rest] = name.trim().split(/\s+/);
  const lastName = rest.join(' ') || '-';
  const username = (arg('username') ?? email.split('@')[0]).toLowerCase().replace(/[^a-z0-9._-]/g, '');
  const passwordHash = await bcrypt.hash(plainPassword, 12);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  const [existing] = await conn.query<any[]>('SELECT id FROM users WHERE email = ? LIMIT 1', [email.toLowerCase()]);
  let userId: number;
  let action: string;

  if (existing.length) {
    userId = existing[0].id;
    await conn.query(
      `UPDATE users
          SET password_hash = ?, status = 'active', is_first_login = ?, first_name = ?, last_name = ?,
              mobile = COALESCE(?, mobile), deleted_at = NULL, failed_login_count = 0, locked_until = NULL
        WHERE id = ?`,
      [passwordHash, password ? 0 : 1, firstName, lastName, mobile ?? null, userId]
    );
    action = 'updated';
  } else {
    const [result] = await conn.query<any>(
      `INSERT INTO users (uuid, email, username, password_hash, first_name, last_name, mobile, status, is_first_login)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [randomUUID(), email.toLowerCase(), username, passwordHash, firstName, lastName, mobile ?? null, password ? 0 : 1]
    );
    userId = result.insertId;
    action = 'created';
  }

  const [roleRows] = await conn.query<any[]>('SELECT id, name FROM roles WHERE slug = ?', [role]);
  if (!roleRows.length) {
    console.error(`Role "${role}" is not seeded. Run \`npm run db:seed\` first.`);
    await conn.end();
    process.exit(1);
  }
  await conn.query('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleRows[0].id]);

  const [permissionCount] = await conn.query<any[]>(
    `SELECT COUNT(*) AS total
       FROM role_permissions rp
       JOIN user_roles ur ON ur.role_id = rp.role_id
      WHERE ur.user_id = ?`,
    [userId]
  );

  console.log(`\n✓ Admin ${action}: ${email}`);
  console.log(`  User ID   : ${userId}`);
  console.log(`  Username  : ${username}`);
  console.log(`  Role      : ${roleRows[0].name} (${permissionCount[0].total} permissions)`);
  if (!password) {
    console.log(`  Password  : ${plainPassword}`);
    console.log('  ↑ generated temporary password — the user must change it at first sign-in.');
  } else {
    console.log('  Password  : (as supplied)');
  }
  await conn.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
