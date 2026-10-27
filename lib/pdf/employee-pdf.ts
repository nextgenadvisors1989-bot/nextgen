/**
 * Employee Personal File PDF.
 *
 * The statutory personnel record handed to an inspector, an auditor or the
 * employee themselves: personal and contact data, employment terms, the wage
 * structure, statutory registrations (Aadhaar and bank numbers masked), family
 * and nominee particulars, the 16-item personal-file checklist, the document
 * register and the interview evaluation.
 *
 * Length is bounded by design: every child table prints at most 15 rows per
 * section and points at the digital record for the rest, which keeps a complete
 * file comfortably inside the 12-page limit the format specifies.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { getEmployeeDetail, type EmployeeDetail } from '@/services/employee.service';
import { maskAadhaar, maskAccountNumber, formatCurrency, formatNumber } from '@/lib/utils/formatting';
import { formatDate } from '@/lib/utils/dates';
import {
  COLORS, MARGIN, CONTENT_WIDTH, createPdf, letterhead, sectionHeading, keyValues, table,
  checklistGrid, signatureBlock, stampFooters, setFont, paragraph, bullets, spacer, ensureSpace,
  renderPdf, type Doc,
} from '@/lib/pdf/base';

const MAX_ROWS = 15;

export interface EmployeePdfContext {
  generatedByName: string;
  generatedByRole: string;
  generatedAt?: Date;
}

interface CompanyInfo {
  name: string;
  addressLines: string[];
  registrationLine: string;
}

function text(value: unknown, fallback = '—'): string {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function money(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return formatCurrency(Number(value));
}

function date(value: unknown): string {
  if (!value) return '—';
  return formatDate(value as string);
}

function yesNo(value: unknown): string {
  return Number(value) === 1 || value === true ? 'Yes' : 'No';
}

async function loadCompany(employerId: number, employerName: string): Promise<CompanyInfo> {
  const [employer, settings] = await Promise.all([
    queryOne<RowDataPacket>(
      `SELECT company_name, address_line_1, address_line_2, city, state, pincode, country,
              gst_number, pan_number, cin_number, email, phone
         FROM employers WHERE id = ? LIMIT 1`,
      [employerId]
    ).catch(() => null),
    query<{ setting_key: string; setting_value: string } & RowDataPacket>(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('company_name','company_address','company_email','company_phone')"
    ).catch(() => [] as ({ setting_key: string; setting_value: string } & RowDataPacket)[]),
  ]);

  const setting = (key: string) =>
    settings.find((row) => row.setting_key === key)?.setting_value ?? '';

  const addressLines = employer
    ? [
        [employer.address_line_1, employer.address_line_2].filter(Boolean).join(', '),
        [employer.city, employer.state, employer.pincode].filter(Boolean).join(', '),
        [employer.country, employer.phone, employer.email].filter(Boolean).join('  |  '),
      ].filter((line) => line && line.trim().length)
    : [setting('company_address'), setting('company_email')].filter(Boolean);

  const registration = [
    employer?.gst_number ? `GSTIN: ${employer.gst_number}` : '',
    employer?.pan_number ? `PAN: ${employer.pan_number}` : '',
    employer?.cin_number ? `CIN: ${employer.cin_number}` : '',
  ].filter(Boolean).join('   ');

  return {
    name: text(employer?.company_name || setting('company_name') || employerName, 'ComplianceOS'),
    addressLines: addressLines as string[],
    registrationLine: registration,
  };
}

/** Wage heads are laid out bilingually: the register is maintained in Tamil too. */
async function loadWageHeads(): Promise<Record<string, { name: string; nameTa: string | null }>> {
  const rows = await query<RowDataPacket>(
    "SELECT head_code, head_name, head_name_ta FROM payroll_heads WHERE head_type = 'Earning' AND status = 'active'"
  );
  const map: Record<string, { name: string; nameTa: string | null }> = {};
  for (const row of rows) {
    map[String(row.head_code).toLowerCase()] = { name: String(row.head_name), nameTa: row.head_name_ta ?? null };
  }
  return map;
}

