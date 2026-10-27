/**
 * Groundwater NOC compliance PDF: what the NOC permits, how much water the meters say is really drawn against it, and which
 * of its conditions were found met on the visits.
 *
 *   1. letterhead and title
 *   2. the NOC: company, number, authority, validity, approved quantity, purposes and well
 *   3. water drawn against the approved quantity: the last 30 days, the whole record and month by month
 *   4. the conditions with their status and remarks
 *   5. the meters and their latest readings, then the prepared-by line
 */
import { formatDate } from '@/lib/utils/dates';
import { COLORS, CONTENT_WIDTH, MARGIN, createPdf, ensureSpace, renderPdf, sectionHeading, setFont, spacer, stampFooters, table } from '@/lib/pdf/base';
import { companyBranding, drawLetterhead } from '@/lib/pdf/branding';
import { headerGrid } from '@/lib/pdf/blocks';
import type { getNocDetail } from '@/services/water-noc.service';

type Detail = Awaited<ReturnType<typeof getNocDetail>>;

const num = (value: unknown, digits = 1) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: digits }) : '-';
};

function monthName(month: string) {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export async function generateWaterNocPdf(detail: Detail, preparedBy: string): Promise<Buffer> {
  const { noc, usage, conditions, meters } = detail;
  const branding = await companyBranding();
  const doc = createPdf({
    title: `Groundwater NOC - ${String(noc.noc_number)}`,
    subject: `Groundwater NOC compliance report for ${String(noc.employer_name)}`,
    author: branding.name || 'ComplianceOS',
  });

  drawLetterhead(doc, { firm: branding.name, address: branding.address, logo: branding.logo, letterhead: branding.letterhead });
  setFont(doc, 14, { bold: true });
  doc.fillColor(COLORS.ink).text('GROUNDWATER NOC COMPLIANCE REPORT', MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' });
  doc.y += 4;
  setFont(doc, 8.5);
  doc.fillColor(COLORS.muted).text(`${String(noc.noc_number)}  |  ${String(noc.derived_status)}  |  Prepared ${formatDate(new Date().toISOString().slice(0, 10))}`, MARGIN, doc.y, { width: CONTENT_WIDTH, align: 'center' });
  doc.y += 12;

  /* ── 2. the NOC ── */
  headerGrid(doc, [
    { label: 'Company', value: [noc.employer_name, noc.unit_name].filter(Boolean).join(' - ') },
    { label: 'NOC number', value: String(noc.noc_number) },
    { label: 'Issuing authority', value: String(noc.issuing_authority ?? '-') },
    { label: 'Purpose', value: String(noc.purpose ?? '-') },
    { label: 'Valid from', value: noc.issue_date ? formatDate(String(noc.issue_date)) : '-' },
    { label: 'Valid until', value: noc.expiry_date ? `${formatDate(String(noc.expiry_date))} (renewed every ${num(noc.renewal_cycle_years, 0)} years)` : '-' },
    { label: 'Approved quantity', value: `${num(noc.approved_quantity_lpd, 0)} litres a day (${num(Number(noc.approved_quantity_lpd) / 1000)} KLD)` },
    { label: 'Domestic / gardening / other (LPD)', value: [noc.purpose_domestic_lpd, noc.purpose_gardening_lpd, noc.purpose_other_lpd].map((v) => (v === null || v === undefined ? '-' : num(v, 0))).join(' / ') },
    { label: 'Well', value: [noc.well_type, noc.well_depth_m ? `${num(noc.well_depth_m)} m deep` : null, noc.well_diameter_in ? `${num(noc.well_diameter_in)} in` : null].filter(Boolean).join(', ') || '-' },
    { label: 'Pump', value: [noc.pump_hp ? `${num(noc.pump_hp)} HP` : null, noc.pumping_hours_per_day ? `${num(noc.pumping_hours_per_day)} hours a day` : null, noc.abstraction_structures ? `${num(noc.abstraction_structures, 0)} abstraction structure(s)` : null].filter(Boolean).join(', ') || '-' },
  ]);

  /* ── 3. usage ── */
  sectionHeading(doc, 'Water drawn against the approved quantity', {
    note: usage.sourceMeters.length ? `Measured at: ${usage.sourceMeters.join(', ')}` : 'No meter is marked as counting toward this NOC.',
  });
  table(doc, {
    columns: [
      { key: 'period', label: 'Period', width: 0.28 },
      { key: 'days', label: 'Days measured', width: 0.14, align: 'right' },
      { key: 'kl', label: 'Drawn (KL)', width: 0.16, align: 'right' },
      { key: 'kld', label: 'Average (KLD)', width: 0.16, align: 'right' },
      { key: 'percent', label: 'Of the limit', width: 0.12, align: 'right' },
      { key: 'status', label: 'Status', width: 0.14 },
    ],
    rows: [
      { period: 'Last 30 days', days: usage.recent.days, kl: num(usage.recent.litres / 1000, 0), kld: num(usage.recent.avgKld), percent: usage.recent.percent === null ? '-' : `${usage.recent.percent.toFixed(0)}%`, status: usage.recent.status },
      { period: 'Whole record', days: usage.overall.days, kl: num(usage.overall.litres / 1000, 0), kld: num(usage.overall.avgKld), percent: usage.overall.percent === null ? '-' : `${usage.overall.percent.toFixed(0)}%`, status: usage.overall.status },
      ...[...usage.months].reverse().map((month) => ({
        period: monthName(month.month), days: month.days, kl: num(month.litres / 1000, 0), kld: num(month.avgKld),
        percent: month.percent === null ? '-' : `${month.percent.toFixed(0)}%`, status: month.status,
      })),
    ],
    empty: 'No meter readings have been recorded yet.',
    maxRows: 40,
  });
  setFont(doc, 8);
  doc.fillColor(COLORS.muted).text(`Limit: ${num(Number(noc.approved_quantity_lpd) / 1000)} KLD. "Near limit" is 90 percent of it or more; "Over limit" is above it. Water between two readings is spread evenly over the days between them.`, MARGIN, doc.y + 3, { width: CONTENT_WIDTH });
  doc.y += 12;

  /* ── 4. conditions ── */
  const met = conditions.filter((c) => c.compliance === 'Compliant').length;
  const notMet = conditions.filter((c) => c.compliance === 'Non-Compliant').length;
  sectionHeading(doc, 'Conditions of the NOC', { note: `${met} of ${conditions.length} met${notMet ? `, ${notMet} not met` : ''}` });
  table(doc, {
    columns: [
      { key: 'no', label: 'No.', width: 0.06, align: 'center' },
      { key: 'text', label: 'Condition', width: 0.56 },
      { key: 'state', label: 'Status', width: 0.14 },
      { key: 'remarks', label: 'Remarks', width: 0.24 },
    ],
    rows: conditions.map((condition, index) => ({
      no: String(condition.clause_no ?? index + 1),
      text: String(condition.condition_text),
      state: String(condition.compliance),
      remarks: condition.remarks ? String(condition.remarks) : '-',
    })),
    empty: 'No conditions have been recorded for this NOC.',
    maxRows: 80,
  });
  spacer(doc, 6);

  /* ── 5. meters ── */
  sectionHeading(doc, 'Water meters');
  table(doc, {
    columns: [
      { key: 'name', label: 'Meter', width: 0.3 },
      { key: 'source', label: 'Source / use', width: 0.18 },
      { key: 'counts', label: 'Counts toward NOC', width: 0.16 },
      { key: 'last', label: 'Last reading', width: 0.2, align: 'right' },
      { key: 'recent', label: 'Last 30 days (KL)', width: 0.16, align: 'right' },
    ],
    rows: meters.map((meter) => ({
      name: String(meter.name),
      source: String(meter.source),
      counts: meter.counts_toward_noc ? 'Yes' : 'No',
      last: meter.last_reading_date ? `${num(meter.last_reading_value, 2)} ${String(meter.reading_unit)} on ${formatDate(String(meter.last_reading_date))}` : '-',
      recent: num(meter.recentKl, 0),
    })),
    empty: 'No meters have been added.',
    maxRows: 30,
  });

  ensureSpace(doc, 90);
  doc.y += 18;
  const y = doc.y;
  const half = CONTENT_WIDTH / 2;
  [{ x: MARGIN, role: 'Prepared by', name: preparedBy }, { x: MARGIN + half, role: 'Company representative', name: '' }].forEach((block) => {
    doc.save().strokeColor(COLORS.muted).lineWidth(0.6).moveTo(block.x + 8, y + 30).lineTo(block.x + half - 24, y + 30).stroke().restore();
    setFont(doc, 8, { bold: true });
    doc.fillColor(COLORS.muted).text(`Signature - ${block.role}`, block.x + 8, y + 34, { width: half - 32 });
    if (block.name) {
      setFont(doc, 9);
      doc.fillColor(COLORS.ink).text(block.name, block.x + 8, y + 46, { width: half - 32 });
    }
  });
  doc.y = y + 70;

  stampFooters(doc, ({ index, total }) => ({
    left: String(noc.noc_number),
    center: String(noc.employer_name ?? '').slice(0, 34),
    right: `Page ${index} of ${total}`,
  }));
  return renderPdf(doc);
}
