/**
 * Payslip PDF — the wage statement given to the employee.
 *
 * Bilingual by requirement: every wage head prints its English and Tamil name
 * side by side, and the document's own headings are in both scripts. Tamil is
 * drawn with the embedded Noto Sans Tamil face (the Latin face has no Tamil
 * glyphs), which is why the wage table is laid out by hand here rather than
 * through the generic table helper — the helper draws one font per cell.
 *
 * The layout follows the statutory payslip of the Tamil Nadu Shops and
 * Establishments / Factories rules: employer identity, employee identity, the
 * wage period, the attendance the wage was computed on, earnings and deductions
 * head by head, the employer's own contributions shown but not deducted, net pay
 * in figures and words, and the signatures.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import {
  COLORS, MARGIN, CONTENT_WIDTH, createPdf, letterhead, sectionHeading, keyValues, table,
  signatureBlock, stampFooters, setFont, paragraph, bullets, spacer, ensureSpace, renderPdf, line,
} from '@/lib/pdf/base';
import { maskAccountNumber, formatCurrency, numberToWords } from '@/lib/utils/formatting';
import { formatDate } from '@/lib/utils/dates';
import { monthLabel } from '@/lib/validations/payroll.validation';
import { generateServiceCardPayslip } from '@/lib/pdf/payslip-service-card';

export type PayslipFormat = 'service-card' | 'standard';

export interface PayslipPdfContext {
  generatedByName: string;
  generatedByRole: string;
  generatedAt?: Date;
  /** `service-card` (default) is the statutory Form 25 B / 15 / 12 / VI card; `standard` is the detailed multi-section statement. */
  format?: PayslipFormat;
}

export function payslipFormat(value: string | null | undefined): PayslipFormat {
  return value === 'standard' ? 'standard' : 'service-card';
}

interface EmployerInfo {
  name: string;
  addressLines: string[];
  registrationLine: string;
}

interface SlipRow {
  id: number;
  payslip_number: string;
  month: number;
  year: number;
  period_from: string | null;
  period_to: string | null;
  working_days: number;
  paid_days: number;
  lop_days: number;
  present_days: number;
  absent_days: number;
  leave_days: number;
  holiday_days: number;
  weekly_off_days: number;
  overtime_hours: number;
  basic: number;
  da: number;
  hra: number;
  ta: number;
  pa: number;
  ea: number;
  npba: number;
  other_allowances: number;
  overtime_amount: number;
  gross_earnings: number;
  pf_employee: number;
  pf_employer: number;
  vpf_amount: number;
  esi_employee: number;
  esi_employer: number;
  professional_tax: number;
  lwf_amount: number;
  tds_amount: number;
  advance_deduction: number;
  canteen_deduction: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  bank_name: string | null;
  bank_account_number: string | null;
  ifsc_code: string | null;
  payment_mode: string | null;
  payment_status: string | null;
  payment_reference: string | null;
  paid_at: string | null;
  remarks: string | null;
  employee_name: string;
  employee_number: string;
  designation: string | null;
  employee_department: string | null;
  unit_name: string | null;
  company_name: string;
  run_number: string;
}

interface SlipItem {
  head_code: string;
  head_name: string;
  head_name_ta: string | null;
  head_type: string;
  amount: number;
}

const number = (value: unknown) => Number(value ?? 0);
const text = (value: unknown, fallback = '—') => (value === null || value === undefined || value === '' ? fallback : String(value));

async function loadEmployer(employerId: number, fallbackName: string): Promise<EmployerInfo> {
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
  const setting = (key: string) => settings.find((row) => row.setting_key === key)?.setting_value ?? '';

  const addressLines = employer
    ? [
        [employer.address_line_1, employer.address_line_2].filter(Boolean).join(', '),
        [employer.city, employer.state, employer.pincode].filter(Boolean).join(', '),
        [employer.country, employer.phone, employer.email].filter(Boolean).join('  |  '),
      ].filter((entry) => entry && String(entry).trim().length).map(String)
    : [setting('company_address'), setting('company_email')].filter(Boolean);

  const registration = [
    employer?.gst_number ? `GSTIN: ${String(employer.gst_number)}` : '',
    employer?.pan_number ? `PAN: ${String(employer.pan_number)}` : '',
    employer?.cin_number ? `CIN: ${String(employer.cin_number)}` : '',
  ].filter(Boolean).join('   ');

  return {
    name: text(employer?.company_name || setting('company_name') || fallbackName, 'Employer'),
    addressLines: addressLines as string[],
    registrationLine: registration,
  };
}

