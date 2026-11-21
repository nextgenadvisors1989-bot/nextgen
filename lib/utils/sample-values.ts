/**
 * The first database was seeded with obviously fake company details (an .example e-mail, a made-up GSTIN, "ComplianceOS
 * Technologies Private Limited"). If the client never replaced them, nothing public or printed may show them: they are
 * treated as "not filled in" and the setup checklist (Admin -> Setup) asks for the real ones.
 */
const SAMPLE_EXACT = new Set([
  '33aabcc1234d1z5', // GSTIN
  'aabcc1234d', // PAN
  'u72900tn2019ptc123456', // CIN
  'complianceos technologies private limited',
  '4th floor, anna salai, chennai 600002, tamil nadu, india',
  '+91 44 4000 0000',
]);

export function isSampleValue(value: unknown): boolean {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return false;
  return SAMPLE_EXACT.has(v) || /@[a-z0-9.-]*\.example\b/.test(v) || /@complianceos\.(local|example)/.test(v) || /\.example(\/|$)/.test(v);
}

/** A GSTIN has 15 characters: 2 state digits, the 10-character PAN, an entity number, "Z", a check character. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
