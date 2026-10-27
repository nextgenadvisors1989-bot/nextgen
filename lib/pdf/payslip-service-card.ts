/**
 * Payslip in the client's statutory "Service Card cum Payslip" layout (Form 25 B, 15, 12, VI under the Tamil Nadu Minimum Wages Rules):
 * one A4 page, every caption in English and Tamil, identity box, earnings / deductions / attendance side by side, leave table,
 * "Salary to pay", and the signature strip. Heads the payroll does not track print as 0.00, as on the paper original.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { COLORS, createPdf, renderPdf, setFont, type Doc } from '@/lib/pdf/base';
import { companyBranding } from '@/lib/pdf/branding';
import { formatDate } from '@/lib/utils/dates';
import { formatCurrency, numberToWords } from '@/lib/utils/formatting';
import { monthLabel } from '@/lib/validations/payroll.validation';

const M = 28;
const W = 595.28 - M * 2;
const INK = '#111827';
const RULE = '#374151';
const n = (value: unknown) => Number(value ?? 0);
const money = (value: unknown) => n(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const text = (value: unknown, fallback = '') => (value === null || value === undefined || value === '' ? fallback : String(value));

/** English caption with its Tamil twin underneath, inside a box. */
function caption(doc: Doc, en: string, ta: string, x: number, y: number, width: number, options: { bold?: boolean; size?: number; align?: 'left' | 'center' | 'right' } = {}): number {
  const size = options.size ?? 7.5;
  setFont(doc, size, { bold: options.bold });
  doc.fillColor(INK).text(en, x, y, { width, align: options.align ?? 'left', lineBreak: false });
  if (!ta) return y + size + 2;
  setFont(doc, size - 1, { tamil: true });
  doc.fillColor(COLORS.muted).text(ta, x, y + size + 2.5, { width, align: options.align ?? 'left', lineBreak: false });
  return y + size * 2 + 5;
}

function box(doc: Doc, x: number, y: number, width: number, height: number): void {
  doc.save().strokeColor(RULE).lineWidth(0.7).rect(x, y, width, height).stroke().restore();
}

function hline(doc: Doc, x: number, y: number, width: number): void {
  doc.save().strokeColor(RULE).lineWidth(0.5).moveTo(x, y).lineTo(x + width, y).stroke().restore();
}

function vline(doc: Doc, x: number, y: number, height: number): void {
  doc.save().strokeColor(RULE).lineWidth(0.5).moveTo(x, y).lineTo(x, y + height).stroke().restore();
}

function value(doc: Doc, v: string, x: number, y: number, width: number, align: 'left' | 'right' | 'center' = 'left', bold = false): void {
  setFont(doc, 8, { bold });
  doc.fillColor(INK).text(v, x, y, { width, align, lineBreak: false, ellipsis: true });
}

