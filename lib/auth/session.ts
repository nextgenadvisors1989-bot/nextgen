/**
 * Session management.
 *
 * Cookie carries a signed JWT (HS256 via jose) whose `nonce` is hashed into the
 * `sessions` row. This gives us two independent guarantees:
 *   1. Middleware can verify the token signature at the edge with no DB round trip.
 *   2. Server code can revoke any session instantly by clearing the row.
 */
import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { query, queryOne, insert, execute } from '@/lib/db/mysql';
import type { SessionPayload } from '@/types/user';

export const SESSION_COOKIE = 'cos_session';
export const CSRF_COOKIE = 'cos_csrf';

function secret(): Uint8Array {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error('SESSION_SECRET must be set to at least 32 characters');
  }
  return new TextEncoder().encode(value);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function ttlSeconds(rememberMe = false): number {
  const hours = rememberMe
    ? Number(process.env.SESSION_REMEMBER_TTL_HOURS ?? 720)
    : Number(process.env.SESSION_TTL_HOURS ?? 8);
  return hours * 3600;
}

export interface CreateSessionInput {
  userId: number;
  /** Primary role slug — embedded in the JWT so edge middleware can route without a DB hit. */
  roleSlug?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  rememberMe?: boolean;
}

export interface CreatedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
  csrfToken: string;
}

export async function createSession({
  userId,
  roleSlug,
  ipAddress = null,
  userAgent = null,
  rememberMe = false,
}: CreateSessionInput): Promise<CreatedSession> {
  const sessionId = randomUUID();
  const nonce = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + ttlSeconds(rememberMe) * 1000);

  await insert(
    `INSERT INTO sessions (id, user_id, token_hash, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, hashToken(nonce), ipAddress, userAgent?.slice(0, 500) ?? null, expiresAt]
  );

  const token = await new SignJWT({ sid: sessionId, uid: userId, nonce, role: roleSlug ?? null })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secret());

  return { token, sessionId, expiresAt, csrfToken: randomBytes(24).toString('hex') };
}

/** Edge-safe signature + expiry check (no database access). */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Full server-side validation: signature, session row, revocation and expiry,
 * then the user record itself (status + soft delete).
 */
export async function resolveSession(
  token: string
): Promise<{ sessionId: string; userId: number } | null> {
  const payload = await verifySessionToken(token);
  if (!payload?.sid || !payload?.nonce) return null;

  const row = await queryOne<{ id: string; user_id: number; status: string; deleted_at: string | null }>(
    `SELECT s.id, s.user_id, u.status, u.deleted_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.id = ?
        AND s.token_hash = ?
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
      LIMIT 1`,
    [payload.sid, hashToken(payload.nonce)]
  );

  if (!row) return null;
  if (row.status !== 'active' || row.deleted_at !== null) return null;
  return { sessionId: row.id, userId: row.user_id };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await execute('UPDATE sessions SET revoked_at = NOW() WHERE id = ? AND revoked_at IS NULL', [sessionId]);
}

export async function revokeAllUserSessions(userId: number, exceptSessionId?: string): Promise<number> {
  const sql = exceptSessionId
    ? 'UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND id <> ? AND revoked_at IS NULL'
    : 'UPDATE sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL';
  const params = exceptSessionId ? [userId, exceptSessionId] : [userId];
  const result = await execute(sql, params);
  return result.affectedRows;
}

/** Removes expired rows — called by the nightly cleanup job. */
export async function purgeExpiredSessions(): Promise<number> {
  const result = await execute('DELETE FROM sessions WHERE expires_at < NOW() OR revoked_at IS NOT NULL');
  return result.affectedRows;
}

export async function listUserSessions(userId: number) {
  return query(
    `SELECT id, ip_address, user_agent, expires_at, revoked_at, created_at
       FROM sessions WHERE user_id = ? AND expires_at > NOW() AND revoked_at IS NULL
      ORDER BY created_at DESC`,
    [userId]
  );
}