/** Embeds the passport photograph when one has been uploaded as a data URL. */
function drawPhoto(doc: Doc, photo: unknown, x: number, y: number): boolean {
  if (typeof photo !== 'string' || !photo.startsWith('data:image/')) return false;
  try {
    doc.image(photo, x, y, { fit: [70, 88], align: 'center', valign: 'center' });
    doc.save().strokeColor(COLORS.line).lineWidth(0.6).rect(x, y, 70, 88).stroke().restore();
    return true;
  } catch {
    return false;
  }
}

function summaryBlock(doc: Doc, detail: EmployeeDetail, photo: unknown): void {
  const employee = detail.employee as unknown as Record<string, unknown>;
  const top = doc.y;
  const hasPhoto = drawPhoto(doc, photo, MARGIN + CONTENT_WIDTH - 70, top);
  const width = hasPhoto ? CONTENT_WIDTH - 82 : CONTENT_WIDTH;

  setFont(doc, 14, { bold: true });
  doc.fillColor(COLORS.ink).text(text(employee.name), MARGIN, top, { width });
  setFont(doc, 10);
  doc.fillColor(COLORS.body).text(
    `${text(employee.designation)} · ${text(employee.department_name ?? employee.department)}`,
    MARGIN, doc.y + 2, { width }
  );
  setFont(doc, 9);
  doc.fillColor(COLORS.muted).text(
    `Employee No. ${text(employee.employee_number)}   |   ${text(employee.employer_name)}${employee.unit_name ? ` · ${text(employee.unit_name)}` : ''}`,
    MARGIN, doc.y + 2, { width }
  );

  const factsY = Math.max(doc.y + 8, top + (hasPhoto ? 92 : 0));
  doc.y = factsY;
  keyValues(doc, [
    { label: 'Date of joining', value: date(employee.date_of_joining) },
    { label: 'Employment status', value: text(employee.status).toUpperCase() },
    { label: 'Category / grade', value: `${text(employee.category)}${employee.grade ? ` · ${text(employee.grade)}` : ''}` },
    { label: 'Wage type', value: text(employee.wage_type) },
    { label: 'Gross salary (monthly)', value: money(employee.gross_salary) },
    { label: 'Date of birth', value: date(employee.date_of_birth) },
  ]);
}

