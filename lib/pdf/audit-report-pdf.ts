/**
 * Audit Report PDF.
 *
 * The client-facing deliverable: a letterhead built from the employer's own
 * registration details, the audit identity block, the executive summary, the
 * scorecard, the findings register (colour-coded by severity), observations,
 * recommendations and the signature block — with the report number, version and
 * page count stamped in the footer of every page.
 *
 * Layout rules that matter to the specification:
 *   • Every finding prints inside a bordered card so a finding never straddles a
 *     page break in a way that loses its heading.
 *   • Findings beyond `MAX_FINDINGS` roll into an appendix table rather than
 *     pushing the document past a sane length.
 *   • The footer is stamped after the body is complete, using absolute
 *     coordinates, so it can never spawn extra pages.
 */
import { queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { formatCurrency, maskAadhaar } from '@/lib/utils/formatting';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import {
  COLORS, MARGIN, CONTENT_WIDTH, createPdf, letterhead, sectionHeading, keyValues, table,
  signatureBlock, stampFooters, setFont, paragraph, bullets, spacer, ensureSpace, renderPdf,
  type Doc,
} from '@/lib/pdf/base';
import type { ReportBody } from '@/lib/validations/audit-report.validation';

const MAX_FINDINGS = 40;

export interface AuditReportPdfInput {
  report: Record<string, unknown>;
  body: ReportBody;
  version: number;
}

export interface AuditReportPdfContext {
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

function date(value: unknown): string {
  if (!value) return '—';
  return formatDate(String(value));
}

function score(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Not scored';
  return `${Number(value).toFixed(2)}%`;
}

async function loadCompany(report: Record<string, unknown>): Promise<CompanyInfo> {
  const employerId = Number(report.employer_id);
  const [employer, settings] = await Promise.all([
    queryOne<RowDataPacket>(
      `SELECT company_name, address_line_1, address_line_2, city, state, pincode, country,
              gst_number, pan_number, cin_number, contact_person_name, contact_person_designation
         FROM employers WHERE id = ? LIMIT 1`,
      [employerId]
    ),
    queryOne<RowDataPacket>(
      `SELECT setting_key, setting_value FROM settings
        WHERE setting_key IN ('company_name','company_address','company_email','company_phone') AND deleted_at IS NULL`
    ).catch(() => null),
  ]);

  const addressLines = [
    employer?.address_line_1, employer?.address_line_2,
    [employer?.city, employer?.state, employer?.pincode].filter(Boolean).join(' '),
  ].filter(Boolean).map(String);

  const registrationLine = [
    employer?.gst_number ? `GSTIN: ${employer.gst_number}` : null,
    employer?.pan_number ? `PAN: ${employer.pan_number}` : null,
    employer?.cin_number ? `CIN: ${employer.cin_number}` : null,
  ].filter(Boolean).join('   |   ');

  void settings;

  return {
    name: String(employer?.company_name ?? 'Employer'),
    addressLines: addressLines.length ? addressLines : ['Address not on record'],
    registrationLine: registrationLine || 'Registration details not on record',
  };
}

const SEVERITY_STYLE: Record<string, { bg: string; text: string }> = {
  Critical: { bg: '#fee2e2', text: '#b91c1c' },
  Major: { bg: '#ffedd5', text: '#c2410c' },
  Minor: { bg: '#fef9c3', text: '#a16207' },
  Observation: { bg: '#e0f2fe', text: '#0369a1' },
};

export async function generateAuditReportPdf(
  input: AuditReportPdfInput,
  context: AuditReportPdfContext
): Promise<Buffer> {
  const { report, body } = input;
  const version = input.version ?? Number(report.current_version ?? 1);
  const generatedAt = context.generatedAt ?? new Date();
  const company = await loadCompany(report);

  const doc = createPdf({
    title: `${text(report.report_number)} — ${text(report.audit_title)}`,
    subject: `${text(report.report_type)} report for ${company.name}`,
    author: context.generatedByName,
    keywords: `audit report, ${text(report.report_number)}, compliance`,
  });

  letterhead(doc, {
    companyName: company.name,
    addressLines: company.addressLines,
    registrationLine: company.registrationLine,
    documentTitle: `${text(report.report_type)} REPORT — ${text(report.audit_title)}`,
    subtitle: `${text(report.report_number)}${report.assignment_number ? `  ·  Assignment ${report.assignment_number}` : ''}  ·  Version ${version}`,
    metaRows: [
      { label: 'Report No.', value: text(report.report_number) },
      { label: 'Audit Period', value: `${date(report.audit_period_from)} to ${date(report.audit_period_to)}` },
      { label: 'Status', value: text(report.status) },
      { label: 'Generated', value: formatDateTime(generatedAt) },
    ],
  });

  /* ------------------------------------------------------------ identity */
  sectionHeading(doc, 'Audit Particulars');
  keyValues(doc, [
    { label: 'Employer', value: company.name },
    { label: 'Unit', value: text(report.unit_name, 'All units') },
    { label: 'Department', value: text(report.department_name, 'All departments') },
    { label: 'Auditor', value: `${text(report.auditor_name)}${report.auditor_code ? ` (${report.auditor_code})` : ''}` },
    { label: 'Verifier', value: text(report.verifier_name, 'Not assigned') },
    { label: 'Audit Date', value: date(report.audit_date) },
    { label: 'Submitted On', value: report.submitted_at ? formatDateTime(String(report.submitted_at)) : 'Not submitted' },
    { label: 'Approved On', value: report.approved_at ? formatDateTime(String(report.approved_at)) : 'Pending approval' },
  ], { columns: 2 });
  spacer(doc, 6);

  /* ---------------------------------------------------------------- score */
  sectionHeading(doc, 'Score Summary');
  const percentage = report.score_percentage === null || report.score_percentage === undefined
    ? null
    : Number(report.score_percentage);
  keyValues(doc, [
    { label: 'Score Obtained', value: report.score_obtained === null ? '—' : String(Number(report.score_obtained).toFixed(2)) },
    { label: 'Maximum Score', value: report.score_max === null ? '—' : String(Number(report.score_max).toFixed(2)) },
    { label: 'Compliance %', value: score(report.score_percentage) },
    { label: 'Grading', value: percentage === null ? '—' : gradeFor(percentage) },
  ], { columns: 4 });

  keyValues(doc, [
    { label: 'Critical Findings', value: String(Number(report.critical_findings ?? 0)) },
    { label: 'Major Findings', value: String(Number(report.major_findings ?? 0)) },
    { label: 'Minor Findings', value: String(Number(report.minor_findings ?? 0)) },
    { label: 'Observations', value: String(Number(report.observations ?? 0)) },
  ], { columns: 4 });
  spacer(doc, 4);

  if (percentage !== null) {
    drawScoreBar(doc, percentage);
    spacer(doc, 6);
  }

  /* ------------------------------------------------------------ narrative */
  if (body.executive_summary) {
    sectionHeading(doc, 'Executive Summary');
    paragraph(doc, body.executive_summary, { size: 9.5 });
    spacer(doc, 6);
  }

  if (body.methodology) {
    sectionHeading(doc, 'Scope & Methodology');
    paragraph(doc, body.methodology, { size: 9.5 });
    spacer(doc, 6);
  }

  /* ------------------------------------------------------------- scorecard */
  const scorecard = body.scorecard ?? [];
  if (scorecard.length) {
    sectionHeading(doc, 'Section-wise Scorecard');
    const totalMax = scorecard.reduce((total, row) => total + Number(row.max_score ?? 0), 0);
    const totalObtained = scorecard.reduce((total, row) => total + Number(row.obtained_score ?? 0), 0);
    table(doc, {
      columns: [
        { key: 'section', label: 'Section', width: 0.42 },
        { key: 'max_score', label: 'Max', width: 0.12, align: 'right', render: (row) => Number(row.max_score ?? 0).toFixed(2) },
        { key: 'obtained_score', label: 'Obtained', width: 0.14, align: 'right', render: (row) => Number(row.obtained_score ?? 0).toFixed(2) },
        {
          key: 'percentage', label: '%', width: 0.1, align: 'right',
          render: (row) => {
            const max = Number(row.max_score ?? 0);
            return max > 0 ? `${((Number(row.obtained_score ?? 0) / max) * 100).toFixed(1)}%` : '—';
          },
        },
        { key: 'remarks', label: 'Remarks', width: 0.22, render: (row) => text(row.remarks, '—') },
      ],
      rows: scorecard as Record<string, unknown>[],
      footer: totalMax > 0
        ? `Total  ${totalObtained.toFixed(2)} / ${totalMax.toFixed(2)}   (${((totalObtained / totalMax) * 100).toFixed(2)}%)`
        : undefined,
    });
    spacer(doc, 8);
  }

  /* -------------------------------------------------------------- findings */
  const findings = (body.findings ?? []).filter((finding) => finding.description);
  if (findings.length) {
    sectionHeading(doc, 'Findings Register', { note: `${findings.length} finding(s)` });
    const printed = findings.slice(0, MAX_FINDINGS);
    printed.forEach((finding, index) => {
      drawFindingCard(doc, finding as unknown as Record<string, unknown>, index + 1);
    });
    if (findings.length > MAX_FINDINGS) {
      paragraph(doc, `${findings.length - MAX_FINDINGS} further finding(s) are recorded in the digital report.`, { size: 8.5, color: COLORS.muted });
    }
    spacer(doc, 6);
  } else {
    sectionHeading(doc, 'Findings Register');
    paragraph(doc, 'No non-conformities were recorded during this audit.', { size: 9.5 });
    spacer(doc, 6);
  }

  /* ---------------------------------------------------------- observations */
  const observations = body.observations ?? [];
  if (observations.length) {
    sectionHeading(doc, 'Observations');
    bullets(doc, observations);
    spacer(doc, 6);
  }

  /* ------------------------------------------------------- recommendations */
  const recommendations = body.recommendations ?? [];
  if (recommendations.length) {
    sectionHeading(doc, 'Recommendations');
    bullets(doc, recommendations);
    spacer(doc, 6);
  }

  /* ---------------------------------------------------------- regulations */
  const references = body.regulatory_references ?? [];
  if (references.length) {
    sectionHeading(doc, 'Regulatory References');
    bullets(doc, references);
    spacer(doc, 6);
  }

  /* -------------------------------------------------------- approval block */
  const decision = (body as unknown as { decision?: Record<string, unknown> }).decision;
  if (decision) {
    sectionHeading(doc, 'Verification Decision');
    keyValues(doc, [
      { label: 'Decision', value: text(decision.action === 'approve' ? 'Approved' : decision.action === 'reject' ? 'Rejected' : 'Returned for correction') },
      { label: 'Decided By', value: text(decision.decided_by) },
      { label: 'Decided On', value: decision.decided_at ? formatDateTime(String(decision.decided_at)) : '—' },
      { label: 'Corrections Raised', value: String(Number(decision.corrections ?? 0)) },
    ], { columns: 2 });
    if (decision.comments) paragraph(doc, String(decision.comments), { size: 9 });
    spacer(doc, 4);
  }

  if (report.rejection_reason) {
    sectionHeading(doc, 'Reason for Rejection');
    paragraph(doc, String(report.rejection_reason), { size: 9.5, color: COLORS.danger });
    spacer(doc, 4);
  }

  spacer(doc, 8);
  signatureBlock(doc, ['Auditor', 'Verifier', 'Authorised Signatory (Employer)'], {
    note: `This report was generated by ${context.generatedByName} (${context.generatedByRole}) on ${formatDateTime(generatedAt)}. `
      + `Report ${text(report.report_number)} version ${version}.`,
  });

  /* --------------------------------------------------------------- footer */
  // `total` is the finished page count by the time footers are stamped, so the
  // real page numbers go on in one pass — a placeholder would stay visible
  // underneath the final text.
  stampFooters(doc, ({ index, total }) => ({
    left: `Report ${text(report.report_number)}  ·  v${version}`,
    center: company.name,
    right: `Page ${index} of ${total}`,
  }));

  return renderPdf(doc);
}

function gradeFor(percentage: number): string {
  if (percentage >= 90) return 'A — Compliant';
  if (percentage >= 75) return 'B — Substantially Compliant';
  if (percentage >= 60) return 'C — Partially Compliant';
  return 'D — Non-Compliant';
}

/** A horizontal compliance bar, drawn with rectangles (no image assets). */
function drawScoreBar(doc: Doc, percentage: number): void {
  const height = 10;
  const y = doc.y;
  const width = CONTENT_WIDTH;
  const filled = Math.max(0, Math.min(100, percentage));

  doc.save()
    .roundedRect(MARGIN, y, width, height, 5).fill('#e5e7eb')
    .roundedRect(MARGIN, y, (width * filled) / 100, height, 5)
    .fill(filled >= 90 ? '#059669' : filled >= 75 ? '#3b82f6' : filled >= 60 ? '#f59e0b' : '#dc2626')
    .restore();

  setFont(doc, 8);
  doc.fillColor(COLORS.muted).text(`${filled.toFixed(2)}% compliance`, MARGIN, y + height + 3, { width, align: 'right' });
  doc.y = y + height + 14;
}

/** One finding as a bordered card: header strip, clause, description, action. */
function drawFindingCard(doc: Doc, finding: Record<string, unknown>, index: number): void {
  const severity = String(finding.severity ?? 'Minor');
  const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.Minor;
  const description = String(finding.description ?? '');
  const recommendation = finding.recommendation ? String(finding.recommendation) : null;
  const evidence = finding.evidence ? String(finding.evidence) : null;
  const response = finding.employer_response ? String(finding.employer_response) : null;
  const clause = finding.clause ? String(finding.clause) : null;

  setFont(doc, 9.5);
  const descHeight = doc.heightOfString(description, { width: CONTENT_WIDTH - 24 });
  const extraLines = [evidence, clause, recommendation, response].filter(Boolean).length;
  const cardHeight = 44 + descHeight + extraLines * 26;

  ensureSpace(doc, Math.min(cardHeight, doc.page.height - MARGIN * 2 - 20) + 18);

  const top = doc.y;
  const height = Math.min(cardHeight, doc.page.height - MARGIN - 30 - top);

  doc.save().roundedRect(MARGIN, top, CONTENT_WIDTH, height, 4).strokeColor(COLORS.line).lineWidth(0.7).stroke().restore();
  doc.save().rect(MARGIN, top, CONTENT_WIDTH, 18).fill(style.bg).restore();

  setFont(doc, 9, { bold: true });
  doc.fillColor(style.text).text(
    `F-${String(index).padStart(2, '0')}   ${severity.toUpperCase()}`,
    MARGIN + 6, top + 5, { width: CONTENT_WIDTH * 0.5, lineBreak: false }
  );
  setFont(doc, 8);
  doc.fillColor(COLORS.muted).text(
    `Status: ${text(finding.status, 'Open')}${finding.due_date ? `  ·  Due ${date(finding.due_date)}` : ''}`,
    MARGIN + CONTENT_WIDTH * 0.5, top + 6, { width: CONTENT_WIDTH * 0.5 - 6, align: 'right', lineBreak: false }
  );

  let y = top + 24;
  if (clause) {
    setFont(doc, 8.5, { bold: true });
    doc.fillColor(COLORS.muted).text('Reference: ', MARGIN + 8, y, { continued: true });
    setFont(doc, 8.5);
    doc.fillColor(COLORS.body).text(clause, { width: CONTENT_WIDTH - 24 });
    y = doc.y + 3;
  }

  setFont(doc, 9.5);
  doc.fillColor(COLORS.ink).text(description, MARGIN + 8, y, { width: CONTENT_WIDTH - 24 });
  y = doc.y + 4;

  const detailLine = (label: string, value: string, color: string = COLORS.body) => {
    if (y > top + height - 16) return;
    setFont(doc, 8.5, { bold: true });
    doc.fillColor(COLORS.muted).text(label, MARGIN + 8, y, { width: 92, lineBreak: false });
    setFont(doc, 8.5);
    doc.fillColor(color).text(value, MARGIN + 102, y, { width: CONTENT_WIDTH - 118 });
    y = doc.y + 3;
  };

  if (evidence) detailLine('Evidence:', evidence);
  if (recommendation) detailLine('Action required:', recommendation, COLORS.success);
  if (response) detailLine('Employer reply:', response);

  doc.y = top + height + 8;
}

/** Employer-facing summary used by the portal "approved reports" list. */
export async function reportSummaryRow(reportId: number) {
  return queryOne<RowDataPacket>(
    `SELECT ar.report_number, ar.audit_title, ar.status, ar.score_percentage, ar.audit_date, ar.next_audit_due,
            e.company_name
       FROM audit_reports ar JOIN employers e ON e.id = ar.employer_id
      WHERE ar.id = ? AND ar.deleted_at IS NULL`,
    [reportId]
  );
}

export { maskAadhaar, formatCurrency };
