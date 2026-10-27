import { z } from 'zod';
import { optBool, optDate, optId, optNumber, optText } from '@/lib/validations/partial-fields';

export const NOC_STATUSES = ['Applied', 'Valid', 'Expiring Soon', 'Expired', 'Cancelled'] as const;
export const CONDITION_STATES = ['Not Checked', 'Compliant', 'Non-Compliant', 'Not Applicable'] as const;
export const METER_SOURCES = ['Borewell', 'Municipal', 'RO Feed', 'Canteen', 'Toilet', 'Guest House', 'Hydrant', 'Gardening', 'Boiler', 'Laboratory', 'Other'] as const;
export const METER_UNITS = ['KL', 'L'] as const;

const requiredText = (min: number, max: number, message: string) =>
  z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().min(min, message).max(max));

const nocFields = {
  unit_id: optId,
  title: optText(255),
  issuing_authority: optText(255),
  applied_on: optDate,
  issue_date: optDate,
  expiry_date: optDate,
  renewal_cycle_years: z.coerce.number().int().min(1).max(10).optional(),
  purpose: optText(255),
  purpose_domestic_lpd: optNumber(),
  purpose_gardening_lpd: optNumber(),
  purpose_other_lpd: optNumber(),
  well_type: optText(100),
  well_depth_m: optNumber(5000),
  well_diameter_in: optNumber(500),
  pump_hp: optNumber(5000),
  pumping_hours_per_day: optNumber(24),
  abstraction_structures: z.preprocess((v) => (v === '' || v === null ? null : v), z.coerce.number().int().min(0).max(1000).nullable()).optional(),
  status: z.preprocess((v) => (v === '' ? null : v), z.enum(NOC_STATUSES).nullable()).optional(),
  notes: optText(4000),
};

/** The purposes (domestic, gardening, other) cannot add up to more than the approved quantity. */
function checkNoc(value: { approved_quantity_lpd?: number; purpose_domestic_lpd?: number | null; purpose_gardening_lpd?: number | null; purpose_other_lpd?: number | null; issue_date?: string | null; expiry_date?: string | null }, ctx: z.RefinementCtx) {
  const parts = [value.purpose_domestic_lpd, value.purpose_gardening_lpd, value.purpose_other_lpd].filter((n): n is number => typeof n === 'number');
  if (value.approved_quantity_lpd !== undefined && parts.length && parts.reduce((a, b) => a + b, 0) > value.approved_quantity_lpd + 0.001) {
    ctx.addIssue({ code: 'custom', path: ['purpose_domestic_lpd'], message: 'The domestic, gardening and other quantities add up to more than the approved quantity' });
  }
  if (value.issue_date && value.expiry_date && value.expiry_date < value.issue_date) {
    ctx.addIssue({ code: 'custom', path: ['expiry_date'], message: 'The expiry date is before the issue date' });
  }
}

export const nocCreateSchema = z
  .object({
    employer_id: z.coerce.number().int().positive('Select the company'),
    noc_number: requiredText(2, 150, 'Enter the NOC number'),
    approved_quantity_lpd: z.coerce.number().positive('Enter the approved quantity in litres per day').max(1e9),
    standard_conditions: optBool,
    ...nocFields,
  })
  .superRefine(checkNoc);

export const nocUpdateSchema = z
  .object({
    noc_number: requiredText(2, 150, 'Enter the NOC number').optional(),
    approved_quantity_lpd: z.coerce.number().positive('Enter the approved quantity in litres per day').max(1e9).optional(),
    ...nocFields,
  })
  .superRefine(checkNoc);

export const conditionCreateSchema = z.object({
  clause_no: optText(20),
  condition_text: requiredText(5, 4000, 'Write the condition'),
  compliance: z.enum(CONDITION_STATES).optional(),
  remarks: optText(2000),
});

export const conditionUpdateSchema = z.object({
  clause_no: optText(20),
  condition_text: requiredText(5, 4000, 'Write the condition').optional(),
  compliance: z.enum(CONDITION_STATES).optional(),
  remarks: optText(2000),
});

export const meterSchema = z.object({
  name: requiredText(2, 150, 'Name the meter'),
  source: z.enum(METER_SOURCES).optional(),
  reading_unit: z.enum(METER_UNITS).optional(),
  counts_toward_noc: optBool,
  unit_id: optId,
  status: z.enum(['active', 'inactive']).optional(),
  notes: optText(500),
});

export const meterUpdateSchema = meterSchema.partial();

export const readingSchema = z.object({
  reading_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the date picker'),
  reading_value: z.coerce.number().min(0, 'A meter reading cannot be negative').max(1e12),
  is_reset: optBool,
  remarks: optText(500),
});

export const readingUpdateSchema = readingSchema.partial();