export async function generateEmployeePdf(employeeId: number, context: EmployeePdfContext): Promise<Buffer | null> {
  const detail = await getEmployeeDetail(employeeId);
  if (!detail) return null;

  const employee = detail.employee as unknown as Record<string, unknown>;
  const employerId = Number(employee.employer_id);
  const [company, wageHeads] = await Promise.all([
    loadCompany(employerId, text(employee.employer_name)),
    loadWageHeads(),
  ]);

  const now = context.generatedAt ?? new Date();
  const reportNumber = `PF/${text(employee.employee_number)}/${now.getFullYear()}`;
  const doc = createPdf({
    title: `Employee Personal File — ${text(employee.name)}`,
    subject: 'Statutory personnel record',
    keywords: `employee,personal file,${text(employee.employee_number)}`,
  });

  letterhead(doc, {
    companyName: company.name,
    addressLines: company.addressLines,
    registrationLine: company.registrationLine,
    documentTitle: 'Employee Personal File',
    titleTa: 'பணியாளர் தனிப்பட்ட கோப்பு',
    subtitle: 'Statutory personnel record generated from the HR and payroll register.',
    metaRows: [
      { label: 'Employee no.', value: text(employee.employee_number) },
      { label: 'Report no.', value: reportNumber },
      { label: 'Generated on', value: formatDate(now) },
    ],
  });

  summaryBlock(doc, detail, employee.photo);

  /* ---------------------------------------------------------- personal */
  sectionHeading(doc, 'Personal details');
  keyValues(doc, [
    { label: 'Full name', value: text(employee.name) },
    { label: "Father's name", value: text(employee.father_name) },
    { label: "Mother's name", value: text(employee.mother_name) },
    { label: "Spouse's name", value: text(employee.spouse_name) },
    { label: 'Sex', value: text(employee.sex) },
    { label: 'Marital status', value: text(employee.marital_status) },
    { label: 'Date of birth', value: date(employee.date_of_birth) },
    { label: 'Blood group', value: text(employee.blood_group) },
    { label: 'Religion', value: text(employee.religion) },
    { label: 'Mother tongue', value: text(employee.mother_tongue) },
    { label: 'Languages known', value: text(employee.languages_known) },
    { label: 'Native place', value: text(employee.native_place) },
  ]);

  sectionHeading(doc, 'Contact & address');
  keyValues(doc, [
    { label: 'Mobile', value: text(employee.mobile) },
    { label: 'Telephone', value: text(employee.telephone) },
    { label: 'Email', value: text(employee.email) },
    { label: 'Staying in', value: text(employee.staying_in) },
    { label: 'Present address', value: text(employee.present_address), labelTa: 'தற்போதைய முகவரி' },
    { label: 'Permanent address', value: text(employee.permanent_address), labelTa: 'நிரந்தர முகவரி' },
    { label: 'State / PIN', value: `${text(employee.state)} · ${text(employee.pincode)}` },
    { label: 'Family income p.a.', value: money(employee.family_income_per_annum) },
  ]);

  /* -------------------------------------------------------- employment */
  sectionHeading(doc, 'Employment particulars');
  keyValues(doc, [
    { label: 'Employer', value: text(employee.employer_name) },
    { label: 'Unit', value: text(employee.unit_name) },
    { label: 'Department', value: text(employee.department_name ?? employee.department) },
    { label: 'Designation', value: text(employee.designation) },
    { label: 'Post applied for', value: text(employee.post_applied_for) },
    { label: 'Nature of work', value: text(employee.nature_of_work) },
    { label: 'Skill / grade', value: `${text(employee.skill_grade)} · ${text(employee.grade)}` },
    { label: 'Place of work', value: text(employee.place_of_work) },
    { label: 'Date of joining', value: date(employee.date_of_joining) },
    { label: 'Date of confirmation', value: date(employee.date_of_confirmation) },
    { label: 'Probation (months)', value: text(employee.probation_months) },
    { label: 'Shift / relay', value: text(employee.shift_relay) },
    { label: 'Working hours', value: `${text(employee.working_hours_from)} – ${text(employee.working_hours_to)}` },
    { label: 'Interval / lunch', value: text(employee.interval_lunch_time) },
    { label: 'Tea break', value: text(employee.tea_break) },
    { label: 'Weekly off', value: text(employee.weekly_off) },
    { label: 'Resignation date', value: date(employee.date_of_resignation) },
    { label: 'Relieving date', value: date(employee.date_of_relieving) },
    { label: 'Re-employment eligible', value: yesNo(employee.is_re_employment_eligible) },
    { label: 'Resignation reason', value: text(employee.resignation_reason) },
  ]);

  /* ------------------------------------------------------------ salary */
  const structure = detail.salaryStructure as unknown as Record<string, unknown> | null;
  const wageFields = ['basic_salary', 'da', 'hra', 'ta', 'pa', 'ea', 'npba', 'other_allowances'];
  const headKeys = ['basic', 'da', 'hra', 'ta', 'pa', 'ea', 'npba', 'other_allowances'];
  const source = structure ?? employee;

  sectionHeading(doc, 'Wage structure', {
    titleTa: 'ஊதிய அமைப்பு',
    note: structure
      ? `Structure "${text(structure.structure_name)}" effective ${date(structure.effective_from)} · revision ${text(structure.revision_number)}`
      : 'Current monthly wage heads as recorded on the employee master.',
  });
  table(doc, {
    columns: [
      { key: 'head', label: 'Wage head', width: 0.34 },
      { key: 'headTa', label: 'தலைப்பு', width: 0.26 },
      { key: 'code', label: 'Code', width: 0.14 },
      { key: 'amount', label: 'Amount (₹)', width: 0.26, align: 'right' },
    ],
    rows: wageFields.map((field, index) => {
      const head = wageHeads[headKeys[index]] ?? wageHeads[headKeys[index].toUpperCase()];
      return {
        head: head?.name ?? headKeys[index].toUpperCase(),
        headTa: head?.nameTa ?? '—',
        code: headKeys[index].toUpperCase(),
        amount: money(source[field]),
      };
    }),
  });
  keyValues(doc, [
    { label: 'Gross salary', value: money(source.gross_salary ?? employee.gross_salary) },
    { label: 'Wage type', value: text(source.wage_type ?? employee.wage_type) },
    { label: 'PF applicable', value: structure ? yesNo(structure.is_pf_applicable) : '—' },
    { label: 'ESI applicable', value: structure ? yesNo(structure.is_esi_applicable) : '—' },
  ]);

  /* --------------------------------------------------------- statutory */
  sectionHeading(doc, 'Statutory registrations');
  keyValues(doc, [
    { label: 'Aadhaar number', value: maskAadhaar(text(employee.aadhaar_number, '')), labelTa: 'ஆதார் எண்' },
    { label: 'PAN', value: text(employee.pan_number) },
    { label: 'PF number', value: text(employee.pf_number) },
    { label: 'PF effective date', value: date(employee.pf_effective_date) },
    { label: 'UAN', value: text(employee.uan) },
    { label: 'ESI number', value: text(employee.esi_number) },
    { label: 'ESI dispensary', value: text(employee.esi_dispensary) },
    { label: 'Mediclaim number', value: text(employee.mediclaim_number) },
    { label: 'Previous PF account', value: text(employee.previous_pf_account_number) },
    { label: 'Previous exit date', value: date(employee.previous_employer_exit_date) },
    { label: 'Scheme certificate', value: text(employee.scheme_certificate_number) },
    { label: 'Pension payment order', value: text(employee.pension_payment_order_number) },
    { label: 'International worker', value: yesNo(employee.is_international_worker) },
    { label: 'Passport / validity', value: `${text(employee.passport_number)} · ${date(employee.passport_validity)}` },
  ]);

  sectionHeading(doc, 'Bank account');
  keyValues(doc, [
    { label: 'Bank name', value: text(employee.bank_name) },
    { label: 'Account number', value: maskAccountNumber(text(employee.bank_account_number, '')) },
    { label: 'IFSC', value: text(employee.ifsc_code) },
    { label: 'Expected salary', value: money(employee.expected_salary) },
  ]);

  /* ------------------------------------------------------------ family */
  sectionHeading(doc, 'Nominees', { titleTa: 'பெயரளவில் உள்ளவர்கள்' });
  table(doc, {
    columns: [
      { key: 'form_type', label: 'Form', width: 0.16 },
      { key: 'nominee_name', label: 'Nominee', width: 0.28 },
      { key: 'relationship', label: 'Relationship', width: 0.16 },
      { key: 'date_of_birth', label: 'Date of birth', width: 0.16 },
      { key: 'share', label: 'Share %', width: 0.12, align: 'right' },
      { key: 'guardian', label: 'Guardian', width: 0.12 },
    ],
    rows: (detail.nominees as unknown as Record<string, unknown>[]).map((row) => ({
      ...row, date_of_birth: date(row.date_of_birth),
      share: row.share_percentage ?? '—', guardian: text(row.guardian_name),
    })),
    empty: 'No nominee has been recorded for this employee.',
    maxRows: MAX_ROWS,
  });

  sectionHeading(doc, 'Dependents');
  table(doc, {
    columns: [
      { key: 'dependent_name', label: 'Name', width: 0.28 },
      { key: 'relationship', label: 'Relationship', width: 0.18 },
      { key: 'date_of_birth', label: 'Date of birth', width: 0.16 },
      { key: 'sex', label: 'Sex', width: 0.12 },
      { key: 'occupation', label: 'Occupation', width: 0.16 },
      { key: 'nominee', label: 'Nominee', width: 0.10, align: 'center' },
    ],
    rows: (detail.dependents as unknown as Record<string, unknown>[]).map((row) => ({
      ...row, date_of_birth: date(row.date_of_birth), nominee: row.is_nominee ? 'Yes' : 'No',
    })),
    empty: 'No dependents recorded.',
    maxRows: MAX_ROWS,
  });

  /* ------------------------------------------------------- qualifications */
  sectionHeading(doc, 'Educational qualifications');
  table(doc, {
    columns: [
      { key: 'qualification', label: 'Qualification', width: 0.24 },
      { key: 'specialization', label: 'Specialisation', width: 0.22 },
      { key: 'institution', label: 'Institution', width: 0.28 },
      { key: 'board_university', label: 'Board / University', width: 0.16 },
      { key: 'year_of_passing', label: 'Year', width: 0.10, align: 'center' },
    ],
    rows: detail.qualifications as unknown as Record<string, unknown>[],
    empty: 'No qualifications recorded.',
    maxRows: MAX_ROWS,
  });

  sectionHeading(doc, 'Previous experience');
  table(doc, {
    columns: [
      { key: 'company_name', label: 'Employer', width: 0.28 },
      { key: 'designation', label: 'Designation', width: 0.20 },
      { key: 'date_from', label: 'From', width: 0.14 },
      { key: 'date_to', label: 'To', width: 0.14 },
      { key: 'total_period', label: 'Period', width: 0.14 },
      { key: 'last_salary', label: 'Last salary', width: 0.10, align: 'right' },
    ],
    rows: (detail.experience as unknown as Record<string, unknown>[]).map((row) => ({
      ...row, date_from: date(row.date_from), date_to: date(row.date_to), last_salary: money(row.last_salary),
    })),
    empty: 'No previous experience recorded.',
    maxRows: MAX_ROWS,
  });

  sectionHeading(doc, 'References');
  table(doc, {
    columns: [
      { key: 'reference_name', label: 'Name', width: 0.24 },
      { key: 'designation', label: 'Designation', width: 0.20 },
      { key: 'organization', label: 'Organisation', width: 0.26 },
      { key: 'mobile', label: 'Mobile', width: 0.16 },
      { key: 'relationship', label: 'Relationship', width: 0.14 },
    ],
    rows: detail.references as unknown as Record<string, unknown>[],
    empty: 'No references recorded.',
    maxRows: MAX_ROWS,
  });

  /* ------------------------------------------------------ service records */
  sectionHeading(doc, 'Service record', { titleTa: 'பணி வரலாறு' });
  table(doc, {
    columns: [
      { key: 'employer_name', label: 'Employer', width: 0.26 },
      { key: 'designation', label: 'Designation', width: 0.18 },
      { key: 'department', label: 'Department', width: 0.16 },
      { key: 'date_from', label: 'From', width: 0.14 },
      { key: 'date_to', label: 'To', width: 0.14 },
      { key: 'total_period', label: 'Period', width: 0.12 },
    ],
    rows: (detail.serviceRecords as unknown as Record<string, unknown>[]).map((row) => ({
      ...row, date_from: date(row.date_from), date_to: date(row.date_to),
    })),
    empty: 'No prior service record on file.',
    maxRows: MAX_ROWS,
  });

  /* ------------------------------------------------------------ interview */
  const interview = detail.interview as unknown as Record<string, unknown> | null;
  sectionHeading(doc, 'Interview evaluation');
  if (interview) {
    keyValues(doc, [
      { label: 'Interview date', value: date(interview.interview_date) },
      { label: 'Interviewer', value: text(interview.interviewer_name) },
      { label: 'Position applied', value: text(interview.position_applied) },
      { label: 'Recommendation', value: text(interview.recommendation) },
      { label: 'Qualification', value: `${text(interview.qualification_rating)}/5` },
      { label: 'Experience', value: `${text(interview.experience_rating)}/5` },
      { label: 'Communication', value: `${text(interview.communication_rating)}/5` },
      { label: 'Technical', value: `${text(interview.technical_rating)}/5` },
      { label: 'Attitude', value: `${text(interview.attitude_rating)}/5` },
      { label: 'Overall', value: `${text(interview.overall_rating)}/5` },
    ]);
    if (interview.remarks) paragraph(doc, `Interviewer remarks: ${text(interview.remarks)}`);
  } else {
    paragraph(doc, 'No interview evaluation is on file for this employee.');
  }

  /* ------------------------------------------------------------ checklist */
  const checklist = detail.checklist as unknown as Record<string, unknown>[];
  const completed = checklist.filter((row) => Number(row.is_checked) === 1).length;
  const percent = checklist.length ? Math.round((completed / checklist.length) * 100) : 0;

  sectionHeading(doc, 'Personal file checklist', {
    titleTa: 'தனிப்பட்ட கோப்பு சரிபார்ப்பு பட்டியல்',
    note: `${completed} of ${checklist.length} items complete (${percent}%). Mandatory items are marked with their code.`,
  });
  checklistGrid(
    doc,
    checklist.map((row) => ({
      label: `${text(row.item_label)} (${text(row.item_code)})${Number(row.is_mandatory) === 1 ? ' *' : ''}`,
      done: Number(row.is_checked) === 1,
      remark: row.remarks ? text(row.remarks) : null,
    }))
  );

  /* ------------------------------------------------------------ documents */
  sectionHeading(doc, 'Document register', { note: 'Documents held in the encrypted vault; originals remain with the employer.' });
  table(doc, {
    columns: [
      { key: 'document_name', label: 'Document', width: 0.3 },
      { key: 'document_type', label: 'Type', width: 0.18 },
      { key: 'document_number', label: 'Number', width: 0.18 },
      { key: 'issue_date', label: 'Issued', width: 0.13 },
      { key: 'expiry_date', label: 'Expires', width: 0.13 },
      { key: 'verified', label: 'Verified', width: 0.08, align: 'center' },
    ],
    rows: (detail.documents as unknown as Record<string, unknown>[]).map((row) => ({
      ...row, issue_date: date(row.issue_date), expiry_date: date(row.expiry_date),
      verified: row.is_verified ? 'Yes' : 'No',
    })),
    empty: 'No documents uploaded to the vault yet.',
    maxRows: MAX_ROWS,
  });

  /* ----------------------------------------------------------- declaration */
  sectionHeading(doc, 'Declaration');
  bullets(doc, [
    'The particulars above are maintained under the employer\u2019s statutory registers and are certified as correct to the best of the employer\u2019s knowledge.',
    'Aadhaar and bank account numbers are masked in this extract; the full values remain accessible to authorised administrators only.',
    `This extract was generated electronically on ${formatDate(now)} by ${context.generatedByName} (${context.generatedByRole}).`,
    `Report number ${reportNumber}. Any manual alteration of this document is void.`,
  ]);
  signatureBlock(doc, ['Prepared by (HR)', 'Verified by (Compliance Officer)', 'Employee acknowledgement'], {
    note: `Total file completeness: ${percent}% · ${formatNumber(completed)}/${formatNumber(checklist.length)} checklist items verified.`,
  });

  // One closing line keeps even a sparse record visually complete.
  spacer(doc, 4);
  ensureSpace(doc, 20);
  setFont(doc, 7.5);
  doc.fillColor(COLORS.muted).text(
    `Computer generated document · ${company.name} · ${reportNumber}`,
    MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' }
  );

  stampFooters(doc, ({ index, total }) => ({
    left: company.name,
    center: `${reportNumber} · ${text(employee.employee_number)}`,
    right: `Page ${index} of ${total}`,
  }));

  return renderPdf(doc);
}
