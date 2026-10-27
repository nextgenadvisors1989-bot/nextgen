import { z } from 'zod';

export const SKILL_LEVELS = ['Unskilled', 'Semi-skilled', 'Skilled', 'Supervisory', 'Junior Executive', 'Senior Executive', 'Chief Executive'] as const;
export const STATUTORY_CATEGORIES = ['As per notification', 'Check applicability', 'Contract / appointment basis'] as const;

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const money = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(0, 'Cannot be negative').max(10000000).nullable()).default(null);

export const designationSchema = z.object({
  designation_name: z.string().trim().min(2, 'Give the designation a name').max(200),
  industry_code: z.string().trim().toUpperCase().regex(/^[A-Z]$/, 'One letter, e.g. A').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  industry_name: text(120),
  group_name: text(150),
  department: text(150),
  skill_level: z.enum(SKILL_LEVELS).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  nature_of_work: text(255),
  statutory_category: z.enum(STATUTORY_CATEGORIES).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  wage_basic: money,
  wage_da: money,
  wage_allowance: money,
  wage_ot: money,
  status: z.enum(['active', 'inactive']).default('active'),
  /** Administrators only: the company this designation belongs to (blank is the shared master). */
  employer_id: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().positive().nullable()).default(null),
});

export type DesignationInput = z.infer<typeof designationSchema>;

export const designationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(25),
  search: z.string().trim().max(100).optional(),
  industry: z.string().trim().max(1).optional(),
  level: z.string().trim().max(40).optional(),
  department: z.string().trim().max(150).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  scope: z.enum(['all', 'master', 'company']).optional(),
  employer_id: z.coerce.number().int().positive().optional(),
});
