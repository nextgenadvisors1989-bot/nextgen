import { z } from 'zod';

export const ENQUIRY_TYPES = ['demo', 'sales', 'support', 'partnership', 'careers', 'other'] as const;

export const contactEnquirySchema = z.object({
  name: z.string().trim().min(2, 'Please enter your full name').max(200),
  email: z.string().trim().email('Enter a valid email address').max(255),
  mobile: z
    .union([z.string().trim().regex(/^[0-9+\-\s()]{6,20}$/, 'Enter a valid phone number'), z.literal('')])
    .optional()
    .transform((value) => (value === '' ? null : value ?? null)),
  company_name: z.string().trim().max(255).optional().transform((value) => (value === '' ? null : value ?? null)),
  subject: z.string().trim().min(3, 'Please add a subject').max(255),
  message: z.string().trim().min(10, 'Please describe your requirement in at least 10 characters').max(5000),
  enquiry_type: z.enum(ENQUIRY_TYPES).optional().default('demo'),
  // Honeypot: bots fill hidden fields, humans never see them.
  website: z.string().optional(),
});

export type ContactEnquiryInput = z.infer<typeof contactEnquirySchema>;
