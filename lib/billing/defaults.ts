/**
 * The wording a new quotation starts with (taken from the client's premium quotation). Each list can be overridden under
 * Settings > Company > Billing (one line per entry); these are the fallbacks when the setting is blank.
 */
export const DEFAULT_QUOTATION_ELEMENTS = [
  'Monthly compliance review across all applicable laws',
  'One site visit per month (additional visit: chargeable)',
  'Employee training / toolbox talk (one session per month)',
  'Grievance support and follow up',
  'Monthly compliance report & management meeting',
  'Email / phone support during working hours',
  'Corrective action tracking and documentation support',
];

export const DEFAULT_QUOTATION_NOTES = [
  'Additional site visit: Rs 2,500 per visit',
  'Special audit / assessment / certification support will be quoted separately',
  'Travel outside the home district will be chargeable as per actual',
  'Quotation valid for 30 days from the date of issue',
  'Price may vary based on employee strength, number of shifts, site locations and risk category',
];

export const DEFAULT_PAYMENT_TERMS = [
  'Invoice will be raised at the beginning of each month',
  'Payment to be made within 15 days from the invoice date',
  'Payments through Bank Transfer / NEFT / RTGS',
  'Taxes will be charged as applicable',
  'Advance payment for additional assignments',
];

export const DEFAULT_OBJECTIVE = 'Our objective is to ensure full statutory compliance, safe working environment, employee welfare, risk reduction and sustainable operations through a structured monthly support system.';
export const DEFAULT_SUBJECT = 'Monthly Professional Service Price Quotation for Employee Compliance, Labour Welfare, Industrial Safety, Social Security, Wage & Payroll Compliance, Grievance Redressal, Social Compliance, Environment & Sustainability Support Services.';
export const DEFAULT_VALIDITY_DAYS = 30;

/** The seven pillars shown under the firm's name on the quotation. */
export const BRAND_PILLARS: { label: string; icon: string; color: string }[] = [
  { label: 'COMPLIANCE', icon: 'users', color: '#2B4C9B' },
  { label: 'SAFETY', icon: 'hardhat', color: '#3D9A3D' },
  { label: 'PEOPLE', icon: 'users', color: '#E8742A' },
  { label: 'SOCIAL RESPONSIBILITY', icon: 'heart', color: '#D6336C' },
  { label: 'ENVIRONMENT', icon: 'globe', color: '#118A7E' },
  { label: 'ESG', icon: 'globe', color: '#1C7C9E' },
  { label: 'SUSTAINABILITY', icon: 'leaf', color: '#7048A8' },
];

/** The icon drawn beside a service line, picked from its name (an administrator can rename a service freely). */
export function serviceIcon(name: string): string {
  const n = name.toLowerCase();
  if (/fire|emergency/.test(n)) return 'flame';
  if (/wage|payroll|salary|working hours/.test(n)) return 'rupee';
  if (/social security|epf|esi|gratuity|bonus/.test(n)) return 'users';
  if (/safety|hazard|risk|occupational/.test(n)) return 'shield';
  if (/grievance|relations|industrial relations|\bir\b/.test(n)) return 'users';
  if (/human rights|social compliance|welfare|ethic/.test(n)) return 'heart';
  if (/environment|sustainab|waste|water|energy|carbon|ghg|esg/.test(n)) return 'leaf';
  if (/training|toolbox|awareness|capacity/.test(n)) return 'book';
  if (/report|review|dashboard|management/.test(n)) return 'chart';
  if (/audit|legal|labour|law|compliance|register/.test(n)) return 'clipboard';
  return 'file';
}
