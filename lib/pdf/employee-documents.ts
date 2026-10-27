/**
 * Personal-file documents, filled from the employee record: the cover checklist, appointment order, confirmation letter, service record,
 * Gratuity Form F, EPF Form 2, EPF Form 11, wage-acceptance letter, wage revision letter and the affirmative statement. Layouts follow the
 * client's own forms; Tamil appears only where the paper original has it and is set in the Tamil face (which has no Latin letters or digits,
 * so every Tamil run is Tamil only).
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { COLORS, createPdf, renderPdf, setFont, type Doc } from '@/lib/pdf/base';
import { companyBranding } from '@/lib/pdf/branding';
import { formatDate } from '@/lib/utils/dates';

export const EMPLOYEE_DOCUMENTS = [
  { type: 'checklist', label: 'Personal file checklist', labelTa: 'தனிநபர் கோப்பு சரிபார்ப்பு பட்டியல்' },
  { type: 'appointment-order', label: 'Appointment order', labelTa: 'பணி நியமன உத்தரவு' },
  { type: 'confirmation-letter', label: 'Confirmation letter', labelTa: 'பணி நிரந்தர உறுதி கடிதம்' },
  { type: 'service-record', label: 'Service record', labelTa: 'பணிப் பதிவேடு' },
  { type: 'form-f', label: 'Gratuity Form F (nomination)', labelTa: 'படிவம் எஃப்' },
  { type: 'form-2', label: 'EPF Form 2 (nomination and declaration)', labelTa: 'படிவம் 2' },
  { type: 'form-11', label: 'EPF Form 11 (declaration)', labelTa: 'படிவம் 11' },
  { type: 'bank-letter', label: 'Letter of acceptance to receive wages through bank', labelTa: 'வங்கி மூலம் ஊதியம் பெற ஒப்புதல்' },
  { type: 'wage-revision', label: 'Salary and wages revision letter', labelTa: 'ஊதிய திருத்தக் கடிதம்' },
  { type: 'affirmative-statement', label: 'Affirmative statement', labelTa: 'உறுதிமொழி' },
] as const;
export type EmployeeDocumentType = (typeof EMPLOYEE_DOCUMENTS)[number]['type'];
export const isEmployeeDocumentType = (value: string | null): value is EmployeeDocumentType => EMPLOYEE_DOCUMENTS.some((doc) => doc.type === value);

const M = 46;
const W = 595.28 - M * 2;
const INK = '#111827';
const s = (value: unknown, fallback = '') => (value === null || value === undefined || value === '' ? fallback : String(value));
/** A TIME column prints as HH:MM ("11:00:00" -> "11:00"). */
const clock = (value: unknown, fallback: string) => {
  const raw = value ? String(value) : '';
  if (!raw) return fallback;
  return /^\d{2}:\d{2}:\d{2}$/.test(raw) ? raw.slice(0, 5) : raw;
};
const money = (value: unknown) => Number(value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const DAYS_TA: Record<string, string> = { Sunday: 'ஞாயிற்றுக்கிழமை', Monday: 'திங்கட்கிழமை', Tuesday: 'செவ்வாய்க்கிழமை', Wednesday: 'புதன்கிழமை', Thursday: 'வியாழக்கிழமை', Friday: 'வெள்ளிக்கிழமை', Saturday: 'சனிக்கிழமை' };

interface Ctx { generatedByName: string; generatedByRole: string; generatedAt?: Date }
interface Facts {
  e: RowDataPacket; firm: string; unit: string; address: string; logo: Buffer | null;
  nominees: RowDataPacket[]; services: RowDataPacket[]; checklist: RowDataPacket[]; place: string; today: string;
}

/* ───────────────────────────── drawing helpers ───────────────────────────── */

function t(doc: Doc, text: string, options: { size?: number; bold?: boolean; tamil?: boolean; align?: 'left' | 'center' | 'right'; x?: number; width?: number; gap?: number; color?: string; underline?: boolean } = {}): void {
  setFont(doc, options.size ?? 9.5, { bold: options.bold, tamil: options.tamil });
  doc.fillColor(options.color ?? INK).text(text, options.x ?? M, doc.y, { width: options.width ?? W, align: options.align ?? 'left', underline: options.underline, lineGap: 1.5 });
  doc.y += options.gap ?? 4;
}

/** English line with its Tamil twin directly below. */
function bi(doc: Doc, en: string, ta: string, options: { size?: number; bold?: boolean; align?: 'left' | 'center' | 'right'; x?: number; width?: number } = {}): void {
  t(doc, en, { ...options, gap: 0 });
  if (ta) t(doc, ta, { ...options, tamil: true, size: (options.size ?? 9.5) - 1, bold: false, color: COLORS.muted, gap: 5 });
  else doc.y += 4;
}

function banner(doc: Doc, f: Facts): void {
  const top = doc.y;
  const lines = [f.unit || f.firm, f.unit ? `Div. of ${f.firm}` : '', f.address].filter(Boolean);
  doc.save().strokeColor(INK).lineWidth(0.8).rect(M, top, W, 14 + lines.length * 12).stroke().restore();
  if (f.logo) { try { doc.image(f.logo, M + 5, top + 4, { fit: [34, 30] }); } catch { /* unreadable logo is skipped */ } }
  doc.y = top + 7;
  lines.forEach((line, i) => t(doc, line.toUpperCase(), { align: 'center', bold: i === 0 || i === 1, size: i === 0 ? 10 : 8.5, gap: 1 }));
  doc.y = top + 22 + lines.length * 12;
}

function titleBlock(doc: Doc, en: string, ta?: string, sub?: string): void {
  t(doc, en, { bold: true, align: 'center', size: 12, underline: true, gap: 1 });
  if (ta) t(doc, ta, { tamil: true, align: 'center', size: 10, gap: 1 });
  if (sub) t(doc, sub, { align: 'center', size: 8.5, gap: 6 });
  else doc.y += 6;
}

/** Label : value rows with an optional Tamil label. */
function fields(doc: Doc, rows: [string, string, string?][], labelWidth = 130): void {
  for (const [label, value, ta] of rows) {
    const y = doc.y;
    setFont(doc, 9.5, { bold: true });
    doc.fillColor(INK).text(label, M, y, { width: labelWidth, lineBreak: false });
    if (ta) { setFont(doc, 8, { tamil: true }); doc.fillColor(COLORS.muted).text(ta, M, y + 11, { width: labelWidth, lineBreak: false }); }
    setFont(doc, 9.5);
    doc.fillColor(INK).text(`:  ${value}`, M + labelWidth, y, { width: W - labelWidth });
    doc.y = Math.max(doc.y, y + (ta ? 24 : 15)) + 2;
  }
}

function sign(doc: Doc, f: Facts, labels: [string, string?][], withPlace = true): void {
  if (doc.y > doc.page.height - 130) doc.addPage();
  doc.y += 14;
  if (withPlace) { t(doc, `Date   : ${f.today}`, { size: 9.5, gap: 1 }); t(doc, `Place  : ${f.place}`, { size: 9.5, gap: 6 }); }
  const y = doc.y + 26;
  const cell = W / labels.length;
  labels.forEach(([en, ta], i) => {
    const x = M + i * cell;
    doc.save().strokeColor(INK).lineWidth(0.5).moveTo(x + 4, y).lineTo(x + cell - 12, y).stroke().restore();
    setFont(doc, 8.5, { bold: true });
    doc.fillColor(INK).text(en, x + 4, y + 3, { width: cell - 14, align: i === labels.length - 1 ? 'right' : 'left', lineBreak: false });
    if (ta) { setFont(doc, 7.5, { tamil: true }); doc.fillColor(COLORS.muted).text(ta, x + 4, y + 14, { width: cell - 14, align: i === labels.length - 1 ? 'right' : 'left', lineBreak: false }); }
  });
  doc.y = y + 30;
}

function grid(doc: Doc, rows: string[][], widths: number[], options: { head?: string[]; size?: number; rowHeight?: number } = {}): void {
  const size = options.size ?? 8.5;
  const rowH = options.rowHeight ?? 19;
  let y = doc.y;
  const draw = (cells: string[], bold: boolean, fill?: string) => {
    if (y + rowH > doc.page.height - 60) { doc.addPage(); y = M; }
    if (fill) doc.save().fillColor(fill).rect(M, y, W, rowH).fill().restore();
    let x = M;
    cells.forEach((cellText, i) => {
      doc.save().strokeColor(INK).lineWidth(0.5).rect(x, y, widths[i] * W, rowH).stroke().restore();
      if (cellText === '✓') {
        // the Noto face has no tick glyph, so it is drawn as a path
        const cx = x + (widths[i] * W) / 2;
        doc.save().strokeColor(INK).lineWidth(1.4).moveTo(cx - 5, y + rowH / 2).lineTo(cx - 1.5, y + rowH / 2 + 4).lineTo(cx + 5.5, y + rowH / 2 - 5).stroke().restore();
      } else {
        setFont(doc, size, { bold });
        const wrapped = doc.heightOfString(cellText, { width: widths[i] * W - 6 }) > size + 2;
        doc.fillColor(INK).text(cellText, x + 3, wrapped ? y + 3 : y + (rowH - size) / 2 - 1, { width: widths[i] * W - 6, height: rowH - 4, ellipsis: true });
      }
      x += widths[i] * W;
    });
    y += rowH;
  };
  if (options.head) draw(options.head, true, '#e5e7eb');
  rows.forEach((row) => draw(row, false));
  doc.y = y + 8;
}

/* ───────────────────────────── the documents ───────────────────────────── */

function checklist(doc: Doc, f: Facts): void {
  banner(doc, f);
  fields(doc, [['EMPLOYEE NO.', s(f.e.employee_number)], ['EMPLOYEE NAME', s(f.e.name).toUpperCase()], ['DEPARTMENT / CATEGORY', `${s(f.e.department)} / ${s(f.e.designation)}`.toUpperCase()]], 160);
  doc.y += 4;
  const rows = f.checklist.map((item, i) => [String(i + 1), s(item.item_label).toUpperCase(), item.is_checked ? '✓' : '', s(item.remarks)]);
  grid(doc, rows, [0.07, 0.55, 0.12, 0.26], { head: ['S.No.', 'CHECKLIST OF PERSONAL FILE - CONTENTS', 'TICK', 'REMARKS'], rowHeight: 30 });
  t(doc, `${f.checklist.filter((c) => c.is_checked).length} of ${f.checklist.length} documents on file.`, { size: 8.5, color: COLORS.muted });
}

function appointmentOrder(doc: Doc, f: Facts): void {
  banner(doc, f);
  titleBlock(doc, 'APPOINTMENT ORDER -', 'பணி நியமன உத்தரவு');
  t(doc, `Date : ${formatDate(f.e.date_of_joining) || f.today}`, { align: 'right', gap: 6 });
  t(doc, 'To :', { bold: true, gap: 2 });
  fields(doc, [['Mr./Mrs./Ms.', s(f.e.name).toUpperCase()], ['S/o.D/o.W/o', s(f.e.father_name || f.e.spouse_name).toUpperCase()], ['Address', s(f.e.present_address).toUpperCase()]], 100);
  t(doc, `With Reference to your Application for Employment and subsequent Interview held with us, we are pleased to appoint you as ${s(f.e.designation).toUpperCase()} in ${s(f.e.department).toUpperCase()} department under the following terms and conditions, with effect from ${formatDate(f.e.date_of_joining) || f.today}.`, { size: 9.5, gap: 8 });
  const from = s(f.e.working_hours_from, '08:30').slice(0, 5);
  const to = s(f.e.working_hours_to, '17:30').slice(0, 5);
  const day = s(f.e.weekly_off, 'Sunday');
  const probation = Number(f.e.probation_months ?? 3);
  const terms: [string, string, string][] = [
    ['1. Wages', 'ஊதியம் - நாள் / மாதம் ஒன்றுக்கு கீழ்கண்டவாறு வழங்கப்படும்.', `You will be paid wages / salary as per the following structure per day / per month: Basic pay Rs ${money(f.e.basic_salary)}, DA Rs ${money(f.e.da)}, TA Rs ${money(f.e.ta)}, HRA Rs ${money(f.e.hra)}.  Total Rs ${money(Number(f.e.basic_salary) + Number(f.e.da) + Number(f.e.ta) + Number(f.e.hra))}.`],
    ['2. Working hours', 'வேலை நேரம் - நாள் ஒன்றுக்கு எட்டு மணி நேரம்.', `Working hours: 8 hours per day.  Shift timings: ${from} to ${to}.  Lunch break: ${clock(f.e.interval_lunch_time, '12:30')}.  Tea break: ${clock(f.e.tea_break, '10:30')}.`],
    ['3. Working days', 'வாரம் ஆறு நாட்கள் வேலை நாட்கள்.', 'Working days: 6 days per week.'],
    ['4. Weekly off', `வார விடுமுறை - ${DAYS_TA[day] ?? ''}`, `Weekly off: ${day}.`],
    ['5. Rest and overtime', 'நீங்கள் ஆறு நாட்கள் பணி செய்தால் ஒரு நாள் ஓய்வு எடுத்துக் கொள்ளலாம். நீங்கள் விரும்பினால் மிகை நேரம் பணி செய்யலாம். அதற்கு இரட்டிப்பு ஊதியம் வழங்கப்படும்.', 'You have the right to 1 day rest after 6 days working. Overtime is voluntary. You will be paid double wages for overtime.'],
    ['6. Probation', 'நீங்கள் பணியில் சேர்ந்த தேதியிலிருந்து தற்காலிகமாக கருதப்படுவீர்கள். உங்கள் பணித்திறன் போதுமான அளவுக்கு இல்லையெனில் தகுதிகாண் காலம் நீட்டிக்கப்படும்.', `Your appointment will be on probation / temporary for ${probation} months from the date of joining. The probation period will be extended for another ${probation} months if your performance is found not satisfactory.`],
  ];
  for (const [head, ta, en] of terms) {
    t(doc, head, { bold: true, gap: 1 });
    t(doc, en, { size: 9, gap: 1 });
    t(doc, ta, { tamil: true, size: 8, color: COLORS.muted, gap: 6 });
  }
  sign(doc, f, [['Employee signature', 'தொழிலாளர் கையொப்பம்'], ['Manager - Personnel', 'நிர்வாகம்']]);
}

function confirmationLetter(doc: Doc, f: Facts): void {
  titleBlock(doc, 'CONFIRMATION LETTER', 'பணி நிரந்தர உறுதி கடிதம்');
  t(doc, `Date : ${f.today}`, { align: 'right', gap: 6 });
  t(doc, 'To', { bold: true, gap: 2 });
  fields(doc, [['Mr./Mrs./Miss', s(f.e.name).toUpperCase(), 'பெயர்'], ['Designation', s(f.e.designation).toUpperCase(), 'பதவி'], ['Address', s(f.e.present_address).toUpperCase(), 'முகவரி']]);
  doc.y += 6;
  t(doc, 'Sir / Madam,', { gap: 6 });
  t(doc, 'Sub: Confirmation of your Service - Reg.', { bold: true, gap: 1 });
  t(doc, `Ref: Your appointment letter dated ${formatDate(f.e.date_of_joining)}`, { gap: 8 });
  t(doc, `With reference to the above subject matter, we are pleased to inform you that your employment is confirmed with effect from ${f.today}. Kindly acknowledge the receipt of this letter.`, { gap: 6 });
  t(doc, 'பார்வையில் கண்ட பொருளின்படி, தங்களது பணி நிரந்தரம் செய்யப்படுகிறது என்பதை இதன் மூலம் தெரிவிக்கிறோம். இந்த கடிதம் பெற்றுக் கொண்டதற்கு ஒப்புதல் தரும்படி கேட்டுக் கொள்கிறோம்.', { tamil: true, size: 9, gap: 10 });
  t(doc, 'Thanking you,', { gap: 14 });
  t(doc, 'Yours faithfully,', { align: 'right', gap: 30 });
  t(doc, 'Signature of the Employer [Authorized]', { align: 'right', bold: true, gap: 1 });
  t(doc, 'நிர்வாகம்', { align: 'right', tamil: true, size: 8.5 });
}

function serviceRecord(doc: Doc, f: Facts): void {
  banner(doc, f);
  titleBlock(doc, 'SERVICE RECORD');
  fields(doc, [['NAME', s(f.e.name).toUpperCase()], ['EMP NO', s(f.e.employee_number)], ['D.O.J', formatDate(f.e.date_of_joining)], ['CATEGORY', s(f.e.category || f.e.designation).toUpperCase()],
    ['DEPARTMENT', s(f.e.department).toUpperCase()], ['WAGE RATE', `Rs ${money(f.e.gross_salary)}`]], 110);
  const history = f.services.length ? f.services.map((r, i) => [String(i + 1), formatDate(r.date_from), s(r.designation), s(r.department), `Rs ${money(r.last_drawn_salary)}`, formatDate(r.date_to) || 'Present'])
    : [['1', formatDate(f.e.date_of_joining), s(f.e.designation), s(f.e.department), `Rs ${money(f.e.gross_salary)}`, 'Present']];
  grid(doc, history, [0.07, 0.17, 0.3, 0.18, 0.15, 0.13], { head: ['Sl.No', 'Date', 'Designation', 'Department', 'Wages / Salary', 'Up to'], rowHeight: 22 });
  sign(doc, f, [['Manager - Personnel'], ['Employee signature']], false);
}

function formF(doc: Doc, f: Facts): void {
  titleBlock(doc, 'THE PAYMENT OF GRATUITY (CENTRAL) RULES 1972', undefined, 'FORM F   (See Sub-Rule (1) of Rule 6)   Nomination');
  t(doc, (f.unit || f.firm).toUpperCase(), { bold: true, gap: 1 });
  t(doc, f.address, { size: 8.5, gap: 8 });
  t(doc, `1. I, Shri/Smt/Kum. ${s(f.e.name).toUpperCase()} (Name in Block Letters) whose particulars are given in the statement below, hereby nominate the person(s) mentioned below to receive the gratuity payable after my death as also the gratuity standing to my credit in the event of my death before that amount has become payable, or having become payable has not been paid, and direct that the said amount of gratuity shall be paid in proportion indicated against the name(s) of the nominee(s).`, { gap: 6 });
  t(doc, '2. I hereby certify that the person(s) mentioned is a/are member(s) of my family within the meaning of clause (h) of section (2) of the Payment of Gratuity Act, 1972.', { gap: 6 });
  t(doc, '3. I hereby declare that I have no family within the meaning of clause (h) of section (2) of the said Act.', { gap: 6 });
  t(doc, '4. (a) My father / mother / parents is / are not dependant on me.   (b) My husband’s father / mother / parents is / are not dependant on my husband.', { gap: 6 });
  t(doc, '5. I have excluded my husband from my family by a notice dated ........................ to the controlling authority in terms of the provision to clause (h) of section 2 of the said Act.', { gap: 6 });
  t(doc, '6. Nomination made herein invalidates my previous nomination.', { gap: 8 });
  const nominees = f.nominees.filter((n) => n.form_type === 'GRATUITY_FORM_F');
  grid(doc, nominees.map((n) => [s(n.nominee_name), s(n.relationship), s(n.address), formatDate(n.date_of_birth), `${Number(n.share_percentage ?? 0)}%`]).concat(nominees.length ? [] : [['', '', '', '', '']]),
    [0.26, 0.15, 0.31, 0.15, 0.13], { head: ['Name of nominee(s)', 'Relationship', 'Address of nominee', 'Date of birth', 'Share'], rowHeight: 22 });
  sign(doc, f, [['Left hand thumb impression of the employee'], ['Signature of the Employee']]);
}

function form2(doc: Doc, f: Facts): void {
  titleBlock(doc, 'Form - 2 (REVISED)', 'படிவம் - 2 (திருத்தியது)', 'NOMINATION AND DECLARATION FORM FOR UNEXEMPTED / EXEMPTED ESTABLISHMENT');
  t(doc, 'Declaration and Nomination Form under the Employees’ Provident Funds and Employees’ Pension Schemes (Paragraph 61(1) of the Employees’ Provident Fund Scheme 1952 and Paragraph 18 of the Employees’ Pension Scheme 1995)', { size: 8.5, gap: 6 });
  const e = f.e;
  grid(doc, [
    ['1) Name (in Block Letters)', s(e.name).toUpperCase()], ['2) Father / Spouse Name', s(e.father_name || e.spouse_name).toUpperCase()], ['3) Date of Birth', formatDate(e.date_of_birth)], ['4) Sex', s(e.sex)],
    ['5) Marital Status', s(e.marital_status)], ['6) Account No. and UAN', `${s(e.pf_number)}   ${s(e.uan)}`], ['7) Address - Permanent', s(e.permanent_address || e.present_address).toUpperCase()],
    ['8) Address - Temporary', s(e.present_address).toUpperCase()],
  ], [0.36, 0.64], { rowHeight: 24 });
  t(doc, 'PART - A (EPF)', { bold: true, align: 'center', gap: 2 });
  t(doc, 'I hereby nominate the person(s) / cancel the nomination made previously and nominate the person(s) mentioned below to receive the amount standing to my credit in the Employees’ Provident Fund, in the event of my death.', { size: 9, gap: 6 });
  const nominees = f.nominees.filter((n) => n.form_type === 'EPF_FORM_2');
  grid(doc, nominees.map((n) => [s(n.nominee_name), s(n.address), s(n.relationship), formatDate(n.date_of_birth), `${Number(n.share_percentage ?? 0)}%`, s(n.guardian_name)]).concat(nominees.length ? [] : [['', '', '', '', '', '']]),
    [0.22, 0.26, 0.13, 0.13, 0.1, 0.16], { head: ['Name of the nominee', 'Address', 'Relationship', 'Date of birth', 'Share', 'Guardian'], rowHeight: 22, size: 8 });
  const eps = f.nominees.filter((n) => n.form_type === 'EPS_FORM_2');
  t(doc, 'PART - B (EPS) - Particulars of family members eligible for the widow / children pension', { bold: true, gap: 2 });
  grid(doc, eps.map((n) => [s(n.nominee_name), s(n.address), s(n.relationship), formatDate(n.date_of_birth)]).concat(eps.length ? [] : [['', '', '', '']]),
    [0.3, 0.32, 0.18, 0.2], { head: ['Name', 'Address', 'Relationship', 'Date of birth'], rowHeight: 22, size: 8 });
  t(doc, '1. *Certified that I have no family as defined in para 2(g) of the Employees’ Provident Fund Scheme 1952 and should I acquire a family hereafter the above nomination should be deemed as cancelled.  2. *Certified that my father / mother is / are dependent upon me.  (*Strike out whichever is not applicable)', { size: 8.5, gap: 4 });
  t(doc, 'Note: A fresh nomination shall be made by the member on his marriage and any nomination made before such marriage shall be deemed to be invalid.', { size: 8.5, bold: true, gap: 6 });
  sign(doc, f, [['Signature or thumb impression of the subscriber', 'உறுப்பினர் கையொப்பம் / இடது கை பெருவிரல் ரேகை']]);
}

function form11(doc: Doc, f: Facts): void {
  const e = f.e;
  titleBlock(doc, 'Form No. 11 (NEW) - Declaration Form', undefined, 'Employees’ Provident Funds Scheme 1952 (Paragraph 34 & 57) and Employees’ Pension Scheme 1995 (Paragraph 24). To be retained by the employer for future reference.');
  t(doc, 'DECLARATION BY A PERSON TAKING UP EMPLOYMENT IN AN ESTABLISHMENT ON WHICH EPFS 1952 AND/OR EPS 1995 IS APPLICABLE', { size: 8, bold: true, gap: 4 });
  grid(doc, [
    ['1) Name of the member', s(e.name).toUpperCase()], ['2) Father’s / Spouse name', s(e.father_name || e.spouse_name).toUpperCase()], ['3) Date of birth', formatDate(e.date_of_birth)], ['4) Gender', s(e.sex)],
    ['5) Marital status', s(e.marital_status)], ['6) (a) Email id   (b) Mobile no.', `${s(e.email)}   ${s(e.mobile)}`], ['7) Earlier member of the Employees’ Provident Fund Scheme 1952', s(e.previous_pf_account_number) ? 'Yes' : 'No'],
    ['8) Earlier member of the Employees’ Pension Scheme 1995', s(e.pension_payment_order_number || e.scheme_certificate_number) ? 'Yes' : 'No'],
    ['9) Previous employment: (a) UAN  (b) Previous PF A/c  (c) Date of exit  (d) Scheme certificate no.  (e) PPO no.', `${s(e.uan)}   ${s(e.previous_pf_account_number)}   ${formatDate(e.previous_employer_exit_date)}   ${s(e.scheme_certificate_number)}   ${s(e.pension_payment_order_number)}`],
    ['10) International worker / country of origin / passport no. / validity', s(e.is_international_worker) === '1' ? `Yes - ${s(e.country)}  ${s(e.passport_number)}  ${formatDate(e.passport_validity)}` : 'No'],
    ['11) KYC: (a) Bank account no. and IFS code  (b) Aadhaar number  (c) PAN', `${s(e.bank_account_number)} & ${s(e.ifsc_code)}   ${s(e.aadhaar_number)}   ${s(e.pan_number)}`],
  ], [0.5, 0.5], { rowHeight: 30, size: 8 });
  t(doc, 'Undertaking', { bold: true, underline: true, gap: 2 });
  t(doc, '1) Certified that the particulars are true to the best of my knowledge.  2) I authorize EPFO to use my Aadhaar for authentication / eKYC purpose for service delivery.  3) Kindly transfer the funds and service details, if applicable, from the previous PF account as declared above to the present PF account (the transfer would be possible only if the identified KYC details approved by the previous employer have been verified by the present employer using his Digital Signature Certificate).  4) In case of changes in the above details, the same will be intimated to the employer at the earliest.', { size: 8.5, gap: 4 });
  t(doc, `Date: ${f.today}     Place: ${f.place}                                                                         Signature of Member`, { size: 8.5, gap: 8 });
  t(doc, 'DECLARATION BY PRESENT EMPLOYER', { bold: true, align: 'center', gap: 3 });
  t(doc, `A.  The member Mr./Mrs. ${s(e.name).toUpperCase()} has joined on ${formatDate(e.date_of_joining)} and has been allotted PF Number ${s(e.pf_number, '..................')}.`, { size: 8.5, gap: 3 });
  t(doc, 'B.  In case the person was earlier not a member of EPF Scheme 1952 and EPS 1995: (post allotment of UAN) the UAN allotted for the member is ................. Please tick the appropriate option: the KYC details of the above member in the eUAN database  [  ] have not been uploaded   [  ] have been uploaded but not approved   [  ] have been uploaded but approved with DSC.', { size: 8.5, gap: 3 });
  t(doc, 'C.  In case the person was earlier a member of EPF Scheme 1952 and EPS 1995: the above PF account number / UAN of the member as mentioned in (A) above has been tagged with his / her UAN / previous member ID as declared by member.  Please tick the appropriate option: [  ] the details of the above member in the UAN database have been approved with Digital Signature Certificate and transfer request has been generated on portal   [  ] as the DSC of establishment are not registered with EPFO, the member has been informed to file a physical claim (Form 13) for transfer of funds from his previous establishment.', { size: 8.5, gap: 6 });
  t(doc, `Date: ${f.today}                                                                                     Signature of employer with seal of establishment`, { size: 8.5 });
}

function bankLetter(doc: Doc, f: Facts): void {
  const e = f.e;
  titleBlock(doc, 'Letter of acceptance to receive wages through Bank', 'தொழிலாளர் ஊதியத்தை வங்கி கணக்கில் பெற்றுக் கொள்வதற்கான ஒப்புதல் படிவம்');
  t(doc, 'From :', { bold: true, gap: 2 });
  fields(doc, [['Name', s(e.name).toUpperCase(), 'பெயர்'], ['Emp.No.', s(e.employee_number), 'எண்'], ['Address', s(e.present_address).toUpperCase(), 'முகவரி']], 90);
  t(doc, 'To :', { bold: true, gap: 2 });
  t(doc, `Manager Personnel,\n${(f.unit || f.firm).toUpperCase()}\n${f.address}`, { gap: 8 });
  t(doc, 'Sir,', { gap: 4 });
  t(doc, 'நான் இந்நிறுவனத்தில் பணிபுரிந்து வருகிறேன். எனக்குரிய ஊதியத்தை எனது வங்கிக் கணக்கு மூலமாக வழங்குமாறு கேட்டுக் கொள்கிறேன்.', { tamil: true, size: 9, gap: 6 });
  t(doc, `I, ${s(e.name).toUpperCase()}, ${s(f.unit || f.firm).toUpperCase()}, Emp.No: ${s(e.employee_number)}, hereby agree to receive my wages from the Company in my S.B. / Salary A/C No.: ${s(e.bank_account_number)} held with ${s(e.bank_name).toUpperCase()}${e.ifsc_code ? ` (IFSC ${s(e.ifsc_code)})` : ''}.`, { gap: 14 });
  t(doc, 'Yours faithfully,', { align: 'right', gap: 24 });
  t(doc, `Name : ${s(e.name).toUpperCase()}`, { align: 'right', bold: true, gap: 1 });
  t(doc, `Emp.No. : ${s(e.employee_number)}`, { align: 'right', bold: true, gap: 8 });
  t(doc, `Date : ${f.today}`, { gap: 1 });
  t(doc, `Place : ${f.place}`, { gap: 1 });
}

function wageRevision(doc: Doc, f: Facts): void {
  const e = f.e;
  const wage = money(e.gross_salary);
  for (let copy = 0; copy < 2; copy += 1) {
    titleBlock(doc, 'SALARY & WAGES REVISION LETTER');
    fields(doc, [['Name', s(e.name).toUpperCase()], ['Department', s(e.department).toUpperCase()], ['Designation', s(e.designation).toUpperCase()], ['Existing Salary / Wages', `Rs. ${wage}  per day / Month`],
      ['Revised Salary / Wages', 'Rs. ____________  per day / Month'], ['With Effect from', '____________']], 150);
    doc.y += 14;
    const y = doc.y + 24;
    ['Manager - I.E.', 'Manager - Production', 'Manager - Personnel'].forEach((label, i) => {
      const x = M + i * (W / 3);
      doc.save().strokeColor(INK).lineWidth(0.5).moveTo(x, y).lineTo(x + W / 3 - 16, y).stroke().restore();
      setFont(doc, 8.5, { bold: true }); doc.fillColor(INK).text(label, x, y + 3, { lineBreak: false });
    });
    doc.y = y + 34;
    t(doc, 'Employee’s Signature', { bold: true, size: 8.5, gap: 14 });
    if (copy === 0) { doc.save().strokeColor(COLORS.muted).dash(3, { space: 3 }).moveTo(M, doc.y).lineTo(M + W, doc.y).stroke().undash().restore(); doc.y += 12; }
  }
}

const AFFIRMATIVE = [
  'நான் இந்நிறுவனத்தில் எனது விருப்பத்துடனேயே பணிபுரிகிறேன்.',
  'நான் என்னுடைய சக தொழிலாளர்களையோ எனக்குக் கீழ் பணிபுரிபவர்களையோ கட்டாயப்படுத்தியோ / வற்புறுத்தியோ பணிபுரியத் தூண்ட மாட்டேன்.',
  'நான் என்னுடைய சக தொழிலாளர்களையோ எனக்குக் கீழ் பணிபுரிபவர்களையோ பலவந்தமாக மிரட்டுதல், துன்புறுத்தல், தவறான மன உளைச்சல்களை ஏற்படுத்தக்கூடிய சொற்களைப் பயன்படுத்துதல் போன்ற நடவடிக்கைகளில் ஈடுபட மாட்டேன்.',
  'நான் என்னுடைய சக தொழிலாளர்களிடமோ எனக்குக் கீழ் பணிபுரிபவர்களிடமோ இனம் / மதம் / மொழி / பால் போன்ற வேறுபாடுகளைக் காட்ட மாட்டேன்.',
  'நான் என்னுடைய சக தொழிலாளர்களோ எனக்குக் கீழ் பணிபுரிபவர்களோ சட்டரீதியான வகையில் சங்கம் அமைத்துக் கொள்ளுதல், கூட்டாகப் பேரம் பேசுதல் போன்ற நடவடிக்கைகளில் ஈடுபடும்போது எவ்வித இடையூறும் ஏற்படுத்த மாட்டேன்.',
  'நான் எக்காரணத்தைக் கொண்டும் போதை மற்றும் வெடிக்கும் தன்மையுடைய பொருட்களைக் கடத்துதல் போன்ற சட்ட விரோதச் செயல்களில் ஈடுபடமாட்டேன்.',
  'நான் இந்நிறுவனத்தில் பணிக்குச் சேரும் முன்னர் எவ்விதமான சட்ட விரோதச் செயல்களில், விருப்பத்தின் பேரிலோ அல்லது கட்டாயத்தின் பேரிலோ ஈடுபட்டதில்லை. என் மீது காவல் நிலையத்திலோ அல்லது நீதிமன்றத்திலோ எவ்வித குற்ற வழக்குகளும் நிலுவையில் இல்லை.',
];

function affirmative(doc: Doc, f: Facts): void {
  t(doc, 'உறுதிமொழி', { tamil: true, bold: true, size: 12, align: 'center', gap: 0 });
  t(doc, '(Affirmative Statement)', { bold: true, size: 11, align: 'center', gap: 10 });
  fields(doc, [['Employee', `${s(f.e.name).toUpperCase()}   (${s(f.e.employee_number)})`]], 80);
  doc.y += 4;
  AFFIRMATIVE.forEach((line, i) => {
    const y = doc.y;
    t(doc, `${i + 1}.`, { bold: true, width: 20, gap: 0 });
    doc.y = y;
    t(doc, line, { tamil: true, size: 10, x: M + 22, width: W - 22, gap: 9 });
  });
  doc.y += 4;
  t(doc, 'Note:', { bold: true, gap: 1 });
  t(doc, 'I understand and accept the rules & regulations of the company as stated above, which is translated to me in ____________ by Mr. ______________________ (Translator).', { bold: true, size: 9, gap: 8 });
  t(doc, 'Translator’s Name : ________________________________      Signature : ______________', { size: 9, gap: 24 });
  sign(doc, f, [['Signature of the Employee', 'தொழிலாளர் கையொப்பம்']], false);
}

const BUILDERS: Record<EmployeeDocumentType, (doc: Doc, f: Facts) => void> = {
  checklist, 'appointment-order': appointmentOrder, 'confirmation-letter': confirmationLetter, 'service-record': serviceRecord, 'form-f': formF, 'form-2': form2, 'form-11': form11,
  'bank-letter': bankLetter, 'wage-revision': wageRevision, 'affirmative-statement': affirmative,
};

export async function generateEmployeeDocument(employeeId: number, type: EmployeeDocumentType, context: Ctx): Promise<Buffer | null> {
  const e = await queryOne<RowDataPacket>(
    `SELECT emp.*, em.company_name, em.address_line_1, em.address_line_2, em.city, em.state, em.pincode, cu.unit_name
       FROM employees emp JOIN employers em ON em.id = emp.employer_id LEFT JOIN company_units cu ON cu.id = emp.unit_id
      WHERE emp.id = ? AND emp.deleted_at IS NULL`, [employeeId]);
  if (!e) return null;
  const [nominees, services, checklistRows, branding] = await Promise.all([
    query<RowDataPacket>('SELECT * FROM employee_nominees WHERE employee_id = ? AND deleted_at IS NULL ORDER BY id', [employeeId]),
    query<RowDataPacket>('SELECT * FROM employee_service_records WHERE employee_id = ? AND deleted_at IS NULL ORDER BY date_from', [employeeId]),
    query<RowDataPacket>(
      `SELECT i.item_label, i.sort_order, COALESCE(c.is_checked, 0) AS is_checked, c.remarks FROM personal_file_checklist_items i
         LEFT JOIN employee_file_checklist c ON c.item_id = i.id AND c.employee_id = ? ORDER BY i.sort_order`, [employeeId]),
    companyBranding(),
  ]);
  const address = [e.address_line_1, e.address_line_2, [e.city, e.pincode].filter(Boolean).join(' - ')].filter(Boolean).join(', ');
  const today = formatDate(context.generatedAt ?? new Date());
  const facts: Facts = { e, firm: s(e.company_name), unit: s(e.unit_name), address, logo: branding.logo, nominees, services, checklist: checklistRows, place: s(e.city, 'Tiruppur'), today };
  const label = EMPLOYEE_DOCUMENTS.find((d) => d.type === type)?.label ?? type;
  const doc = createPdf({ title: `${label} - ${s(e.name)}`, subject: s(e.employee_number), author: s(e.company_name) });
  BUILDERS[type](doc, facts);
  return renderPdf(doc);
}
