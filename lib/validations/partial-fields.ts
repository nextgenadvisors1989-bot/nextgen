/**
 * Zod field helpers for "partial update" APIs: a blank string becomes null, while a key that is absent stays undefined, so
 * a PATCH only touches what the caller sent.
 */
import { z } from 'zod';

export const optText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === 'string' ? (value.trim() === '' ? null : value.trim()) : value),
    z.string().max(max, `Keep this under ${max} characters`).nullable()
  ).optional();

export const optId = z
  .preprocess((value) => (value === '' || value === null ? null : value), z.coerce.number().int().positive().nullable())
  .optional();

export const optDate = z
  .preprocess(
    (value) => (value === '' ? null : value),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker').nullable()
  )
  .optional();

/** A non-negative number that may be blank (null). */
export const optNumber = (max = 1e12) =>
  z.preprocess(
    (value) => (value === '' || value === null ? null : value),
    z.coerce.number().min(0, 'Cannot be negative').max(max, 'That number is too large').nullable()
  ).optional();

export const optBool = z.preprocess((value) => (value === 'true' ? true : value === 'false' ? false : value), z.boolean()).optional();
