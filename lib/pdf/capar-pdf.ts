/**
 * CAPAR PDF: the Corrective Action and Preventive Action Report in the layout third-party auditors use.
 *
 *   1. letterhead (the report's own letterhead image, or logo + firm) and the title
 *   2. a bordered header: facility, audit date, address, representative, auditor, firm
 *   3. a summary of every category: "No Violation" or the number of violations
 *   4. the findings, category by category: Act / Rule, minimum requirement, what was found, the local law clause,
 *      the non-compliance photo, then root cause, action plan, timeline and evidence
 *   5. the closing-meeting statement and the auditor / facility signatures
 *
 * An approved report prints only the findings the verifier found Eligible. Any other status prints everything, tagged with
 * its verification state and a banner saying the report is not final.
 */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { companyBranding, drawLetterhead, fileIdFromUrl, loadImage } from '@/lib/pdf/branding';
import { BORDER, categoryBar, headerGrid, labelled, textHeight } from '@/lib/pdf/blocks';
import { formatDate } from '@/lib/utils/dates';
import { checklistGroups, reportGroupIds } from '@/services/capar-checklist.service';
import {
  COLORS, CONTENT_WIDTH, MARGIN, createPdf, ensureSpace, renderPdf, setFont, spacer, stampFooters, table, type Doc,
} from '@/lib/pdf/base';

export interface CaparPdfFile { file_id: number; kind: string; caption: string | null; original_name: string }
export interface CaparPdfFinding extends Record<string, unknown> {
  id: number; category_id: number | null; category_name: string | null; outcome: string; act_rule: string | null;
  minimum_requirement: string | null; local_law: string | null; finding: string | null; root_cause: string | null;
  action_plan: string | null; timeline_date: string | null; timeline_note: string | null; action_status: string;
  closed_on: string | null; verification_status: string; verification_remark: string | null; files: CaparPdfFile[];
  evidence_item_name?: string | null; evidence_item_id?: number | null; evidence_section_id?: number | null; evidence_section_name?: string | null; evidence_group_id?: number | null; evidence_group_name?: string | null;
  response_status?: string; response_text?: string | null; response_review_note?: string | null; response_reviewed_by?: string | null;
  employer_signature_kind?: string | null; employer_signature_data?: string | null; employer_signed_by?: string | null; employer_signed_at?: string | null;
  item_status?: string; compliance_note?: string | null; recommendation?: string | null; assessment?: string | null; signed_by?: string | null; signed_at?: string | null;
}

