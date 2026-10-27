/**
 * Users, roles and permissions contracts.
 *
 * The platform's access model is: a user holds roles, a role holds permissions,
 * and a permission is `<module>.<action>`. These schemas cover the whole
 * administration surface — the user register, role CRUD and the permission
 * matrix editor.
 */
import { z } from 'zod';
import { PERMISSION_ACTIONS } from '@/lib/auth/rbac';

const asTuple = <T extends string>(values: readonly T[]): [T, ...T[]] => [...values] as [T, ...T[]];

/**
 * Optional text. An absent key stays `undefined` ("not provided"), an empty
 * string becomes `null` ("clear this field") — a distinction the update paths
 * depend on: a PATCH that omits a field must never blank it.
 */
const optionalString = (max: number) =>
  z.preprocess((value) => (value === '' ? null : value), z.string().trim().max(max).nullish());

const optionalEmail = z.preprocess(
  (value) => (value === '' ? null : value),
  z.string().trim().toLowerCase().email('Enter a valid email address').nullish()
);

const optionalPhone = z.preprocess(
  (value) => (value === '' ? null : value),
  z.string().trim().regex(/^[+]?[0-9\s-]{6,20}$/, 'Enter a valid phone number').nullish()
);

const baseListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: optionalString(200),
  sortBy: optionalString(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
});

export const USER_STATUSES = ['active', 'inactive', 'suspended', 'locked'] as const;

/* ──────────────────────────────── users ────────────────────────────────── */

export const userListQuerySchema = baseListQuerySchema.extend({
  role: optionalString(40),
  status: optionalString(20),
  portal: optionalString(30),
  /** `true`/`false` filter for accounts still holding an unexpired lock. */
  locked: z.enum(['all', 'true', 'false']).optional().default('all'),
  pending_activation: z.enum(['all', 'true', 'false']).optional().default('all'),
  /** `true` lists only soft-deleted accounts; anything else lists live ones. */
  archived: z.enum(['all', 'true', 'false']).optional().default('all'),
  from_date: optionalString(10),
  to_date: optionalString(10),
});

/** The portals a login can be bound to, derived from its roles and link rows. */
export const USER_PORTALS = ['admin', 'auditor', 'verifier', 'employer', 'employee', 'unlinked'] as const;

export const userCreateSchema = z.object({
  first_name: z.string().trim().min(1, 'First name is required').max(100),
  last_name: z.string().trim().min(1, 'Last name is required').max(100),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(190),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'Username must be at least 3 characters')
    .max(60)
    .regex(/^[a-z0-9._-]+$/, 'Use lowercase letters, numbers, dot, underscore or hyphen only')
    .optional(),
  mobile: optionalPhone,
  role_slugs: z.array(z.string().trim().min(1).max(40)).min(1, 'Assign at least one role'),
  status: z.enum(['active', 'inactive', 'suspended']).optional().default('active'),
  /** When true the account is created with a temporary password and activation link. */
  send_credentials: z.boolean().optional().default(true),
  password: z.string().min(8).max(72).optional().nullable(),
  employer_id: z.coerce.number().int().positive().optional().nullable(),
  auditor_id: z.coerce.number().int().positive().optional().nullable(),
  employee_id: z.coerce.number().int().positive().optional().nullable(),
});

export const userUpdateSchema = z.object({
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().min(1).max(100).optional(),
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(190).optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9._-]+$/, 'Use lowercase letters, numbers, dot, underscore or hyphen only')
    .optional(),
  mobile: optionalPhone,
  status: z.enum(['active', 'inactive', 'suspended']).optional(),
  profile_photo: optionalString(500),
});

export const roleAssignmentSchema = z.object({
  role_slugs: z.array(z.string().trim().min(1).max(40)).min(1, 'Assign at least one role'),
  reason: optionalString(300),
});

/* ──────────────────────────────── roles ────────────────────────────────── */

export const roleListQuerySchema = baseListQuerySchema.extend({
  kind: z.enum(['all', 'system', 'custom']).optional().default('all'),
});

export const roleCreateSchema = z.object({
  name: z.string().trim().min(2, 'Role name is required').max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Role slug is required')
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers and underscores; start with a letter')
    .optional(),
  description: optionalString(500),
  /** Permission names to grant. Unknown names are rejected. */
  permissions: z.array(z.string().trim().min(1).max(80)).optional().default([]),
  /** Copy the grants of an existing role before applying `permissions`. */
  clone_from: optionalString(50),
});

export const roleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: optionalString(500),
});

/** Matrix save: the full desired set of permission names for one role. */
export const rolePermissionSchema = z.object({
  permissions: z.array(z.string().trim().min(1).max(80)),
});

/** Bulk matrix save across several roles in one request. */
export const permissionMatrixSchema = z.object({
  roles: z
    .array(z.object({
      role_slug: z.string().trim().min(1).max(50),
      permissions: z.array(z.string().trim().min(1).max(80)),
    }))
    .min(1, 'Send at least one role'),
});

/** Guard so a typo cannot silently create an unknown action. */
export const PERMISSION_ACTION_VALUES = PERMISSION_ACTIONS;
export const PERMISSION_ACTION_TUPLE = asTuple(PERMISSION_ACTIONS);

/* ───────────────────────────── inferred types ───────────────────────────── */

export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
export type RoleAssignmentInput = z.infer<typeof roleAssignmentSchema>;
export type RoleListQuery = z.infer<typeof roleListQuerySchema>;
export type RoleCreateInput = z.infer<typeof roleCreateSchema>;
export type RoleUpdateInput = z.infer<typeof roleUpdateSchema>;
export type RolePermissionInput = z.infer<typeof rolePermissionSchema>;
export type PermissionMatrixInput = z.infer<typeof permissionMatrixSchema>;