/**
 * One bilingual wage panel (earnings or deductions).
 *
 * Both panels advance on a shared cursor so a page break lands across the pair
 * rather than inside one of them: the caller draws row `n` of earnings and row
 * `n` of deductions at the same `y`, then hands the cursor back.
 */
function drawWagePanel(
  doc: PDFKit.PDFDocument,
  rows: SlipItem[],
  options: {
    x: number;
    width: number;
    y: number;
    title: string;
    titleTa: string;
    totalLabel: string;
    totalLabelTa: string;
    total: number;
    headerFill?: string;
  }
): number {
  // Panel header.
  doc.save().rect(options.x, options.y, options.width, 20).fill(options.headerFill ?? '#f1f5f9').restore();
  setFont(doc, 9, { bold: true });
  doc.fillColor(COLORS.brand).text(options.title.toUpperCase(), options.x + 6, options.y + 6, {
    width: options.width - 12, lineBreak: false,
  });
  setFont(doc, 7.5, { tamil: true });
  doc.fillColor(COLORS.muted).text(options.titleTa, options.x + 6, options.y + 6, {
    width: options.width - 12, align: 'right', lineBreak: false,
  });
  let y = options.y + 20;

  // Column captions: particulars (English / Tamil) and the amount.
  setFont(doc, 7.5, { bold: true });
  doc.fillColor(COLORS.muted).text('PARTICULARS', options.x + 6, y + 4, { width: options.width * 0.62, lineBreak: false });
  doc.fillColor(COLORS.muted).text('AMOUNT (₹)', options.x + options.width * 0.6, y + 4, {
    width: options.width * 0.4 - 6, align: 'right', lineBreak: false,
  });
  y += 14;

  if (!rows.length) {
    setFont(doc, 8.5);
    doc.fillColor(COLORS.muted).text('Nil', options.x + 6, y + 2, { width: options.width - 12 });
    return y + 16;
  }

  for (const row of rows) {
    const rowHeight = row.head_name_ta ? 24 : 16;
    setFont(doc, 8.5);
    doc.fillColor(COLORS.body).text(row.head_name, options.x + 6, y + 3, {
      width: options.width * 0.6 - 10, lineBreak: false,
    });
    if (row.head_name_ta) {
      setFont(doc, 7.5, { tamil: true });
      doc.fillColor(COLORS.muted).text(row.head_name_ta, options.x + 6, y + 13, {
        width: options.width * 0.6 - 10, lineBreak: false,
      });
    }
    setFont(doc, 8.5);
    doc.fillColor(COLORS.body).text(formatCurrency(row.amount), options.x + options.width * 0.48, y + 5, {
      width: options.width * 0.52 - 6, align: 'right', lineBreak: false,
    });
    doc.save().strokeColor('#f1f5f9').lineWidth(0.5)
      .moveTo(options.x, y + rowHeight).lineTo(options.x + options.width, y + rowHeight).stroke().restore();
    y += rowHeight;
  }

  // Total strip.
  doc.save().rect(options.x, y, options.width, 20).fill('#f8fafc').restore();
  setFont(doc, 9, { bold: true });
  doc.fillColor(COLORS.brand).text(options.totalLabel, options.x + 6, y + 6, { width: options.width * 0.6, lineBreak: false });
  setFont(doc, 7, { tamil: true });
  doc.fillColor(COLORS.muted).text(options.totalLabelTa, options.x + 6, y + 6, {
    width: options.width * 0.6, align: 'left', lineBreak: false, characterSpacing: 0,
  });
  setFont(doc, 9.5, { bold: true });
  doc.fillColor(COLORS.brand).text(formatCurrency(options.total), options.x + options.width * 0.48, y + 5, {
    width: options.width * 0.52 - 6, align: 'right', lineBreak: false,
  });
  return y + 22;
}