export async function generateServiceCardPayslip(payslipId: number, context: { generatedByName: string; generatedByRole: string; generatedAt?: Date }): Promise<Buffer | null> {
  const slip = await queryOne<RowDataPacket>(
    `SELECT ps.*, emp.name AS employee_name, emp.employee_number, emp.designation, emp.department AS employee_department, emp.father_name, emp.date_of_birth,
            emp.date_of_joining, emp.pf_number, emp.esi_number, emp.pan_number, emp.uan AS uan_number, emp.employer_id AS emp_employer_id,
            e.company_name, e.address_line_1, e.address_line_2, e.city, e.state, e.pincode, cu.unit_name, cu.location AS unit_location, pr.run_number
       FROM payslips ps JOIN employees emp ON emp.id = ps.employee_id JOIN employers e ON e.id = ps.employer_id
       JOIN payroll_runs pr ON pr.id = ps.payroll_run_id LEFT JOIN company_units cu ON cu.id = ps.unit_id
      WHERE ps.id = ? AND ps.deleted_at IS NULL LIMIT 1`, [payslipId]);
  if (!slip) return null;

  const [leave, lateRow, extras] = await Promise.all([
    query<RowDataPacket>(
      `SELECT lt.code, ll.opening_balance + ll.accrued AS credit, ll.availed, ll.closing_balance AS balance
         FROM leave_ledgers ll JOIN leave_types lt ON lt.id = ll.leave_type_id
        WHERE ll.employee_id = ? AND ll.year = ? AND ll.deleted_at IS NULL AND lt.code IN ('CL','EL')`, [slip.employee_id, slip.year]).catch(() => [] as RowDataPacket[]),
    queryOne<RowDataPacket>(
      `SELECT COUNT(*) AS late FROM attendance WHERE employee_id = ? AND attendance_date BETWEEN ? AND ? AND deleted_at IS NULL AND (status = 'Late' OR late_minutes > 0)`,
      [slip.employee_id, slip.period_from, slip.period_to]).catch(() => null),
    query<RowDataPacket>('SELECT head_code, head_type, amount FROM payroll_items WHERE payslip_id = ?', [payslipId]).catch(() => [] as RowDataPacket[]),
  ]);
  const extra = (type: string, ...codes: string[]) => extras.filter((row) => row.head_type === type && codes.includes(String(row.head_code).toUpperCase())).reduce((s, row) => s + n(row.amount), 0);
  const ledger = (code: string) => leave.find((row) => row.code === code);

  const branding = await companyBranding();
  const logo = branding.logo;
  const doc = createPdf({ title: `Service card cum payslip ${String(slip.payslip_number)}`, subject: `${String(slip.employee_name)} - ${monthLabel(n(slip.month), n(slip.year))}`, keywords: 'payslip, service card, form 25B' });
  const period = monthLabel(n(slip.month), n(slip.year)).toUpperCase().replace(' ', ' - ');
  const company = text(slip.company_name).toUpperCase();
  const address = [slip.address_line_1, slip.address_line_2, slip.city, slip.pincode].filter(Boolean).join(', ');

  /* ------------------------------------------------------------ title block */
  let y = M;
  if (logo) {
    try { doc.image(logo, M, y, { fit: [46, 36] }); } catch { /* an unreadable logo is skipped, the slip still prints */ }
  }
  setFont(doc, 11, { bold: true });
  doc.fillColor(INK).text(company, M + 52, y, { width: W - 52, align: 'center', lineBreak: false });
  setFont(doc, 8);
  doc.text(text(slip.unit_name ? `${slip.unit_name}` : '').toUpperCase(), M + 52, y + 14, { width: W - 52, align: 'center', lineBreak: false });
  doc.text(address, M + 52, y + 25, { width: W - 52, align: 'center', lineBreak: false });
  setFont(doc, 8, { bold: true });
  doc.text('UNDER RULE 27(2) OF THE TAMIL NADU MINIMUM WAGES RULE 1953', M + 52, y + 37, { width: W - 52, align: 'center', lineBreak: false });
  y += 54;

  const frameTop = y;
  setFont(doc, 9, { bold: true });
  doc.fillColor(INK).text(`FORM - 25 B,15,12,VI SERVICE CARD Cum PAYSLIP For the month of ${period}`, M, y + 4, { width: W, align: 'center', lineBreak: false });
  y += 20;
  hline(doc, M, y, W);

  /* ------------------------------------------------------------ identity box */
  const half = W / 2;
  const rows: [string, string, string, string, string, string, string, string][] = [
    ['Ecode / Name', 'எண் / பெயர்', `${text(slip.employee_number)}  /  ${text(slip.employee_name)}`, 'Designation', 'பதவி', text(slip.designation), '', ''],
    ["Father's Name", 'தந்தை பெயர்', text(slip.father_name), 'Division', 'பிரிவு', text(slip.employee_department), '', ''],
    ['Date of Birth', 'பிறந்த தேதி', formatDate(slip.date_of_birth), 'Location', 'இடம்', text(slip.unit_location || slip.unit_name), '', ''],
    ['Department', 'துறை', text(slip.employee_department), 'PAN No', 'நிரந்தர கணக்கு எண்', text(slip.pan_number), '', ''],
    ['ESI No.', 'இ.எஸ்.ஐ எண்', text(slip.esi_number), 'Bank A/c No.', 'வங்கி கணக்கு எண்', `${text(slip.bank_account_number)}  ${slip.ifsc_code ? `(${String(slip.ifsc_code)})` : ''}`, '', ''],
    ['PF No.', 'பி.எப் எண்', text(slip.pf_number), 'UAN', 'யு.ஏ.என்', text(slip.uan_number), '', ''],
  ];
  const rowH = 23;
  rows.forEach((row, i) => {
    const top = y + i * rowH;
    caption(doc, row[0], row[1], M + 4, top + 2, 78);
    value(doc, row[2], M + 84, top + 8, half - 88);
    caption(doc, row[3], row[4], M + half + 4, top + 2, 78);
    value(doc, row[5], M + half + 84, top + 8, half - 88);
    if (i < rows.length - 1) hline(doc, M, top + rowH, W);
  });
  vline(doc, M + half, y, rows.length * rowH);
  y += rows.length * rowH;
  hline(doc, M, y, W);

  /* ----------------------------------------------- earnings | deductions | attendance */
  const colE = 190;
  const colD = 150;
  const colA = W - colE - colD;
  const bodyTop = y;
  const heads = (items: [string, string, number][], x: number, width: number, top: number, title: [string, string]) => {
    caption(doc, title[0], title[1], x + 4, top + 2, width - 8, { bold: true });
    let cy = top + 24;
    for (const [en, ta, amount] of items) {
      caption(doc, en, ta, x + 4, cy, width - 70, { size: 7 });
      value(doc, `:  ${money(amount)}`, x + width - 66, cy + 4, 62, 'right');
      cy += 23;
    }
    return cy;
  };

  const earnings: [string, string, number][] = [
    ['Basic & DA', 'அடிப்படை, ஊதியம் அக. விலைப்படி', n(slip.basic) + n(slip.da)],
    ['Other.All', 'இதர அனைத்துப்படி', n(slip.pa) + n(slip.ea) + n(slip.npba) + n(slip.other_allowances)],
    ['Conv All & TA', 'பயணப்படி', n(slip.ta)],
    ['HRA', 'வீட்டு வாடகைப்படி', n(slip.hra)],
    ['Incentive', 'ஊக்கத் தொகை', n(slip.bonus_amount) + extra('Earning', 'INCENTIVE')],
    ['Wash All', 'சலவைப்படி', extra('Earning', 'WASH')],
    ['N/F/H-Wages', 'தேசிய-பண்டிகை விடுமுறை ஊதியம்', extra('Earning', 'NFH')],
    ['OT Salary', 'கூடுதல் நேர ஊதியம்', n(slip.overtime_amount)],
  ];
  const deductions: [string, string, number][] = [
    ['PF', 'பி.எப்', n(slip.pf_employee) + n(slip.vpf_amount)],
    ['ESI', 'இ.எஸ்.ஐ', n(slip.esi_employee)],
    ['Advance', 'முன்பணம்', n(slip.advance_deduction)],
    ['Loan', 'கடன்', extra('Deduction', 'LOAN')],
    ['Suspense', 'பிடித்தம்', extra('Deduction', 'SUSPENSE')],
    ['LOP', 'சம்பள இழப்பு', extra('Deduction', 'LOP')],
    ['Mess', 'உணவு', n(slip.canteen_deduction)],
    ['Others', 'இதர வகை', n(slip.other_deductions) + n(slip.professional_tax) + n(slip.lwf_amount) + n(slip.tds_amount)],
    ['OT ESI', 'கூடுதல் நேர இ.எஸ்.ஐ', extra('Deduction', 'OTESI')],
  ];
  const earnEnd = heads(earnings, M, colE, bodyTop, ['EARNINGS', 'வரவு (ஊதியத் தொகை)']);
  heads(deductions, M + colE, colD, bodyTop, ['DEDUCTIONS', 'பிடித்தங்கள்']);
  const bodyHeight = Math.max(earnEnd, bodyTop + 24 + deductions.length * 23) - bodyTop + 4;
  vline(doc, M + colE, bodyTop, bodyHeight + 22);
  vline(doc, M + colE + colD, bodyTop, bodyHeight + 22);

  /* attendance + leave */
  const ax = M + colE + colD;
  caption(doc, 'ATTENDANCE', 'வருகைப் பதிவு', ax + 4, bodyTop + 2, colA - 8, { bold: true });
  const attHeads: [string, string, string][] = [
    ['Dt of Joining', 'வேலைக்கு சேர்ந்த நாள்', formatDate(slip.date_of_joining)],
    ['Actual Work', 'மொத்த வேலை நாள்', n(slip.working_days).toFixed(0)],
    ['Late Days', 'தாமத வருகை', String(n(lateRow?.late))],
    ['N/F/H', 'தேசிய பண்டிகை விடுமுறை', money(slip.holiday_days)],
    ['Emp.Wkd Days', 'தொழிலாளர் வேலை செய்த நாட்கள்', money(n(slip.present_days) || n(slip.paid_days))],
  ];
  let ay = bodyTop + 24;
  for (const [en, ta, v] of attHeads) {
    caption(doc, en, ta, ax + 4, ay, colA - 62, { size: 6.5 });
    value(doc, v, ax + colA - 58, ay + 4, 54, 'right');
    ay += 21;
  }
  const leaveTop = ay + 2;
  hline(doc, ax, leaveTop, colA);
  const lw = [colA * 0.28, colA * 0.24, colA * 0.24, colA * 0.24];
  const lh = ['Type', 'Credit', 'Availed', 'Balance'];
  const lt = ['வகை', 'இருப்பு', 'எடுத்தது', 'மீதி'];
  let lx = ax;
  lh.forEach((h, i) => { caption(doc, h, lt[i], lx + 3, leaveTop + 2, lw[i] - 4, { size: 6.5 }); lx += lw[i]; });
  const leaveRows: [string, string][] = [['CL', 'சாதாரண விடுப்பு'], ['EL', 'ஈட்டிய விடுப்பு']];
  leaveRows.forEach(([code, ta], i) => {
    const top = leaveTop + 20 + i * 20;
    hline(doc, ax, top, colA);
    const row = ledger(code);
    caption(doc, code, ta, ax + 3, top + 2, lw[0] - 4, { size: 6.5 });
    value(doc, money(row?.credit), ax + lw[0], top + 6, lw[1] - 4, 'right');
    value(doc, money(row?.availed), ax + lw[0] + lw[1], top + 6, lw[2] - 4, 'right');
    value(doc, money(row?.balance), ax + lw[0] + lw[1] + lw[2], top + 6, lw[3] - 4, 'right');
  });
  const leaveEnd = leaveTop + 20 + leaveRows.length * 20;
  hline(doc, ax, leaveEnd, colA);
  caption(doc, 'Total', 'மொத்தம்', ax + 3, leaveEnd + 2, 50, { size: 6.5 });

  /* totals strip */
  const stripTop = Math.max(bodyTop + bodyHeight, leaveEnd + 24);
  hline(doc, M, stripTop, W);
  caption(doc, 'Total', 'மொத்தம்', M + 4, stripTop + 3, 50, { bold: true });
  value(doc, `:  ${money(slip.gross_earnings)}`, M + colE - 90, stripTop + 8, 86, 'right', true);
  caption(doc, 'Total', 'மொத்தம்', M + colE + 4, stripTop + 3, 50, { bold: true });
  value(doc, `:  ${money(slip.total_deductions)}`, M + colE + colD - 90, stripTop + 8, 86, 'right', true);
  vline(doc, M + colE, stripTop, 24);
  vline(doc, M + colE + colD, stripTop, 24);
  y = stripTop + 24;
  hline(doc, M, y, W);

  /* salary to pay */
  caption(doc, 'Salary To Pay Rs.', 'சம்பளம் கொடுக்கப்பட்டது', M + colE + colD + 4, y + 3, colA - 8, { bold: true, size: 8 });
  value(doc, `:  ${money(slip.net_pay)}`, M + W - 110, y + 10, 106, 'right', true);
  setFont(doc, 7.5);
  doc.fillColor(INK).text(numberToWords(n(slip.net_pay), { currency: true }), M + 4, y + 8, { width: colE + colD - 8, lineBreak: false, ellipsis: true });
  y += 28;
  hline(doc, M, y, W);

  /* signatures */
  const cellW = W / 3;
  const sig: [string, string, string, string][] = [
    ['Checked By', 'சரிபார்ப்பவர்', 'Admin/Accounts', 'நிர்வாகம்/கணக்காளர்'],
    ['Recieved By', 'பெறுபவர்', "Employee's Signature", 'தொழிலாளர் கையொப்பம்'],
    ['Authorised By', 'அங்கீகரிப்பவர்', 'Chief Manager - HRD', 'முதன்மை மேலாளர் - மனிதவள மேம்பாடு'],
  ];
  sig.forEach(([a, at, b, bt], i) => {
    const x = M + i * cellW;
    caption(doc, a, at, x + 4, y + 3, cellW - 8, { size: 7 });
    caption(doc, b, bt, x + 4, y + 36, cellW - 8, { size: 7 });
    if (i > 0) vline(doc, x, y, 62);
  });
  y += 62;
  box(doc, M, frameTop, W, y - frameTop);
  setFont(doc, 6.5);
  doc.fillColor(COLORS.muted).text(
    `${String(slip.payslip_number)}  |  ${String(slip.run_number)}  |  Computer generated on ${formatDate(context.generatedAt ?? new Date())} by ${context.generatedByName} (${context.generatedByRole}).`,
    M, y + 6, { width: W, align: 'center', lineBreak: false });

  return renderPdf(doc);
}
