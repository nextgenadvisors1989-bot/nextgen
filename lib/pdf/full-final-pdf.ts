/**
 * Full and final settlement statement: who left and when, every amount payable and every recovery, the net figure in words,
 * and the acknowledgement the employee signs when the money is received. Printed from the settlement record, so it is only as
 * final as the record: a Draft prints "DRAFT - NOT YET APPROVED".
 */
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { COLORS, createPdf, keyValues, letterhead, paragraph, renderPdf, sectionHeading, setFont, signatureBlock, spacer, stampFooters, table } from '@/lib/pdf/base';
import { formatCurrency, numberToWords } from '@/lib/utils/formatting';
import { formatDate } from '@/lib/utils/dates';

const n = (value: unknown) => Number(value ?? 0);

export async function generateFullFinalPdf(settlementId: number, context: { generatedByName: string; generatedByRole: string; generatedAt?: Date }): Promise<Buffer | null> {
  const row = await queryOne<RowDataPacket>(
    `SELECT s.*, e.name AS employee_name, e.employee_number, e.designation, e.department, e.date_of_joining, e.pf_number, e.uan, e.bank_name, e.bank_account_number, e.ifsc_code,
            em.company_name, em.address_line_1, em.address_line_2, em.city, em.pincode, em.gst_number
       FROM full_final_settlements s JOIN employees e ON e.id = s.employee_id JOIN employers em ON em.id = s.employer_id
      WHERE s.id = ? AND s.deleted_at IS NULL`, [settlementId]);
  if (!row) return null;

  const doc = createPdf({ title: `Full and final settlement ${String(row.settlement_number)}`, subject: String(row.employee_name), author: String(row.company_name) });
  const approved = row.status === 'Approved' || row.status === 'Paid';
  letterhead(doc, {
    companyName: String(row.company_name),
    addressLines: [[row.address_line_1, row.address_line_2].filter(Boolean).join(', '), [row.city, row.pincode].filter(Boolean).join(' - ')].filter(Boolean) as string[],
    registrationLine: row.gst_number ? `GSTIN: ${String(row.gst_number)}` : '',
    documentTitle: 'Full and Final Settlement', titleTa: 'முழு மற்றும் இறுதி தீர்வு',
    subtitle: approved ? String(row.status) : 'DRAFT - NOT YET APPROVED',
    metaRows: [{ label: 'Settlement no.', value: String(row.settlement_number) }, { label: 'Status', value: String(row.status) }, { label: 'Prepared', value: formatDate(context.generatedAt ?? new Date()) }],
  });

  sectionHeading(doc, 'Employee and exit particulars', { titleTa: 'பணியாளர் மற்றும் விலகல் விவரங்கள்' });
  keyValues(doc, [
    { label: 'Employee', value: `${String(row.employee_name)} (${String(row.employee_number)})` }, { label: 'Designation', value: String(row.designation ?? '-') },
    { label: 'Department', value: String(row.department ?? '-') }, { label: 'Date of joining', value: formatDate(row.date_of_joining) },
    { label: 'Resignation date', value: formatDate(row.resignation_date) }, { label: 'Last working day', value: formatDate(row.last_working_day) },
    { label: 'Notice period (days)', value: `${n(row.notice_period_days)} (served ${n(row.notice_period_served_days)})` }, { label: 'PF / UAN', value: `${String(row.pf_number ?? '-')} / ${String(row.uan ?? '-')}` },
  ], { columns: 2 });

  const earnings: [string, number][] = [['Salary payable (part month)', n(row.salary_payable)], ['Leave encashment', n(row.leave_encashment)], ['Bonus payable', n(row.bonus_payable)],
    ['Gratuity payable', n(row.gratuity_payable)], ['Arrears payable', n(row.arrears_payable)], ['Other earnings', n(row.other_earnings)]];
  const deductions: [string, number][] = [['Notice pay recovery', n(row.notice_pay_recovery)], ['Advance recovery', n(row.advance_recovery)], ['Asset / damage recovery', n(row.asset_recovery)],
    ['Loan recovery', n(row.loan_recovery)], ['TDS', n(row.tds_deduction)], ['Other deductions', n(row.other_deductions)]];

  sectionHeading(doc, 'Amounts payable to the employee', { titleTa: 'பணியாளருக்கு வழங்க வேண்டிய தொகை' });
  table(doc, { columns: [{ key: 'head', label: 'Particulars', width: 0.7 }, { key: 'amount', label: 'Amount', width: 0.3, align: 'right' }],
    rows: earnings.map(([head, amount]) => ({ head, amount: formatCurrency(amount) })), footer: `Total earnings: ${formatCurrency(n(row.total_earnings))}` });
  sectionHeading(doc, 'Recoveries', { titleTa: 'பிடித்தங்கள்' });
  table(doc, { columns: [{ key: 'head', label: 'Particulars', width: 0.7 }, { key: 'amount', label: 'Amount', width: 0.3, align: 'right' }],
    rows: deductions.map(([head, amount]) => ({ head, amount: formatCurrency(amount) })), footer: `Total recoveries: ${formatCurrency(n(row.total_deductions))}` });

  const shortfall = Math.max(0, n(row.total_deductions) - n(row.total_earnings));
  spacer(doc, 4);
  setFont(doc, 11, { bold: true });
  doc.fillColor(COLORS.brand).text(`Net settlement payable: ${formatCurrency(n(row.net_settlement_amount))}`, { align: 'right' });
  paragraph(doc, `Amount in words: ${numberToWords(n(row.net_settlement_amount), { currency: true })}`, { size: 8.5, bold: true });
  if (shortfall > 0) paragraph(doc, `Recoveries exceed the amounts payable by ${formatCurrency(shortfall)}. The balance is recoverable from the employee and nothing is payable.`, { size: 8.5 });
  if (row.payment_date) paragraph(doc, `Paid on ${formatDate(row.payment_date)}${row.payment_reference ? ` - reference ${String(row.payment_reference)}` : ''}${row.bank_account_number ? ` to ${String(row.bank_name ?? 'bank')} account ending ${String(row.bank_account_number).slice(-4)}` : ''}.`, { size: 8.5 });
  if (row.remarks) paragraph(doc, `Remarks: ${String(row.remarks)}`, { size: 8.5 });

  sectionHeading(doc, 'Acknowledgement', { titleTa: 'ஒப்புதல்' });
  paragraph(doc, `I, ${String(row.employee_name)} (${String(row.employee_number)}), acknowledge receipt of the above amount in full and final settlement of all my dues from ${String(row.company_name)}, and I have no further claim of any kind against the company.`, { size: 9 });
  signatureBlock(doc, ['Employee signature and date', 'Prepared by (Payroll)', 'Authorised signatory'], { note: `${String(row.settlement_number)}  -  Generated by ${context.generatedByName} (${context.generatedByRole})` });
  stampFooters(doc, ({ index, total }) => ({ left: String(row.company_name), center: String(row.settlement_number), right: `Page ${index} of ${total}` }));
  return renderPdf(doc);
}
