/** Number, currency, and text formatting. Indian numbering system throughout. */

export function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(num) ? num : fallback;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** ₹1,23,456.78 — Indian grouping. */
export function formatCurrency(value: unknown, options: { decimals?: number; symbol?: string } = {}): string {
  const { decimals = 2, symbol = '₹' } = options;
  const amount = toNumber(value);
  return `${symbol}${formatIndianNumber(amount, decimals)}`;
}

export function formatIndianNumber(value: number, decimals = 2): string {
  const negative = value < 0;
  const fixed = Math.abs(value).toFixed(decimals);
  const [whole, fraction] = fixed.split('.');
  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${lastThree}` : lastThree;
  const result = decimals > 0 ? `${grouped}.${fraction}` : grouped;
  return negative ? `-${result}` : result;
}

export function formatNumber(value: unknown, decimals = 0): string {
  return formatIndianNumber(toNumber(value), decimals);
}

export function formatCompact(value: unknown): string {
  const amount = toNumber(value);
  if (Math.abs(amount) >= 10000000) return `${(amount / 10000000).toFixed(2)} Cr`;
  if (Math.abs(amount) >= 100000) return `${(amount / 100000).toFixed(2)} L`;
  if (Math.abs(amount) >= 1000) return `${(amount / 1000).toFixed(1)} K`;
  return String(Math.round(amount));
}

export function formatPercent(value: unknown, decimals = 1): string {
  return `${toNumber(value).toFixed(decimals)}%`;
}

export function formatBytes(bytes: unknown): string {
  const size = toNumber(bytes);
  if (size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  return `${(size / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${TENS[tens]}${ones ? ` ${ONES[ones]}` : ''}`;
}

/** Converts a number to Indian-system words — used on payslips and settlements. */
export function numberToWords(value: unknown, options: { currency?: boolean; paiseSuffix?: boolean } = {}): string {
  const { currency = true } = options;
  const amount = Math.abs(toNumber(value));
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  const parts: string[] = [];
  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const hundred = Math.floor((rupees % 1000) / 100);
  const rest = rupees % 100;

  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundred) parts.push(`${ONES[hundred]} Hundred`);
  if (rest) parts.push(twoDigits(rest));

  let words = parts.join(' ').trim() || 'Zero';
  if (currency) {
    words = `${words} Rupees`;
    if (paise > 0) words += ` and ${twoDigits(paise)} Paise`;
    words += ' Only';
  } else if (paise > 0) {
    words += ` Point ${paise}`;
  }
  return words;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .toLowerCase()
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function truncate(value: string | null | undefined, length = 60): string {
  if (!value) return '';
  return value.length <= length ? value : `${value.slice(0, length - 1)}…`;
}

/** Aadhaar: show only the last 4 digits. */
export function maskAadhaar(value: string | null | undefined): string {
  if (!value) return '—';
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return 'XXXX XXXX XXXX';
  return `XXXX XXXX ${digits.slice(-4)}`;
}

export function maskAccountNumber(value: string | null | undefined): string {
  if (!value) return '—';
  if (value.length <= 4) return value;
  return `${'X'.repeat(Math.max(value.length - 4, 0))}${value.slice(-4)}`;
}

export function maskPan(value: string | null | undefined): string {
  if (!value) return '—';
  return `${value.slice(0, 2)}XXXXX${value.slice(-2)}`;
}

export function genderize(value: string | null | undefined): 'his' | 'her' | 'their' {
  if (value === 'Male') return 'his';
  if (value === 'Female') return 'her';
  return 'their';
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Escapes text for safe interpolation into HTML (emails, PDF HTML, CMS output).
 * Every value that originates from a user must pass through this.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Strips tags from stored rich text where only plain text can be rendered. */
export function stripHtml(value: unknown, maxLength = 0): string {
  if (value === null || value === undefined) return '';
  const text = String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return maxLength > 0 ? text.slice(0, maxLength) : text;
}

/**
 * Minimal sanitiser for CMS rich text: keeps the formatting the editor can
 * produce, drops scripts, event handlers and javascript: URLs.
 */
export function sanitizeRichText(html: unknown): string {
  if (!html) return '';
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}
