/**
 * Document-vault contracts.
 *
 * The vault is one table (`files`) with an immutable `file_versions` history.
 * These schemas cover the library screen's list query, the metadata editor and
 * the archival lifecycle. Uploads themselves arrive as multipart form data and
 * are validated byte-for-byte by `validateUpload()` in the file service.
 */
import { z } from 'zod';
import { FILE_ACCESS_LEVELS, FILE_ENTITY_TYPES } from '@/types/file';

const optionalString = (max: number) =>
  z.string().trim().max(max).optional().nullable()
    .transform((value) => (value === '' ? null : value ?? null));

const optionalText = (max: number) =>
  z.union([z.string().max(max), z.literal('')]).optional().nullable()
    .transform((value) => (value === '' ? null : value ?? null));

const optionalDate = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value ?? null));

const optionalId = z.coerce.number().int().positive().optional().nullable();

/**
 * Patch helpers. Unlike the list filters, an absent field must stay absent so
 * "not provided" is distinguishable from "clear this value": a blank string is
 * an explicit clear (null), a missing key leaves the column untouched.
 */
const patchString = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((value) => (value === '' ? null : value));

const patchText = (max: number) =>
  z.union([z.string().max(max), z.literal('')]).optional().nullable().transform((value) => (value === '' ? null : value));

const patchDate = z
  .union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker'), z.literal('')])
  .optional()
  .nullable()
  .transform((value) => (value === '' ? null : value));

const booleanish = z
  .union([z.boolean(), z.literal(0), z.literal(1), z.literal('0'), z.literal('1'), z.literal('true'), z.literal('false')])
  .transform((value) => value === true || value === 1 || value === '1' || value === 'true');

export const FILE_ENTITY_TYPE_VALUES = FILE_ENTITY_TYPES;
export const FILE_ACCESS_LEVEL_VALUES = FILE_ACCESS_LEVELS;

/** Lifecycle is expressed as one filter so the table can show a clean segment. */
export const FILE_STATUSES = ['current', 'archived', 'all'] as const;
export const FILE_KINDS = ['pdf', 'image', 'sheet', 'doc', 'archive', 'other'] as const;

export const fileListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(200).optional().default(10),
  search: optionalString(200),
  sortBy: optionalString(50),
  sortDir: z.enum(['asc', 'desc']).optional(),
  entity_type: optionalString(30),
  entity_id: optionalId,
  access_level: optionalString(20),
  category: optionalString(100),
  extension: optionalString(20),
  kind: z.enum(FILE_KINDS).optional(),
  status: z.enum(FILE_STATUSES).optional().default('current'),
  uploaded_by: optionalId,
  from_date: optionalDate,
  to_date: optionalDate,
});

export type FileListFilters = z.infer<typeof fileListQuerySchema>;

/** Metadata edit — every field optional, absent fields are left untouched. */
export const fileMetadataSchema = z.object({
  original_name: z.string().trim().min(1, 'Enter a file name').max(500).optional(),
  category: patchString(100),
  description: patchText(500),
  tags: patchText(500),
  access_level: z.enum(FILE_ACCESS_LEVEL_VALUES).optional(),
  expires_at: patchDate,
  // `false` on an archived document restores it; `true` archives it.
  is_archived: booleanish.optional(),
  change_note: patchText(500),
});

export type FileMetadataInput = z.infer<typeof fileMetadataSchema>;

/** Archival is a soft delete with a reason so the trail explains itself. */
export const fileArchiveSchema = z.object({
  reason: optionalText(500),
});