async function drawFinding(doc: Doc, number: number, finding: CaparPdfFinding, images: Map<number, Buffer>, final: boolean) {
  const x = MARGIN + 8;
  const width = CONTENT_WIDTH - 16;
  const violation = finding.outcome === 'Violation';

  // keep the title together with the start of the body
  const title = `${number}.  ${finding.evidence_item_name ? `${finding.evidence_item_name}${finding.act_rule ? ` - ${finding.act_rule}` : ''}` : finding.act_rule || 'Act / Rule not stated'}`;
  const titleHeight = textHeight(doc, title, 9.5, width - 80, true);
  ensureSpace(doc, titleHeight + 48);
  const top = doc.y;
  setFont(doc, 9.5, { bold: true });
  doc.fillColor(COLORS.ink).text(title, x, top, { width: width - 80 });
  setFont(doc, 8, { bold: true });
  doc.fillColor(violation ? COLORS.danger : COLORS.success).text(violation ? 'VIOLATION' : 'NO VIOLATION', x + width - 76, top + 1, { width: 76, align: 'right', lineBreak: false });
  doc.y = top + titleHeight + 5;

  if (finding.minimum_requirement) labelled(doc, 'Minimum requirement', finding.minimum_requirement, x, width);
  if (finding.finding) labelled(doc, violation ? 'Finding' : 'Remarks', finding.finding, x, width);
  if (finding.local_law) labelled(doc, 'Local law', finding.local_law, x, width);

  const photos = finding.files.filter((file) => file.kind === 'Photo' && images.has(file.file_id));
  if (photos.length) {
    ensureSpace(doc, 112);
    const y = doc.y;
    setFont(doc, 7.5, { bold: true });
    doc.fillColor(COLORS.muted).text('NON-COMPLIANCE PHOTO', x, y, { width });
    let px = x;
    for (const photo of photos.slice(0, 4)) {
      try {
        doc.save().lineWidth(0.6).strokeColor(BORDER).rect(px, y + 11, 124, 84).stroke().restore();
        doc.image(images.get(photo.file_id) as Buffer, px + 2, y + 13, { fit: [120, 80], align: 'center', valign: 'center' });
        px += 132;
      } catch {
        /* an image pdfkit cannot decode is simply left out */
      }
    }
    doc.y = y + 102;
  }

  if (violation && (finding.root_cause || finding.action_plan || finding.timeline_date || finding.timeline_note)) {
    const colWidths = [width * 0.38, width * 0.38, width * 0.24];
    const timeline = [
      finding.timeline_date ? formatDate(finding.timeline_date) : 'Not set',
      finding.timeline_note,
      finding.action_status === 'Closed' && finding.closed_on ? `Closed ${formatDate(finding.closed_on)}` : finding.action_status,
    ].filter(Boolean).join('\n');
    const columns = [
      { label: 'Root cause', text: finding.root_cause || '-' },
      { label: 'Action plan', text: finding.action_plan || '-' },
      { label: 'Timeline', text: timeline },
    ];
    const height = Math.max(...columns.map((column, index) => textHeight(doc, column.text, 9, colWidths[index] - 12))) + 22;
    ensureSpace(doc, height + 4);
    const y = doc.y;
    let cx = x;
    columns.forEach((column, index) => {
      doc.save().lineWidth(0.6).strokeColor(BORDER).rect(cx, y, colWidths[index], height).stroke().restore();
      setFont(doc, 7.5, { bold: true });
      doc.fillColor(COLORS.muted).text(column.label.toUpperCase(), cx + 6, y + 5, { width: colWidths[index] - 12 });
      setFont(doc, 9);
      doc.fillColor(COLORS.body).text(column.text, cx + 6, y + 16, { width: colWidths[index] - 12 });
      cx += colWidths[index];
    });
    doc.y = y + height + 4;
  }

  if (finding.compliance_note) labelled(doc, 'Compliance', finding.compliance_note, x, width);
  const evidence = finding.files.filter((file) => file.kind === 'Evidence');
  if (evidence.length) labelled(doc, 'Compliance evidence attached', evidence.map((file) => file.original_name).join(', '), x, width);
  if (finding.recommendation) labelled(doc, 'Recommendations', finding.recommendation, x, width);
  if (finding.assessment) labelled(doc, 'Verification / Assessment', finding.assessment, x, width);
  if (finding.response_text) labelled(doc, 'Employer response', `${finding.response_text}${finding.employer_signed_by ? `\n(Signed by ${finding.employer_signed_by}${finding.employer_signed_at ? ` on ${formatDate(String(finding.employer_signed_at))}` : ''})` : ''}`, x, width);
  if (violation && finding.response_status && finding.response_status !== 'Pending') {
    labelled(doc, 'Status', `${finding.response_status}${finding.response_reviewed_by ? ` (reviewed by ${finding.response_reviewed_by})` : ''}${finding.response_review_note ? `: ${finding.response_review_note}` : ''}`, x, width);
  }
  if (finding.signed_by) {
    ensureSpace(doc, 14);
    setFont(doc, 8);
    doc.fillColor(COLORS.muted).text(`Signed off by ${finding.signed_by}${finding.signed_at ? ` on ${formatDate(String(finding.signed_at))}` : ''}`, x, doc.y, { width });
    doc.y += 4;
  }

  // separator before the next finding
  doc.save().lineWidth(0.4).strokeColor(COLORS.line).moveTo(MARGIN, doc.y + 2).lineTo(MARGIN + CONTENT_WIDTH, doc.y + 2).stroke().restore();
  doc.y += 8;
}

