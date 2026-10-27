/**
 * Wage register in the client's statutory layout ("Wage register for the month of ..., see Rule 11(5) G.O. Ms. 1216 dt. 23-9-71 P.W. Rules"):
 * one landscape table per page group with the grouped headings Wage details / Worked days-hours / Earnings / Deductions, a page-total
 * row on every page and the grand total with the signature block at the end.
 *
 * Rates per shift are the month's head amount divided by paid days. PF and ESI wages are recovered from the contribution
 * (employee PF is 12 % of PF wages, employee ESI is 0.75 % of ESI wages), since a payslip stores the contribution and not the wage base.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { COLORS, createPdf, renderPdf, setFont, type Doc } from '@/lib/pdf/base';
import { companyBranding } from '@/lib/pdf/branding';
import { formatDateTime } from '@/lib/utils/dates';
import { monthLabel } from '@/lib/validations/payroll.validation';

const M = 24;
const n = (value: unknown) => Number(value ?? 0);
const fmt = (value: number, digits = 2) => value.toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const INK = '#111827';
const RULE = '#374151';
const HEAD = '#e5e7eb';

interface Col { key: string; label: string; width: number; align?: 'left' | 'right' | 'center'; total?: boolean; digits?: number }

const COLS: Col[] = [
  { key: 'sr', label: 'S.No', width: 22, align: 'center' },
  { key: 'code', label: 'Emp.no', width: 64 },
  { key: 'name', label: 'Employee_Name', width: 70 },
  { key: 'designation', label: 'Designation', width: 62 },
  { key: 'rate', label: 'Wage / Shift', width: 30, align: 'right' },
  { key: 'rbasic', label: 'Basic', width: 28, align: 'right' },
  { key: 'rda', label: 'DA', width: 28, align: 'right' },
  { key: 'roa', label: 'OA', width: 26, align: 'right' },
  { key: 'rhra', label: 'HRA', width: 26, align: 'right' },
  { key: 'shifts', label: 'Shift worked', width: 24, align: 'right', digits: 0 },
  { key: 'nfh', label: 'NFH', width: 18, align: 'right', digits: 0 },
  { key: 'total_shift', label: 'Total Shift', width: 24, align: 'right', digits: 0 },
  { key: 'ot_hours', label: 'OT Hrs', width: 22, align: 'right', digits: 0 },
  { key: 'basic', label: 'Basic', width: 40, align: 'right', total: true },
  { key: 'da', label: 'DA', width: 38, align: 'right', total: true },
  { key: 'oa', label: 'OA', width: 34, align: 'right', total: true },
  { key: 'hra', label: 'HRA', width: 36, align: 'right', total: true },
  { key: 'gross', label: 'Gross Wages', width: 40, align: 'right', total: true },
  { key: 'ot', label: 'OT Amount', width: 34, align: 'right', total: true },
  { key: 'earned', label: 'Total Earned Wages', width: 42, align: 'right', total: true },
  { key: 'pf_wages', label: 'PF Wages', width: 38, align: 'right', total: true },
  { key: 'esi_wages', label: 'ESI Wages', width: 38, align: 'right', total: true },
  { key: 'pf', label: 'PF', width: 32, align: 'right', total: true },
  { key: 'esi', label: 'Esi', width: 26, align: 'right', total: true },
  { key: 'ot_esi', label: 'OT ESI', width: 24, align: 'right', total: true },
  { key: 'deduction', label: 'Total Deduction', width: 38, align: 'right', total: true },
  { key: 'net', label: 'Net Wages', width: 42, align: 'right', total: true },
];

const GROUPS: { label: string; from: string; to: string }[] = [
  { label: 'Wage Details', from: 'rate', to: 'rhra' },
  { label: 'Worked Days / Hours', from: 'shifts', to: 'ot_hours' },
  { label: 'Earnings', from: 'basic', to: 'earned' },
  { label: 'Deductions', from: 'pf', to: 'deduction' },
];

function buildRow(payslip: RowDataPacket, index: number): Record<string, string | number> {
  const paid = n(payslip.paid_days) || n(payslip.present_days) || 1;
  const oa = n(payslip.ta) + n(payslip.pa) + n(payslip.ea) + n(payslip.npba) + n(payslip.other_allowances);
  const gross = n(payslip.basic) + n(payslip.da) + n(payslip.hra) + oa;
  const pf = n(payslip.pf_employee) + n(payslip.vpf_amount);
  const esi = n(payslip.esi_employee);
  return {
    sr: index + 1, code: String(payslip.employee_number), name: String(payslip.employee_name), designation: String(payslip.designation ?? ''),
    rate: gross / paid, rbasic: n(payslip.basic) / paid, rda: n(payslip.da) / paid, roa: oa / paid, rhra: n(payslip.hra) / paid,
    shifts: n(payslip.present_days) || n(payslip.paid_days), nfh: n(payslip.holiday_days), total_shift: n(payslip.paid_days), ot_hours: n(payslip.overtime_hours),
    basic: n(payslip.basic), da: n(payslip.da), oa, hra: n(payslip.hra), gross, ot: n(payslip.overtime_amount), earned: n(payslip.gross_earnings),
    pf_wages: n(payslip.pf_employee) > 0 ? Math.round(n(payslip.pf_employee) / 0.12) : 0, esi_wages: esi > 0 ? Math.round(esi / 0.0075) : 0,
    pf, esi, ot_esi: 0, deduction: n(payslip.total_deductions), net: n(payslip.net_pay),
  };
}

function cell(doc: Doc, text: string, x: number, y: number, width: number, align: 'left' | 'right' | 'center', bold = false, size = 6.3): void {
  // Shrink to fit, then truncate: a figure must never wrap onto a second line inside its cell.
  const room = width - 4;
  let fontSize = size;
  setFont(doc, fontSize, { bold });
  while (fontSize > 4.6 && doc.widthOfString(text) > room) { fontSize -= 0.2; setFont(doc, fontSize, { bold }); }
  let shown = text;
  while (shown.length > 1 && doc.widthOfString(shown) > room) shown = shown.slice(0, -1);
  doc.fillColor(INK).text(shown, x + 2, y, { width: room + 2, align, lineBreak: false });
}

export async function generateWageRegisterRule11(runId: number, context: { generatedByName: string; generatedByRole: string; generatedAt?: Date }): Promise<Buffer | null> {
  const run = await queryOne<RowDataPacket>('SELECT * FROM payroll_runs WHERE id = ? AND deleted_at IS NULL', [runId]);
  if (!run) return null;
  const [slips, employer, branding] = await Promise.all([
    query<RowDataPacket>(
      `SELECT p.*, e.name AS employee_name, e.employee_number, e.designation FROM payslips p JOIN employees e ON e.id = p.employee_id
        WHERE p.payroll_run_id = ? AND p.deleted_at IS NULL ORDER BY e.employee_number`, [runId]),
    queryOne<RowDataPacket>('SELECT company_name, address_line_1, city FROM employers WHERE id = ?', [run.employer_id]),
    companyBranding(),
  ]);
  const company = String(employer?.company_name ?? 'Establishment').toUpperCase();
  const period = monthLabel(n(run.month), n(run.year)).toUpperCase();
  const rows = slips.map(buildRow);

  const doc = createPdf({ title: `Wage register ${period}`, subject: company, author: company }, { landscape: true });
  const pageW = doc.page.width;
  const tableW = COLS.reduce((sum, c) => sum + c.width, 0);
  const scale = (pageW - M * 2) / tableW;
  const cols = COLS.map((c) => ({ ...c, width: c.width * scale }));
  const xs: number[] = [];
  cols.reduce((x, c) => { xs.push(x); return x + c.width; }, M);
  const rowH = 20;
  const headTop = 78;
  const headH = 40;
  const bottom = doc.page.height - 50;
  const perPage = Math.floor((bottom - (headTop + headH) - rowH) / rowH);
  const sum = (key: string, from: number, to: number) => rows.slice(from, to).reduce((total, row) => total + Number(row[key] ?? 0), 0);

  const heading = () => {
    if (branding.logo) { try { doc.image(branding.logo, M, 22, { fit: [40, 34] }); } catch { /* skip an unreadable logo */ } }
    setFont(doc, 11, { bold: true });
    doc.fillColor(INK).text(company, M, 24, { width: pageW - M * 2, align: 'center', lineBreak: false });
    setFont(doc, 10, { bold: true });
    doc.text(`WAGE REGISTER FOR THE MONTH OF ${period}`, M, 40, { width: pageW - M * 2, align: 'center', lineBreak: false });
    setFont(doc, 8, { bold: true });
    doc.text('(SEE RULE 11(5) G.O. Ms. 1216 dt. 23-9-71 P W. Rules)', M, 55, { width: pageW - M * 2, align: 'center', lineBreak: false });
    // grouped heading band, then the column captions
    doc.save().fillColor(HEAD).rect(M, headTop, pageW - M * 2, headH).fill().restore();
    for (const group of GROUPS) {
      const a = cols.findIndex((c) => c.key === group.from);
      const b = cols.findIndex((c) => c.key === group.to);
      const gx = xs[a];
      const gw = xs[b] + cols[b].width - gx;
      cell(doc, group.label, gx, headTop + 3, gw, 'center', true, 6.8);
      doc.save().strokeColor(RULE).lineWidth(0.5).moveTo(gx, headTop + 14).lineTo(gx + gw, headTop + 14).stroke().restore();
    }
    cols.forEach((c, i) => {
      const grouped = GROUPS.some((g) => cols.findIndex((x) => x.key === g.from) <= i && i <= cols.findIndex((x) => x.key === g.to));
      setFont(doc, 5.8, { bold: true });
      doc.fillColor(INK).text(c.label, xs[i] + 1.5, grouped ? headTop + 17 : headTop + 10, { width: c.width - 3, align: 'center', height: 22, ellipsis: true });
    });
  };

  const grid = (top: number, count: number) => {
    const height = headH + (count + 1) * rowH;
    doc.save().strokeColor(RULE).lineWidth(0.6).rect(M, headTop, pageW - M * 2, height).stroke();
    xs.forEach((x, i) => {
      if (i === 0) return;
      // inside a group the vertical rule starts under the group caption so the merged heading stays clean
      const inside = GROUPS.some((g) => i > cols.findIndex((c) => c.key === g.from) && i <= cols.findIndex((c) => c.key === g.to));
      doc.moveTo(x, inside ? headTop + 14 : headTop).lineTo(x, headTop + height).stroke();
    });
    for (let r = 0; r <= count; r += 1) {
      const y = top + r * rowH;
      doc.moveTo(M, y).lineTo(pageW - M, y).stroke();
    }
    doc.moveTo(M, top - headH + headH).lineTo(pageW - M, top).stroke();
    doc.restore();
  };

  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  for (let page = 0; page < pages; page += 1) {
    if (page > 0) doc.addPage();
    heading();
    const from = page * perPage;
    const to = Math.min(rows.length, from + perPage);
    const top = headTop + headH;
    const shown = rows.slice(from, to);
    shown.forEach((row, i) => {
      const y = top + i * rowH + 6;
      cols.forEach((c, j) => {
        const raw = row[c.key];
        const text = typeof raw === 'number' ? (c.key === 'sr' ? String(raw) : fmt(raw, c.digits ?? 2)) : String(raw ?? '');
        cell(doc, text, xs[j], y, c.width, c.align ?? 'left');
      });
    });
    const totalY = top + shown.length * rowH + 6;
    cell(doc, 'Page total', M, totalY, xs[4] - M, 'left', true);
    cols.forEach((c, j) => { if (c.total) cell(doc, fmt(sum(c.key, from, to)), xs[j], totalY, c.width, 'right', true); });
    grid(top, shown.length);

    if (page === pages - 1) {
      const gy = top + (shown.length + 1) * rowH + 10;
      setFont(doc, 7.5, { bold: true });
      doc.fillColor(INK).text(`Employees: ${rows.length}     Grand total gross wages: ${fmt(sum('earned', 0, rows.length))}     Total deductions: ${fmt(sum('deduction', 0, rows.length))}     Net wages: ${fmt(sum('net', 0, rows.length))}`,
        M, gy, { width: pageW - M * 2, lineBreak: false });
      if (gy + 50 < doc.page.height - 30) {
        const sy = gy + 34;
        ['Prepared by (Payroll)', 'Checked by (Accounts)', 'Manager - Personnel', 'Authorised signatory'].forEach((label, i) => {
          const x = M + i * ((pageW - M * 2) / 4);
          doc.save().strokeColor(RULE).lineWidth(0.5).moveTo(x + 6, sy).lineTo(x + 150, sy).stroke().restore();
          setFont(doc, 7);
          doc.fillColor(COLORS.muted).text(label, x + 6, sy + 3, { lineBreak: false });
        });
      }
    }
    doc.page.margins.bottom = 0; // footer sits below the text frame; do not let it spawn a page
    setFont(doc, 6.5);
    doc.fillColor(COLORS.muted).text(`${String(run.run_number)}  |  Generated by ${context.generatedByName} (${context.generatedByRole}) on ${formatDateTime(context.generatedAt ?? new Date())}  |  Page ${page + 1} of ${pages}`,
      M, doc.page.height - 30, { width: pageW - M * 2, align: 'center', lineBreak: false });
  }
  return renderPdf(doc);
}
