/**
 * The employer's submitted pre-audit document pack as a PDF: who submitted it and when, a summary, then every checklist section as a table
 * (document, status, reference, valid until, files, notes). An auditor receives only the sections the administrator gave them.
 */
import { companyBranding } from '@/lib/pdf/branding';
import { COLORS, CONTENT_WIDTH, MARGIN, createPdf, ensureSpace, renderPdf, sectionHeading, setFont, spacer, stampFooters, table } from '@/lib/pdf/base';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import type { Snapshot } from '@/services/evidence.service';

export interface EvidencePackPdfInput {
  submission: { id: number; company_name: string; employer_code: string | null; submitted_at: string; submitted_by_name: string | null; note: string | null };
  sections: Snapshot['sections'];
  preparedFor: string;
}

export async function generateEvidencePackPdf(input: EvidencePackPdfInput): Promise<Buffer> {
  const { submission, sections } = input;
  const branding = await companyBranding(null);
  const doc = createPdf({ title: `Document pack - ${submission.company_name}`, subject: 'Pre-audit document pack', author: branding.name || 'ComplianceOS' });

  setFont(doc, 15, { bold: true });
  doc.fillColor(COLORS.ink).text('PRE-AUDIT DOCUMENT PACK', MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' });
  doc.y += 4;
  setFont(doc, 9);
  doc.fillColor(COLORS.muted).text(`${submission.company_name}${submission.employer_code ? `  |  ${submission.employer_code}` : ''}`, MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' });
  doc.y += 14;

  const items = sections.flatMap((s) => s.items);
  const provided = items.filter((i) => i.status === 'Provided').length;
  const na = items.filter((i) => i.status === 'Not applicable').length;
  const pending = items.length - provided - na;

  const boxY = doc.y;
  const boxH = 50;
  doc.save().lineWidth(0.7).strokeColor(COLORS.line).roundedRect(MARGIN, boxY, CONTENT_WIDTH, boxH, 4).stroke().restore();
  const cell = CONTENT_WIDTH / 4;
  const facts: [string, string][] = [
    ['Submitted on', formatDateTime(submission.submitted_at)],
    ['Submitted by', submission.submitted_by_name ?? '-'],
    ['Documents', `${provided} provided, ${na} not applicable`],
    ['Still pending', String(pending)],
  ];
  facts.forEach(([label, value], index) => {
    const x = MARGIN + index * cell + 8;
    setFont(doc, 7.5, { bold: true });
    doc.fillColor(COLORS.muted).text(label.toUpperCase(), x, boxY + 9, { width: cell - 14, lineBreak: false });
    setFont(doc, 9, { bold: true });
    doc.fillColor(COLORS.ink).text(value, x, boxY + 22, { width: cell - 14 });
  });
  doc.y = boxY + boxH + 8;
  if (submission.note) {
    setFont(doc, 8.5);
    doc.fillColor(COLORS.body).text(`Note from the employer: ${submission.note}`, MARGIN, doc.y, { width: CONTENT_WIDTH });
    doc.y += 6;
  }
  setFont(doc, 8);
  doc.fillColor(COLORS.muted).text(`Prepared for ${input.preparedFor}. Submission #${submission.id}. The documents themselves are open from the Audit documents screen.`, MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.y += 10;

  for (const section of sections) {
    if (!section.items.length) continue;
    ensureSpace(doc, 70);
    const done = section.items.filter((i) => i.status !== 'Pending').length;
    sectionHeading(doc, section.name, { note: `${done} of ${section.items.length} answered` });
    let group: string | null | undefined;
    const rows: Record<string, unknown>[] = [];
    section.items.forEach((item, index) => {
      if (item.group_name && item.group_name !== group) rows.push({ no: '', name: item.group_name, status: '', ref: '', until: '', files: '', header: true });
      group = item.group_name;
      rows.push({
        no: String(index + 1), name: item.name, status: item.status === 'Not applicable' ? 'N/A' : item.status, ref: item.reference_no ?? '',
        until: item.valid_until ? formatDate(item.valid_until) : '', files: item.files.map((f) => f.name).join(', '), notes: item.notes ?? '',
      });
    });
    table(doc, {
      columns: [
        { key: 'no', label: 'No', width: 0.06 },
        { key: 'name', label: 'Document', width: 0.36 },
        { key: 'status', label: 'Status', width: 0.1 },
        { key: 'ref', label: 'Reference', width: 0.14 },
        { key: 'until', label: 'Valid until', width: 0.11 },
        { key: 'files', label: 'Files / notes', width: 0.23, render: (row) => [row.files, row.notes].filter(Boolean).join(' | ') || '-' },
      ],
      rows,
    });
    spacer(doc, 6);
  }

  stampFooters(doc, ({ index, total }) => ({ left: submission.company_name, center: 'Pre-audit document pack', right: `Page ${index} of ${total}` }));
  return renderPdf(doc);
}