/** A checklist document with nothing to report: one line, its number, its name and its state. */
function drawDocumentLine(doc: Doc, number: number, name: string, label: string, color: string) {
  const x = MARGIN + 8;
  const width = CONTENT_WIDTH - 16;
  const text = `${number}.  ${name}`;
  const height = textHeight(doc, text, 9, width - 100);
  ensureSpace(doc, height + 8);
  const top = doc.y;
  setFont(doc, 9);
  doc.fillColor(COLORS.body).text(text, x, top, { width: width - 100 });
  setFont(doc, 7.5, { bold: true });
  doc.fillColor(color).text(label, x + width - 96, top + 1, { width: 96, align: 'right', lineBreak: false });
  doc.y = top + height + 3;
  doc.save().lineWidth(0.3).strokeColor(COLORS.line).moveTo(MARGIN, doc.y).lineTo(MARGIN + CONTENT_WIDTH, doc.y).stroke().restore();
  doc.y += 4;
}

export interface CaparChecklistPdfSection { id: number; name: string; items: { id: number; name: string }[] }

export interface CaparPdfInput {
  report: Record<string, unknown>;
  findings: CaparPdfFinding[];
  categories: { id: number; name: string }[];
  /** Every document of the sections the auditor was given, so the report lists the ones not checked as well. */
  checklist?: CaparChecklistPdfSection[];
}