export async function generatePayslipPdf(payslipId: number, context: PayslipPdfContext): Promise<Buffer | null> {
  if (context.format !== 'standard') return generateServiceCardPayslip(payslipId, context);
  const slip = await queryOne<SlipRow & RowDataPacket>(
    `SELECT ps.id, ps.payslip_number, ps.month, ps.year, ps.period_from, ps.period_to, ps.working_days,
            ps.paid_days, ps.lop_days, ps.present_days, ps.absent_days, ps.leave_days, ps.holiday_days,
            ps.weekly_off_days, ps.overtime_hours, ps.basic, ps.da, ps.hra, ps.ta, ps.pa, ps.ea, ps.npba,
            ps.other_allowances, ps.overtime_amount, ps.gross_earnings, ps.pf_employee, ps.pf_employer,
            ps.vpf_amount, ps.esi_employee, ps.esi_employer, ps.professional_tax, ps.lwf_amount, ps.tds_amount,
            ps.advance_deduction, ps.canteen_deduction, ps.other_deductions, ps.total_deductions, ps.net_pay,
            ps.bank_name, ps.bank_account_number, ps.ifsc_code, ps.payment_mode, ps.payment_status,
            ps.payment_reference, ps.paid_at, ps.remarks,
            emp.name AS employee_name, emp.employee_number, emp.designation, emp.department AS employee_department,
            emp.date_of_joining, emp.pf_number, emp.esi_number, emp.pan_number, emp.uan AS uan_number,
            cu.unit_name, e.company_name, pr.run_number
       FROM payslips ps
       JOIN employees emp ON emp.id = ps.employee_id
       JOIN employers e ON e.id = ps.employer_id
       JOIN payroll_runs pr ON pr.id = ps.payroll_run_id
       LEFT JOIN company_units cu ON cu.id = ps.unit_id
      WHERE ps.id = ? AND ps.deleted_at IS NULL LIMIT 1`,
    [payslipId]
  );
  if (!slip) return null;

  const itemRows = await query<SlipItem & RowDataPacket>(
    `SELECT head_code, head_name, head_name_ta, head_type, amount FROM payroll_items
      WHERE payslip_id = ? ORDER BY sort_order ASC, id ASC`,
    [payslipId]
  );
  const employerRow = await queryOne<RowDataPacket>('SELECT employer_id FROM payslips WHERE id = ? LIMIT 1', [payslipId]);
  const employer = await loadEmployer(Number(employerRow?.employer_id ?? 0), String(slip.company_name));

  const now = context.generatedAt ?? new Date();
  const period = monthLabel(Number(slip.month), Number(slip.year));
  const doc = createPdf({
    title: `Payslip ${String(slip.payslip_number)}`,
    subject: `Payslip for ${period} — ${String(slip.employee_name)}`,
    keywords: 'payslip, salary, wages, statutory register',
  });

  /* ------------------------------------------------------------- letterhead */
  letterhead(doc, {
    companyName: employer.name,
    addressLines: employer.addressLines,
    registrationLine: employer.registrationLine,
    documentTitle: 'Payslip',
    titleTa: 'சம்பள சீட்டு',
    subtitle: `${period}  ·  ${String(slip.run_number)}`,
    metaRows: [
      { label: 'Payslip No.', value: String(slip.payslip_number) },
      { label: 'Wage period', value: `${formatDate(slip.period_from)} to ${formatDate(slip.period_to)}` },
      { label: 'Generated', value: formatDate(now) },
    ],
  });

  /* --------------------------------------------------- employee particulars */
  sectionHeading(doc, 'Employee particulars', { titleTa: 'பணியாளர் விவரங்கள்' });
  keyValues(doc, [
    { label: 'Employee code', value: String(slip.employee_number) },
    { label: 'Employee name', value: String(slip.employee_name) },
    { label: 'Designation', value: text(slip.designation) },
    { label: 'Department', value: text(slip.employee_department) },
    { label: 'Unit / establishment', value: text(slip.unit_name) },
    { label: 'Date of joining', value: formatDate(slip.date_of_joining) },
    { label: 'PF number', value: text(slip.pf_number) },
    { label: 'ESI number', value: text(slip.esi_number) },
    { label: 'UAN', value: text(slip.uan_number) },
    { label: 'PAN', value: text(slip.pan_number) },
    { label: 'Bank', value: `${text(slip.bank_name)}  ·  ${maskAccountNumber(slip.bank_account_number)}` },
    { label: 'IFSC', value: text(slip.ifsc_code) },
  ], { columns: 3 });

  /* ------------------------------------------------------------- attendance */
  sectionHeading(doc, 'Attendance on which wages are computed', { titleTa: 'ஊதியம் கணக்கிடப்பட்ட வருகை விவரம்' });
  table(doc, {
    columns: [
      { key: 'working', label: 'Working days', width: 0.14, align: 'center' },
      { key: 'paid', label: 'Paid days', width: 0.13, align: 'center' },
      { key: 'present', label: 'Present', width: 0.12, align: 'center' },
      { key: 'leave', label: 'Leave', width: 0.1, align: 'center' },
      { key: 'holiday', label: 'Holiday', width: 0.11, align: 'center' },
      { key: 'weekly_off', label: 'Weekly off', width: 0.12, align: 'center' },
      { key: 'absent', label: 'Absent', width: 0.11, align: 'center' },
      { key: 'lop', label: 'Loss of pay', width: 0.12, align: 'center' },
      { key: 'overtime', label: 'OT hours', width: 0.05, align: 'center' },
    ],
    rows: [{
      working: number(slip.working_days).toFixed(2),
      paid: number(slip.paid_days).toFixed(2),
      present: number(slip.present_days).toFixed(2),
      leave: number(slip.leave_days).toFixed(2),
      holiday: number(slip.holiday_days).toFixed(2),
      weekly_off: number(slip.weekly_off_days).toFixed(2),
      absent: number(slip.absent_days).toFixed(2),
      lop: number(slip.lop_days).toFixed(2),
      overtime: number(slip.overtime_hours).toFixed(2),
    }],
  });

  /* ------------------------------------------------- earnings and deductions */
  sectionHeading(doc, 'Earnings and deductions', { titleTa: 'வரவுகள் மற்றும் பிடித்தங்கள்' });

  const earnings: SlipItem[] = [
    { head_code: 'BASIC', head_name: 'Basic Salary', head_name_ta: 'அடிப்படை ஊதியம்', head_type: 'Earning', amount: number(slip.basic) },
    { head_code: 'DA', head_name: 'Dearness Allowance', head_name_ta: 'அகவிலைப்படி', head_type: 'Earning', amount: number(slip.da) },
    { head_code: 'HRA', head_name: 'House Rent Allowance', head_name_ta: 'வீட்டு வாடகைப்படி', head_type: 'Earning', amount: number(slip.hra) },
    { head_code: 'TA', head_name: 'Travel Allowance', head_name_ta: 'பயணப்படி', head_type: 'Earning', amount: number(slip.ta) },
    { head_code: 'PA', head_name: 'Personal Allowance', head_name_ta: null, head_type: 'Earning', amount: number(slip.pa) },
    { head_code: 'EA', head_name: 'Education Allowance', head_name_ta: null, head_type: 'Earning', amount: number(slip.ea) },
    { head_code: 'NPBA', head_name: 'Non-Practising Allowance', head_name_ta: null, head_type: 'Earning', amount: number(slip.npba) },
    { head_code: 'OTHER', head_name: 'Other Allowances', head_name_ta: null, head_type: 'Earning', amount: number(slip.other_allowances) },
    { head_code: 'OT', head_name: 'Overtime', head_name_ta: 'கூடுதல் நேரம்', head_type: 'Earning', amount: number(slip.overtime_amount) },
    { head_code: 'BONUS', head_name: 'Bonus', head_name_ta: 'போனஸ்', head_type: 'Earning', amount: number((slip as unknown as Record<string, unknown>).bonus_amount) },
    { head_code: 'ARR', head_name: 'Arrears', head_name_ta: null, head_type: 'Earning', amount: number((slip as unknown as Record<string, unknown>).arrears_amount) },
    ...itemRows.filter((row) => row.head_type === 'Earning'),
  ].filter((row) => number(row.amount) > 0);

  // Extra heads already printed above are not repeated from `payroll_items`.
  const standardCodes = new Set(['BASIC', 'DA', 'HRA', 'TA', 'PA', 'EA', 'NPBA', 'OTHER', 'OT', 'BONUS', 'ARR', 'PF', 'ESI', 'PT', 'LWF', 'TDS', 'VPF']);
  const extraEarnings = earnings.filter((row) => !standardCodes.has(String(row.head_code).toUpperCase()));

  const deductions: SlipItem[] = [
    { head_code: 'PF', head_name: 'Provident Fund (EPF)', head_name_ta: 'வருங்கால வைப்பு நிதி', head_type: 'Deduction', amount: number(slip.pf_employee) },
    { head_code: 'VPF', head_name: 'Voluntary PF', head_name_ta: null, head_type: 'Deduction', amount: number(slip.vpf_amount) },
    { head_code: 'ESI', head_name: 'ESI Contribution', head_name_ta: 'ஈ.எஸ்.ஐ பங்களிப்பு', head_type: 'Deduction', amount: number(slip.esi_employee) },
    { head_code: 'PT', head_name: 'Professional Tax', head_name_ta: 'தொழில் வரி', head_type: 'Deduction', amount: number(slip.professional_tax) },
    { head_code: 'LWF', head_name: 'Labour Welfare Fund', head_name_ta: 'தொழிலாளர் நல நிதி', head_type: 'Deduction', amount: number(slip.lwf_amount) },
    { head_code: 'TDS', head_name: 'TDS / Income Tax (provisional)', head_name_ta: null, head_type: 'Deduction', amount: number(slip.tds_amount) },
    { head_code: 'ADV', head_name: 'Salary Advance', head_name_ta: 'முன்பணம்', head_type: 'Deduction', amount: number(slip.advance_deduction) },
    { head_code: 'CANTEEN', head_name: 'Canteen', head_name_ta: null, head_type: 'Deduction', amount: number(slip.canteen_deduction) },
    { head_code: 'OTHERD', head_name: 'Other Deductions', head_name_ta: null, head_type: 'Deduction', amount: number(slip.other_deductions) },
    ...itemRows.filter((row) => row.head_type === 'Deduction'),
  ].filter((row) => number(row.amount) > 0);

  const panelWidth = (CONTENT_WIDTH - 14) / 2;
  const rowCount = Math.max(earnings.length, deductions.length, 1);
  const averageRowHeight = 21;
  ensureSpace(doc, Math.min(rowCount * averageRowHeight + 60, 260));

  const panelTop = doc.y + 2;
  const earningsBottom = drawWagePanel(doc, earnings, {
    x: MARGIN, width: panelWidth, y: panelTop,
    title: 'Earnings', titleTa: 'வரவுகள்',
    totalLabel: 'Gross earnings', totalLabelTa: 'மொத்த ஊதியம்',
    total: number(slip.gross_earnings),
  });
  const deductionsBottom = drawWagePanel(doc, deductions, {
    x: MARGIN + panelWidth + 14, width: panelWidth, y: panelTop,
    title: 'Deductions', titleTa: 'பிடித்தங்கள்',
    totalLabel: 'Total deductions', totalLabelTa: 'மொத்த பிடித்தம்',
    total: number(slip.total_deductions), headerFill: '#f8fafc',
  });
  doc.y = Math.max(earningsBottom, deductionsBottom) + 8;

  if (extraEarnings.length + deductions.filter((row) => !standardCodes.has(String(row.head_code).toUpperCase())).length > 0) {
    paragraph(doc, 'Heads shown carry the structure in force for the period; the full head-wise breakup is held in the digital payslip record.', { size: 7.5, color: COLORS.muted });
  }

  /* ---------------------------------------------------------------- net pay */
  ensureSpace(doc, 78);
  const netY = doc.y + 2;
  doc.save().rect(MARGIN, netY, CONTENT_WIDTH, 46).fill('#eff6ff').restore();
  doc.save().strokeColor(COLORS.accent).lineWidth(0.8).rect(MARGIN, netY, CONTENT_WIDTH, 46).stroke().restore();
  setFont(doc, 9, { bold: true });
  doc.fillColor(COLORS.brand).text('NET PAY', MARGIN + 10, netY + 8, { width: 240, lineBreak: false });
  setFont(doc, 7.5, { tamil: true });
  doc.fillColor(COLORS.muted).text('நிகர ஊதியம்', MARGIN + 10, netY + 20, { width: 240, lineBreak: false });
  setFont(doc, 16, { bold: true });
  doc.fillColor(COLORS.brand).text(formatCurrency(number(slip.net_pay)), MARGIN + CONTENT_WIDTH - 250, netY + 6, {
    width: 240, align: 'right', lineBreak: false,
  });
  setFont(doc, 8);
  doc.fillColor(COLORS.muted).text(
    `Paid days ${number(slip.paid_days).toFixed(2)}  ·  Mode ${text(slip.payment_mode)}  ·  Status ${text(slip.payment_status)}${slip.paid_at ? ` on ${formatDate(slip.paid_at)}` : ''}`,
    MARGIN + CONTENT_WIDTH - 250, netY + 28, { width: 240, align: 'right', lineBreak: false }
  );
  doc.y = netY + 54;

  paragraph(doc, `Amount in words: ${numberToWords(number(slip.net_pay), { currency: true })}`, { size: 8.5, bold: true });
  if (slip.payment_reference) paragraph(doc, `Payment reference: ${String(slip.payment_reference)}`, { size: 8 });

  /* --------------------------------------------------- employer contribution */
  const employerShare = number(slip.pf_employer) + number(slip.esi_employer);
  if (employerShare > 0) {
    sectionHeading(doc, "Employer's contribution (not deducted from wages)");
    table(doc, {
      columns: [
        { key: 'head', label: 'Contribution', width: 0.6 },
        { key: 'amount', label: 'Amount', width: 0.4, align: 'right' },
      ],
      rows: [
        { head: 'Provident Fund — employer share', amount: formatCurrency(number(slip.pf_employer)) },
        { head: 'ESI — employer share', amount: formatCurrency(number(slip.esi_employer)) },
      ],
      footer: `Total employer cost: ${formatCurrency(employerShare)}`,
    });
  }

  /* ------------------------------------------------------------ declaration */
  sectionHeading(doc, 'Declaration', { titleTa: 'உறுதிமொழி' });
  bullets(doc, [
    'This payslip is issued under the employer\u2019s statutory wage registers and shows the wages paid for the period stated above.',
    'Professional tax and labour welfare fund are remitted to the State Government; provident fund and ESI contributions are remitted to the respective statutory authorities.',
    'Income tax shown is a provisional recovery. The final liability is determined on the employee\u2019s tax declaration and the year-end computation.',
    `Computer generated on ${formatDate(now)} by ${context.generatedByName} (${context.generatedByRole}). Any manual alteration of this document is void.`,
  ]);
  if (slip.remarks) paragraph(doc, `Remarks: ${String(slip.remarks)}`, { size: 8 });

  signatureBlock(doc, ['Employee acknowledgement', 'Prepared by (Payroll)', 'Authorised signatory'], {
    note: `Payslip ${String(slip.payslip_number)}  ·  ${period}  ·  ${String(slip.employee_number)} — ${String(slip.employee_name)}`,
  });

  spacer(doc, 2);
  line(doc);
  setFont(doc, 7.5);
  doc.fillColor(COLORS.muted).text(
    `Retain this payslip. Discrepancies must be reported to the payroll section within 30 days of issue.`,
    MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' }
  );

  stampFooters(doc, ({ index, total }) => ({
    left: employer.name,
    center: `${String(slip.payslip_number)}  ·  ${period}`,
    right: `Page ${index} of ${total}`,
  }));

  return renderPdf(doc);
}
