/**
 * The company's own details (name, address, phone, e-mail, GSTIN, CIN) as the client keeps them in
 * Admin -> Settings -> Company settings. Public pages, e-mails and notifications read them from here, so a change in
 * Settings reaches every one of them; the constants in lib/utils/constants.ts are only the fallback for a blank field.
 * Sample values from the first seed are ignored (see lib/utils/sample-values.ts).
 */
import { query, type RowDataPacket } from '@/lib/db/mysql';
import { COMPANY_LEGAL } from '@/lib/utils/constants';
import { isSampleValue } from '@/lib/utils/sample-values';

export interface CompanyLegal { name: string; address: string; email: string; phone: string; gstin: string; cin: string }

export async function getCompanyLegal(): Promise<CompanyLegal> {
  const rows = await query<RowDataPacket>(
    "SELECT setting_key, setting_value FROM settings WHERE setting_group = 'company' AND setting_key IN ('company_name','company_address','company_email','company_phone','company_gstin','company_cin')"
  ).catch(() => [] as RowDataPacket[]);
  const stored: Record<string, string> = {};
  for (const row of rows) {
    const value = String(row.setting_value ?? '').trim();
    if (value && !isSampleValue(value)) stored[String(row.setting_key)] = value;
  }
  return {
    name: stored.company_name || COMPANY_LEGAL.name,
    address: stored.company_address || COMPANY_LEGAL.address,
    email: stored.company_email || COMPANY_LEGAL.email,
    phone: stored.company_phone || COMPANY_LEGAL.phone,
    gstin: stored.company_gstin || '',
    cin: stored.company_cin || '',
  };
}
