import { z } from 'zod';
import { isValidGstin } from '@/lib/billing/gst';

const text = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const id = z.coerce.number().int().positive().optional().nullable().transform((v) => v ?? null);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date');
const optDay = z.union([day, z.literal(''), z.null()]).optional().transform((v) => (v ? v : null));
const gstin = z.string().trim().toUpperCase().optional().nullable().transform((v) => (v ? v : null))
  .refine((v) => v === null || isValidGstin(v), 'Not a valid GSTIN (15 characters, e.g. 33AABCS1234D1Z5)');
const stateCode = z.string().trim().regex(/^\d{2}$/, 'Two digits, e.g. 33').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null));
const money = z.coerce.number().min(0, 'Cannot be negative').max(100000000);
const rate = z.coerce.number().min(0).max(28, 'A GST rate is between 0 and 28');

export const serviceSchema = z.object({
  name: z.string().trim().min(2, 'Give the service a name').max(200),
  scope: text(2000),
  frequency: z.string().trim().min(1).max(30).default('Monthly'),
  default_fee: money.default(0),
  sac_code: text(10),
  status: z.enum(['active', 'inactive']).default('active'),
});

export const quotationItemSchema = z.object({
  category: z.string().trim().min(1, 'Name the service').max(200),
  scope: text(2000),
  frequency: z.string().trim().min(1).max(30).default('Monthly'),
  sac_code: text(10),
  fee: money,
});

export const quotationSchema = z.object({
  employer_id: id,
  client_name: z.string().trim().min(2, 'Name the client').max(255),
  client_address: text(500),
  client_contact: text(255),
  contact_designation: text(150),
  client_profile: text(500),
  employee_strength: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().min(0).max(1000000).nullable()).default(null),
  shifts: z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().min(0).max(20).nullable()).default(null),
  industry: text(150),
  service_period: z.string().trim().max(60).optional().nullable().transform((v) => (v ? v : 'Monthly / Renewable')),
  payment_terms: z.array(z.string().trim().min(1).max(300)).max(12).optional().default([]),
  client_gstin: gstin,
  client_state_code: stateCode,
  subject: text(300),
  directive: text(2000),
  framework_elements: z.array(z.string().trim().min(1).max(300)).max(12).optional().default([]),
  notes: text(2000),
  quote_date: day,
  valid_until: optDay,
  gst_percent: rate.default(18),
  items: z.array(quotationItemSchema).min(1, 'Add at least one service line').max(40),
}).refine((q) => !q.valid_until || q.valid_until >= q.quote_date, { path: ['valid_until'], message: 'Valid until cannot be before the quotation date' });

export const quotationStatusSchema = z.object({ status: z.enum(['Sent', 'Accepted', 'Rejected', 'Expired']) });

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, 'Describe the service').max(500),
  sac_code: text(10),
  quantity: z.coerce.number().gt(0, 'Quantity must be above zero').max(1000000),
  uom: text(20),
  unit_price: money,
  gst_percent: rate.default(18),
});

export const invoiceSchema = z.object({
  employer_id: id,
  quotation_id: id,
  buyer_name: z.string().trim().min(2, 'Name the buyer').max(255),
  buyer_address: text(500),
  buyer_gstin: gstin,
  buyer_pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'A PAN is 10 characters, e.g. AABCS1234D').optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  buyer_state_code: stateCode,
  consignee_name: text(255),
  consignee_address: text(500),
  invoice_date: day,
  payment_terms: z.string().trim().min(1).max(100).default('Net 30 days'),
  place_of_supply: text(100),
  notes: text(2000),
  items: z.array(invoiceItemSchema).min(1, 'Add at least one line').max(40),
});

export const cancelSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });

export const paymentSchema = z.object({
  amount: z.coerce.number().gt(0, 'Enter the amount received').max(100000000),
  payment_date: day,
  mode: z.enum(['Bank transfer', 'UPI', 'Cheque', 'Cash', 'Card / online']).default('Bank transfer'),
  reference: text(150),
  remarks: text(300),
});
