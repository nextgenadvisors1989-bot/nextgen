/** The company that issues quotations, invoices and receipts, read from Company Settings. */
import { query, type RowDataPacket } from '@/lib/db/mysql';
import { companyBranding } from '@/lib/pdf/branding';

export interface Seller { brandName: string; quotationTagline: string; website: string; name: string; address: string; email: string; phone: string; gstin: string; pan: string; state: string; stateCode: string; tagline: string; bank: string; account: string; ifsc: string; terms: string[]; signatory: string; logo: Buffer | null; letterhead: Buffer | null }

export async function seller(): Promise<Seller> {
  const [rows, branding] = await Promise.all([query<RowDataPacket>("SELECT setting_key, setting_value FROM settings WHERE setting_group = 'company'"), companyBranding()]);
  const s = Object.fromEntries(rows.map((row) => [String(row.setting_key), String(row.setting_value ?? '').trim()]));
  return {
    brandName: s.quotation_brand_name || s.company_name || branding.name || 'NextGen Socio & Enviro Advisors', quotationTagline: s.quotation_tagline || s.company_tagline || '',
    website: s.company_website ?? '', name: s.company_name || branding.name || 'NextGen Socio & Enviro Advisors', address: s.company_address || branding.address, email: s.company_email ?? '', phone: s.company_phone ?? '', gstin: s.company_gstin ?? '', pan: s.company_pan ?? '',
    state: s.company_state ?? '', stateCode: s.company_state_code || '33', tagline: s.company_tagline ?? '', bank: s.bank_name ?? '', account: s.bank_account_number ?? '', ifsc: s.bank_ifsc ?? '',
    terms: (s.invoice_terms ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean), signatory: s.signatory_name ?? '', logo: branding.logo, letterhead: branding.letterhead,
  };
}