export async function generateCaparPdf(input: CaparPdfInput): Promise<Buffer> {
  const { report, categories } = input;
  const final = report.status === 'Approved';
  // An approved report prints what the verifier accepted; anything earlier prints every row, tagged.
  const findings = input.findings;

  const branding = await companyBranding(report.logo_file_id ? Number(report.logo_file_id) : null);
  // The report's own letterhead wins; otherwise the one saved in Company Settings, if any.
  const letterheadImage = (await loadImage(report.letterhead_file_id ? Number(report.letterhead_file_id) : null)) ?? branding.letterhead;
  const drawn = report.signature_kind === 'drawn' && report.signature_data ? Buffer.from(String(report.signature_data).replace(/^data:image\/\w+;base64,/, ''), 'base64') : null;
  const signature = drawn ?? (report.auditor_signature_path ? await loadImage(fileIdFromUrl(String(report.auditor_signature_path))) : null);
  const typedSignature = report.signature_kind === 'typed' && report.signature_data ? String(report.signature_data).slice(0, 80) : null;
  // The employer signs each answer; the report carries the latest of those signatures for the facility.
  const signedRows = input.findings.filter((finding) => finding.employer_signature_data && finding.employer_signature_kind);
  const employerSign = signedRows.length ? signedRows[signedRows.length - 1] : null;
  const employerDrawn = employerSign?.employer_signature_kind === 'drawn' ? Buffer.from(String(employerSign.employer_signature_data).replace(/^data:image\/\w+;base64,/, ''), 'base64') : null;
  const employerTyped = employerSign?.employer_signature_kind === 'typed' ? String(employerSign.employer_signature_data).slice(0, 80) : null;

  const images = new Map<number, Buffer>();
  for (const finding of findings) {
    for (const file of finding.files.filter((item) => item.kind === 'Photo').slice(0, 4)) {
      const bytes = await loadImage(file.file_id);
      if (bytes) images.set(file.file_id, bytes);
    }
  }

  const doc = createPdf({
    title: `CAPAR - ${String(report.report_number)}`,
    subject: String(report.title ?? 'Corrective Action and Preventive Action Report'),
    author: String(report.audit_firm || branding.name || 'ComplianceOS'),
  });

  /* ── 1. letterhead and title ── */
  drawLetterhead(doc, { firm: String(report.audit_firm || branding.name || ''), address: branding.address, logo: branding.logo, letterhead: letterheadImage });

  setFont(doc, 14, { bold: true });
  doc.fillColor(COLORS.ink).text('CORRECTIVE ACTION AND PREVENTIVE ACTION REPORT (CAPAR)', MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' });
  doc.y += 4;
  setFont(doc, 8.5);
  doc.fillColor(COLORS.muted).text(
    `${String(report.report_number)}${report.standard_reference ? `  |  ${String(report.standard_reference)}` : ''}${final ? '  |  CLOSED' : `  |  ${({ Draft: 'DRAFT', Submitted: 'PENDING WITH THE EMPLOYER', 'Under Review': 'EMPLOYER HAS ANSWERED', Returned: 'RETURNED' } as Record<string, string>)[String(report.status)] ?? String(report.status).toUpperCase()}`}`,
    MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' }
  );
  doc.y += 12;

  /* ── 2. header ── */
  headerGrid(doc, [
    { label: 'Facility', value: String(report.facility_name ?? '') },
    { label: 'Audit date', value: report.audit_date ? formatDate(String(report.audit_date)) : '-' },
    { label: 'Facility address', value: String(report.facility_address ?? '') },
    { label: 'Facility representative / title', value: [report.representative_name, report.representative_title].filter(Boolean).join(' - ') || '-' },
    { label: 'Auditor', value: String(report.auditor_print_name || report.auditor_name || '') },
    { label: 'Firm', value: String(report.audit_firm || branding.name || '') },
    ...(report.audit_type_name ? [{ label: 'Audit / assessment', value: String(report.audit_type_name) }, { label: 'Buyer standards', value: String(report.buyer_standards || '-') }] : []),
    ...(report.audit_purpose ? [{ label: 'Purpose of the audit', value: String(report.audit_purpose) }, { label: 'Categories reported', value: [...(input.checklist ?? []).map((group) => group.name), ...(report.others_selected ? [`Others${report.others_note ? `: ${report.others_note}` : ''}`] : [])].join(', ') || '-' }] : []),
  ]);

  /* ── 3. summary by category ── */
  const known = new Map(categories.map((category) => [category.id, category.name]));
  findings.forEach((finding) => { if (finding.category_id && !known.has(finding.category_id)) known.set(finding.category_id, finding.category_name ?? 'Other'); });
  // Rows taken from the document checklist are printed under their checklist section (below); the rest under the category they were filed in.
  const checklist = input.checklist ?? [];
  const filed = findings.filter((finding) => !finding.evidence_item_id);
  const byCategory = [...known.entries()].map(([id, name]) => ({
    id, name, rows: filed.filter((finding) => finding.category_id === id),
  }));
  const loose = filed.filter((finding) => !finding.category_id);
  if (loose.length) byCategory.push({ id: 0, name: 'Not categorised', rows: loose });

  const itemRow = (itemId: number) => findings.find((finding) => Number(finding.evidence_item_id) === itemId);
  const isNoIssue = (finding: CaparPdfFinding | undefined) => Boolean(finding) && (finding!.item_status === 'Not findings' || finding!.outcome === 'No Violation');
  const checklistSummary = checklist.map((section) => {
    const rows = section.items.map((item) => itemRow(item.id));
    const noIssue = rows.filter((row) => isNoIssue(row)).length;
    const issues = rows.filter((row) => row && !isNoIssue(row)).length;
    const unchecked = rows.length - noIssue - issues;
    return {
      category: section.name.toUpperCase(),
      result: `${rows.length} documents: ${noIssue} no issue, ${issues} issue${issues === 1 ? '' : 's'}, ${unchecked} not checked`,
    };
  });
  // Free-typed categories are summarised only when they hold something once the checklist is in use.
  const summaryRows = [
    ...checklistSummary,
    ...byCategory
      .filter((group) => group.rows.length > 0 || (!checklist.length && categories.some((category) => category.id === group.id)))
      .map((group) => {
        const violations = group.rows.filter((row) => row.outcome === 'Violation').length;
        return { category: group.name.toUpperCase(), result: violations === 0 ? 'No Violation' : `${violations} violation${violations === 1 ? '' : 's'} - details below` };
      }),
  ];
  table(doc, {
    columns: [
      { key: 'category', label: 'Section', width: 0.44 },
      { key: 'result', label: 'Result', width: 0.56 },
    ],
    rows: summaryRows,
    empty: 'No findings were recorded.',
    maxRows: 80,
  });
  spacer(doc, 8);

  /* ── 4. the documents, section by section, then the rows filed under a category ── */
  for (const section of checklist) {
    const checkedCount = section.items.filter((item) => itemRow(item.id)).length;
    categoryBar(doc, section.name, `${checkedCount} of ${section.items.length} checked`);
    let number = 0;
    for (const item of section.items) {
      number += 1;
      const finding = itemRow(item.id);
      const hasDetail = finding && (finding.finding || finding.recommendation || finding.assessment || finding.files.length);
      if (!finding) drawDocumentLine(doc, number, item.name, 'NOT CHECKED', COLORS.muted);
      else if (isNoIssue(finding) && !hasDetail) drawDocumentLine(doc, number, item.name, 'NO ISSUE', COLORS.success);
      else await drawFinding(doc, number, finding, images, final);
    }
    doc.y += 6;
  }
  for (const group of byCategory) {
    if (!group.rows.length) continue;
    const violations = group.rows.filter((row) => row.outcome === 'Violation').length;
    categoryBar(doc, group.name, violations ? `${violations} violation${violations === 1 ? '' : 's'}` : 'No Violation');
    let number = 0;
    for (const finding of group.rows) {
      number += 1;
      await drawFinding(doc, number, finding, images, final);
    }
  }

  /* ── 5. closing and signatures ── */
  ensureSpace(doc, 150);
  doc.y += 6;
  const closing = String(report.closing_statement || 'A closing meeting has been performed, and the above findings were discussed and were agreed.');
  setFont(doc, 9.5);
  doc.fillColor(COLORS.body).text(closing, MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.y += 18;

  const half = CONTENT_WIDTH / 2;
  const y = doc.y;
  const closingDate = report.closing_meeting_date ? formatDate(String(report.closing_meeting_date)) : '-';
  const facilityDate = report.facility_signed_date ? formatDate(String(report.facility_signed_date)) : closingDate;
  if (signature) {
    try { doc.image(signature, MARGIN + 8, y - 4, { fit: [120, 34] }); } catch { /* unsigned */ }
  } else if (typedSignature) {
    doc.save().font('Helvetica-Oblique').fontSize(18).fillColor(COLORS.ink).text(typedSignature, MARGIN + 8, y + 8, { width: half - 32, lineBreak: false }).restore();
  }
  if (employerDrawn) {
    try { doc.image(employerDrawn, MARGIN + half + 8, y - 4, { fit: [120, 34] }); } catch { /* unsigned */ }
  } else if (employerTyped) {
    doc.save().font('Helvetica-Oblique').fontSize(18).fillColor(COLORS.ink).text(employerTyped, MARGIN + half + 8, y + 8, { width: half - 32, lineBreak: false }).restore();
  }
  [
    { x: MARGIN, role: 'Auditor', name: String(report.auditor_print_name || report.auditor_name || ''), date: closingDate },
    { x: MARGIN + half, role: 'Facility representative', name: String(employerSign?.employer_signed_by || report.facility_signatory || report.representative_name || ''), date: employerSign?.employer_signed_at ? formatDate(String(employerSign.employer_signed_at)) : facilityDate },
  ].forEach((block) => {
    doc.save().strokeColor(COLORS.muted).lineWidth(0.6).moveTo(block.x + 8, y + 34).lineTo(block.x + half - 24, y + 34).stroke().restore();
    setFont(doc, 8, { bold: true });
    doc.fillColor(COLORS.muted).text(`Signature - ${block.role}`, block.x + 8, y + 38, { width: half - 32 });
    setFont(doc, 9);
    doc.fillColor(COLORS.ink).text(`Print name: ${block.name || '-'}`, block.x + 8, y + 50, { width: half - 32 });
    doc.text(`Date: ${block.date}`, block.x + 8, y + 62, { width: half - 32 });
  });
  doc.y = y + 80;

  stampFooters(doc, ({ index, total }) => ({
    left: String(report.report_number),
    center: String(report.employer_name ?? report.facility_name ?? '').slice(0, 34),
    right: `Page ${index} of ${total}`,
  }));
  return renderPdf(doc);
}

/** Reads the report, its findings and their files for the PDF: only the categories ticked for the report are included. */
export async function loadCaparPdfInput(reportId: number): Promise<CaparPdfInput | null> {
  const report = await queryOne<RowDataPacket>(
    `SELECT r.*, e.company_name AS employer_name, a.name AS auditor_name, a.signature_path AS auditor_signature_path, atp.name AS audit_type_name
       FROM capar_reports r
       JOIN employers e ON e.id = r.employer_id
       JOIN auditors a ON a.id = r.auditor_id
       LEFT JOIN audit_types atp ON atp.id = r.audit_type_id
      WHERE r.id = ? AND r.deleted_at IS NULL`,
    [reportId]
  );
  if (!report) return null;
  const all = await query<RowDataPacket>(
    `SELECT f.*, c.name AS category_name, ei.name AS evidence_item_name, ei.section_id AS evidence_section_id, es.name AS evidence_section_name,
            eg.id AS evidence_group_id, eg.name AS evidence_group_name
       FROM capar_findings f
       LEFT JOIN capar_categories c ON c.id = f.category_id
       LEFT JOIN evidence_items ei ON ei.id = f.evidence_item_id
       LEFT JOIN evidence_sections es ON es.id = ei.section_id
       LEFT JOIN capar_groups eg ON eg.id = COALESCE(ei.capar_group_id, (SELECT g0.id FROM capar_groups g0 WHERE g0.status = 'active' ORDER BY g0.sort_order, g0.id LIMIT 1))
      WHERE f.report_id = ? AND f.deleted_at IS NULL
      ORDER BY COALESCE(eg.sort_order, 999998), COALESCE(c.sort_order, 999999), f.category_id, ei.sort_order, f.sort_order, f.id`,
    [reportId]
  );
  // The categories ticked for this report, each with its documents. Findings under other categories are not reported; free-typed rows always are.
  const picked = new Set(await reportGroupIds(reportId));
  const checklist = (await checklistGroups()).filter((group) => picked.has(group.id));
  const findings = all.filter((finding) => (finding.evidence_item_id ? picked.has(Number(finding.evidence_group_id)) : Boolean(report.others_selected)));
  const ids = findings.map((finding) => Number(finding.id));
  const files = ids.length
    ? await query<RowDataPacket>(
        `SELECT ff.finding_id, ff.file_id, ff.kind, ff.caption, f.original_name
           FROM capar_finding_files ff JOIN files f ON f.id = ff.file_id AND f.deleted_at IS NULL
          WHERE ff.finding_id IN (${ids.map(() => '?').join(', ')}) ORDER BY ff.sort_order, ff.id`,
        ids
      )
    : [];
  const categories = await query<RowDataPacket>('SELECT id, name FROM capar_categories WHERE deleted_at IS NULL AND status = \'active\' ORDER BY sort_order, name');
  return {
    report,
    checklist,
    categories: categories.map((category) => ({ id: Number(category.id), name: String(category.name) })),
    findings: findings.map((finding) => ({
      ...finding,
      files: files.filter((file) => Number(file.finding_id) === Number(finding.id)).map((file) => ({
        file_id: Number(file.file_id), kind: String(file.kind), caption: file.caption ? String(file.caption) : null, original_name: String(file.original_name),
      })),
    })) as CaparPdfFinding[],
  };
}
