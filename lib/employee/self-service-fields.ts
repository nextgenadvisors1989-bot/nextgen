/**
 * What an employee may change about their own record, and nothing else.
 *
 * The employee panel is one person's file, not a second employee register. The
 * establishment owns the employment facts — the employee number, the
 * establishment itself, the designation, the unit and department, the wages, the
 * joining date — so none of those appear here, and a write to one of them is
 * refused by name rather than dropped silently.
 *
 * The map runs form field -> column, because the two differ for the handful of
 * fields whose UI name is friendlier than the column behind it.
 */

/** Fields the employee owns: contact, address, family, identity and bank details. */
export const SELF_EDITABLE_FIELDS: Record<string, string> = {
  // ── contact ─────────────────────────────────────────────────────────────
  mobile: 'mobile',
  telephone: 'telephone',
  email: 'email',
  alternate_mobile: 'alternate_mobile',

  // ── addresses ───────────────────────────────────────────────────────────
  present_address: 'present_address',
  permanent_address: 'permanent_address',
  is_permanent_same_as_present: 'is_permanent_same_as_present',
  native_place: 'native_place',
  staying_in: 'staying_in',
  state: 'state',
  pincode: 'pincode',

  // ── family and personal particulars ─────────────────────────────────────
  father_name: 'father_name',
  mother_name: 'mother_name',
  spouse_name: 'spouse_name',
  sex: 'sex',
  marital_status: 'marital_status',
  blood_group: 'blood_group',
  date_of_birth: 'date_of_birth',
  religion: 'religion',
  mother_tongue: 'mother_tongue',
  languages_known: 'languages_known',
  family_income_per_annum: 'family_income_per_annum',
  aadhaar_number: 'aadhaar_number',
  pan_number: 'pan_number',

  // ── bank details ────────────────────────────────────────────────────────
  bank_name: 'bank_name',
  bank_account_number: 'bank_account_number',
  ifsc_code: 'ifsc_code',

  // ── passport, for overseas postings ─────────────────────────────────────
  passport_number: 'passport_number',
  passport_validity: 'passport_validity',
};

/**
 * The same set, by column, for code that walks the other way — the profile screen
 * reads stored columns and needs to know which of them the employee may edit.
 */
export const SELF_EDITABLE_COLUMNS: readonly string[] = Array.from(
  new Set(Object.values(SELF_EDITABLE_FIELDS))
);

/** Child registers the employee may maintain against their own record. */
export const SELF_SERVICE_COLLECTIONS = ['qualifications', 'experience', 'nominees', 'dependents'] as const;
export type SelfServiceCollection = (typeof SELF_SERVICE_COLLECTIONS)[number];
