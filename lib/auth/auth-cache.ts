/**
 * Short-lived cache of the resolved identity, keyed by session token.
 *
 * Resolving a user costs about eight queries (session, user, roles, permissions,
 * three scoping lookups) and one request used to do it several times — the panel
 * layout, the page guard and the API guard each asked again. Caching for a few
 * seconds turns those into one, while any write that can change who a user is or
 * what they may do (roles, permissions, sessions, status, employer links) drops
 * the cache immediately, so revocation is never delayed.
 *
 * No imports on purpose: the database layer calls into this module.
 */
import type { AuthUser } from '@/types/user';

const TTL_MS = 10_000;
const MAX_ENTRIES = 500;

interface Entry { user: AuthUser; expiresAt: number }

declare global {
  // eslint-disable-next-line no-var
  var __authCache: Map<string, Entry> | undefined;
  // eslint-disable-next-line no-var
  var __authInflight: Map<string, Promise<AuthUser | null>> | undefined;
}

const store = () => (global.__authCache ??= new Map<string, Entry>());
const inflight = () => (global.__authInflight ??= new Map<string, Promise<AuthUser | null>>());

/** Returns the cached identity for a token, or resolves it once for concurrent callers. */
export function cachedAuthUser(token: string, resolve: () => Promise<AuthUser | null>): Promise<AuthUser | null> {
  const hit = store().get(token);
  if (hit && hit.expiresAt > Date.now()) return Promise.resolve(hit.user);

  const pending = inflight().get(token);
  if (pending) return pending;

  const generation = clearGeneration;
  const promise = resolve()
    .then((user) => {
      // A write that landed while we were resolving may have made this result stale.
      if (user && generation === clearGeneration) {
        const map = store();
        if (map.size >= MAX_ENTRIES) map.delete(map.keys().next().value as string);
        map.set(token, { user, expiresAt: Date.now() + TTL_MS });
      }
      return user;
    })
    .finally(() => inflight().delete(token));
  inflight().set(token, promise);
  return promise;
}

let clearGeneration = 0;

export function clearAuthCache(): void {
  clearGeneration += 1;
  store().clear();
  inflight().clear();
}

const AUTH_TABLES = /\b(users|user_roles|roles|role_permissions|permissions|sessions|employer_users)\b/i;
const WRITE = /^\s*(INSERT|UPDATE|DELETE|REPLACE)\b/i;

/** Called by the database layer after every write statement. */
export function noteWrite(sql: string): void {
  if (WRITE.test(sql) && AUTH_TABLES.test(sql)) clearAuthCache();
}
