/**
 * Groundwater NOC use cases: the NOC register, the conditions checklist and the water meter log.
 *
 *   admin     everything, including deleting a NOC
 *   auditor   only auditors of the Water type; they record NOCs, tick conditions and enter meter readings
 *   employer  reads the NOCs, conditions and usage of its own company
 * Every NOC is mirrored into the legal register (compliance_documents, type Approval) so its expiry is reminded like any
 * other licence.
 */
import { localToday } from '@/lib/utils/dates';
import { randomUUID } from 'node:crypto';
import { writeActivityLog } from '@/lib/logger/activity-log';
import { assertPermission } from '@/lib/auth/permission-check';
import { saveUploads, type UploadInput } from '@/lib/files/file-service';
import { buildPagination, parsePagination } from '@/lib/utils/pagination';
import {
  combineSources, intervals, monthly, nocStatusFor, recentIntervals, summarise, type MeterReading, type UsageSummary,
} from '@/lib/water/usage';
import { STANDARD_NOC_CONDITIONS } from '@/lib/water/noc-conditions';
import {
  conditionCreateSchema, conditionUpdateSchema, meterSchema, meterUpdateSchema, nocCreateSchema, nocUpdateSchema,
  readingSchema, readingUpdateSchema,
} from '@/lib/validations/water-noc.validation';
import * as repo from '@/repositories/water-noc.repository';
import type { AuthUser } from '@/types/user';

export type NocRole = 'admin' | 'auditor' | 'employer';
export interface Actor { user: AuthUser; ip?: string | null }

type Row = repo.Row;

function fail(code: string, message: string, extra: Record<string, unknown> = {}): never {
  throw Object.assign(new Error(message), { code, ...extra });
}

const today = localToday;

/* ───────────────────────────── access ───────────────────────────── */

async function accessOf(user: AuthUser): Promise<{ role: NocRole; canWrite: boolean }> {
  const slugs = user.roles.map((role) => role.slug);
  if (slugs.includes('super_admin') || slugs.includes('admin')) return { role: 'admin', canWrite: true };
  if (slugs.includes('auditor')) {
    if (!(await repo.isWaterAuditor(user.id))) fail('FORBIDDEN', 'The groundwater NOC register is kept by Water auditors');
    return { role: 'auditor', canWrite: true };
  }
  if (slugs.includes('employer')) return { role: 'employer', canWrite: false };
  return fail('FORBIDDEN', 'Your account cannot open the groundwater NOC register');
}

/** Whether this login belongs to a Water auditor (used to show the menu entry). */
export async function isWaterAuditorUser(userId: number): Promise<boolean> {
  return Boolean(await repo.isWaterAuditor(userId));
}

async function loadNoc(user: AuthUser, id: number): Promise<{ noc: Row; role: NocRole; canWrite: boolean }> {
  const access = await accessOf(user);
  const noc = await repo.findNoc(id);
  if (!noc) return fail('NOT_FOUND', 'Groundwater NOC not found');
  if (access.role === 'employer' && Number(noc.employer_id) !== Number(user.employerId)) fail('NOT_FOUND', 'Groundwater NOC not found');
  return { noc, ...access };
}

async function mustWrite(user: AuthUser, id: number, permission: string) {
  assertPermission(user, permission);
  const loaded = await loadNoc(user, id);
  if (!loaded.canWrite) fail('FORBIDDEN', 'Only the Water auditor or an administrator can change a NOC');
  return loaded;
}

async function log(actor: Actor, noc: Record<string, unknown>, action: string, description: string) {
  await writeActivityLog({
    userId: actor.user.id, userName: actor.user.fullName, userRole: actor.user.primaryRole,
    employerId: noc.employer_id ? Number(noc.employer_id) : null,
    action, module: 'water_noc', entityType: 'water_noc', entityId: Number(noc.id), entityLabel: String(noc.noc_number ?? ''),
    description, ipAddress: actor.ip ?? null,
  });
}

/* ───────────────────────────── usage ───────────────────────────── */

function readingsOf(rows: Row[], meterId: number): MeterReading[] {
  return rows
    .filter((row) => Number(row.meter_id) === meterId)
    .map((row) => ({ date: String(row.reading_date), value: Number(row.reading_value), isReset: Boolean(row.is_reset) }));
}

/** Litres drawn per day against the approved quantity: the last 30 days, the whole record and month by month. */
async function usageFor(nocId: number, approvedLpd: number, meters: Row[], allReadings: Row[]) {
  const sources = meters.filter((meter) => meter.counts_toward_noc && meter.status === 'active');
  const lists = sources.map((meter) => intervals(readingsOf(allReadings, Number(meter.id)), meter.reading_unit === 'L' ? 'L' : 'KL'));
  const combined = combineSources(lists);
  const now = today();
  return {
    nocId,
    sourceMeters: sources.map((meter) => String(meter.name)),
    recent: summarise(recentIntervals(combined, now, 30), approvedLpd),
    overall: summarise(combined, approvedLpd),
    months: monthly(combined, approvedLpd).slice(-12),
    firstDate: combined[0]?.to ?? null,
    lastDate: combined.length ? combined[combined.length - 1].to : null,
  };
}

function meterRecent(meter: Row, readings: Row[]): { recentKl: number; recentKld: number } {
  const list = intervals(readingsOf(readings, Number(meter.id)), meter.reading_unit === 'L' ? 'L' : 'KL');
  const recent = recentIntervals(list, today(), 30);
  const litres = recent.reduce((sum, item) => sum + item.litres, 0);
  const days = recent.reduce((sum, item) => sum + item.days, 0);
  return { recentKl: litres / 1000, recentKld: days ? litres / days / 1000 : 0 };
}

/* ───────────────────────────── register ───────────────────────────── */

export async function listNocs(user: AuthUser, params: { page?: number; limit?: number; search?: string; employerId?: number; sortBy?: string; sortDir?: string }) {
  assertPermission(user, 'water_noc.read');
  const { role } = await accessOf(user);
  const { page, limit, offset } = parsePagination({ page: params.page, limit: params.limit });
  const { total, rows } = await repo.listNocs({
    search: params.search?.trim() || undefined,
    employerId: role === 'employer' ? Number(user.employerId ?? 0) || -1 : params.employerId,
    limit, offset, sortBy: params.sortBy, sortDir: params.sortDir,
  });

  const readings = await repo.sourceReadingsForNocs(rows.map((row) => Number(row.id)));
  const now = today();
  const data = rows.map((row) => {
    const mine = readings.filter((reading) => Number(reading.noc_id) === Number(row.id));
    const meterIds = [...new Set(mine.map((reading) => Number(reading.meter_id)))];
    const lists = meterIds.map((meterId) => {
      const own = mine.filter((reading) => Number(reading.meter_id) === meterId);
      return intervals(own.map((r) => ({ date: String(r.reading_date), value: Number(r.reading_value), isReset: Boolean(r.is_reset) })), own[0]?.reading_unit === 'L' ? 'L' : 'KL');
    });
    const recent: UsageSummary = summarise(recentIntervals(combineSources(lists), now, 30), Number(row.approved_quantity_lpd));
    return {
      ...row,
      derived_status: nocStatusFor(row.expiry_date ? String(row.expiry_date) : null, String(row.status), now),
      avg_kld_30: recent.days ? recent.avgKld : null,
      percent_30: recent.percent,
      usage_status: recent.status,
      last_reading_date: mine.length ? mine.reduce((max, r) => (String(r.reading_date) > max ? String(r.reading_date) : max), '') : null,
    };
  });
  return { data, pagination: buildPagination(total, page, limit) };
}

export async function getNocDetail(user: AuthUser, id: number) {
  assertPermission(user, 'water_noc.read');
  const { noc, role, canWrite } = await loadNoc(user, id);
  const [conditions, meters] = await Promise.all([repo.listConditions(id), repo.listMeters(id)]);
  const readings = await repo.listReadings(meters.map((meter) => Number(meter.id)), true);
  const usage = await usageFor(id, Number(noc.approved_quantity_lpd), meters, [...readings].reverse());
  const perMeter = meters.map((meter) => ({ ...meter, ...meterRecent(meter, readings) }) as Row & { recentKl: number; recentKld: number });
  const perms = user.permissions;
  const has = (name: string) => perms.includes('*') || perms.includes(name);
  return {
    noc: { ...noc, derived_status: nocStatusFor(noc.expiry_date ? String(noc.expiry_date) : null, String(noc.status), today()) } as Row & { derived_status: string },
    conditions,
    meters: perMeter,
    readings,
    usage,
    role,
    can: {
      edit: canWrite && has('water_noc.update'),
      delete: role === 'admin' && has('water_noc.delete'),
      upload: canWrite && has('water_noc.upload'),
      download: has('water_noc.download'),
    },
    fileUrl: noc.file_id ? `/api/files/${noc.file_id}/download` : null,
  };
}

/** Rows the PDF needs: the detail plus nothing the caller may not see. */
export async function reportForDownload(actor: Actor, id: number) {
  assertPermission(actor.user, 'water_noc.download');
  const { noc } = await loadNoc(actor.user, id);
  await log(actor, noc, 'exported', `Groundwater NOC ${String(noc.noc_number)} downloaded as PDF`);
  return noc;
}

function legalStatus(derived: string): string {
  if (derived === 'Applied') return 'Applied for Renewal';
  if (derived === 'Cancelled') return 'Expired';
  return derived;
}

async function syncLegalDocument(nocId: number, userId: number) {
  const noc = await repo.findNoc(nocId);
  if (!noc || !noc.document_id) return;
  await repo.updateLegalDocument(Number(noc.document_id), {
    document_name: `Groundwater NOC - ${String(noc.noc_number)}`,
    unit_id: noc.unit_id ?? null,
    document_number: noc.noc_number,
    issuing_authority: noc.issuing_authority ?? null,
    issue_date: noc.issue_date ?? null,
    expiry_date: noc.expiry_date ?? null,
    compliance_status: legalStatus(nocStatusFor(noc.expiry_date ? String(noc.expiry_date) : null, String(noc.status), today())),
    file_id: noc.file_id ?? null,
    notes: `Approved quantity ${Number(noc.approved_quantity_lpd).toLocaleString('en-IN')} litres a day (${String(noc.purpose ?? 'Domestic')}). Managed in Groundwater NOC.`,
    updated_by: userId,
  });
}

export async function createNoc(actor: Actor, input: unknown) {
  assertPermission(actor.user, 'water_noc.create');
  const access = await accessOf(actor.user);
  if (!access.canWrite) fail('FORBIDDEN', 'Only the Water auditor or an administrator can add a NOC');
  const data = nocCreateSchema.parse(input);

  if (!(await repo.employerExists(data.employer_id))) fail('INVALID_REFERENCE', 'That company does not exist');
  if (data.unit_id && !(await repo.unitBelongs(data.unit_id, data.employer_id))) fail('INVALID_REFERENCE', 'That unit does not belong to this company');
  if (await repo.nocNumberTaken(data.employer_id, data.noc_number)) fail('DUPLICATE', `This company already has a NOC numbered ${data.noc_number}`);

  const { standard_conditions: withConditions, ...fields } = data;
  const derived = nocStatusFor(fields.expiry_date ?? null, fields.status ?? null, today());
  const documentId = await repo.insertLegalDocument({
    uuid: randomUUID(),
    document_name: `Groundwater NOC - ${data.noc_number}`,
    document_type: 'Approval',
    employer_id: data.employer_id,
    unit_id: fields.unit_id ?? null,
    document_number: data.noc_number,
    issuing_authority: fields.issuing_authority ?? null,
    issue_date: fields.issue_date ?? null,
    expiry_date: fields.expiry_date ?? null,
    compliance_status: legalStatus(derived),
    notes: `Approved quantity ${data.approved_quantity_lpd.toLocaleString('en-IN')} litres a day. Managed in Groundwater NOC.`,
    created_by: actor.user.id,
    updated_by: actor.user.id,
  });

  const id = await repo.insertNoc({
    uuid: randomUUID(),
    ...fields,
    title: fields.title ?? `Groundwater NOC - ${data.noc_number}`,
    renewal_cycle_years: fields.renewal_cycle_years ?? 3,
    purpose: fields.purpose ?? 'Domestic',
    status: fields.status ?? 'Valid',
    document_id: documentId,
    created_by: actor.user.id,
    updated_by: actor.user.id,
  });

  if (withConditions) await seedStandardConditions(id);
  const created = await repo.findNoc(id);
  await log(actor, created!, 'created', `Groundwater NOC ${data.noc_number} recorded`);
  return created!;
}

export async function updateNoc(actor: Actor, id: number, input: unknown) {
  const { noc } = await mustWrite(actor.user, id, 'water_noc.update');
  const data = nocUpdateSchema.parse(input);
  if (data.unit_id && !(await repo.unitBelongs(data.unit_id, Number(noc.employer_id)))) fail('INVALID_REFERENCE', 'That unit does not belong to this company');
  if (data.noc_number && (await repo.nocNumberTaken(Number(noc.employer_id), data.noc_number, id))) fail('DUPLICATE', `This company already has a NOC numbered ${data.noc_number}`);
  await repo.updateNoc(id, { ...data, updated_by: actor.user.id });
  await syncLegalDocument(id, actor.user.id);
  const updated = await repo.findNoc(id);
  await log(actor, updated!, 'updated', `Groundwater NOC ${String(updated!.noc_number)} updated`);
  return updated!;
}

export async function deleteNoc(actor: Actor, id: number) {
  assertPermission(actor.user, 'water_noc.delete');
  const { noc, role } = await loadNoc(actor.user, id);
  if (role !== 'admin') fail('FORBIDDEN', 'Only an administrator can delete a NOC');
  await repo.softDeleteNoc(id);
  if (noc.document_id) await repo.softDeleteLegalDocument(Number(noc.document_id));
  await log(actor, noc, 'deleted', `Groundwater NOC ${String(noc.noc_number)} deleted`);
}

export async function attachNocFile(actor: Actor, id: number, file: UploadInput) {
  const { noc } = await mustWrite(actor.user, id, 'water_noc.upload');
  const [saved] = await saveUploads(
    [file],
    { entityType: 'WATER_NOC', entityId: id, category: 'Groundwater NOC', accessLevel: 'private', description: `NOC letter ${String(noc.noc_number)}` },
    { user: actor.user, ip: actor.ip ?? null }
  );
  await repo.updateNoc(id, { file_id: saved.id, updated_by: actor.user.id });
  await syncLegalDocument(id, actor.user.id);
  await log(actor, noc, 'updated', `NOC letter ${saved.original_name} attached to ${String(noc.noc_number)}`);
  return saved;
}

/* ───────────────────────────── conditions ───────────────────────────── */

async function seedStandardConditions(nocId: number) {
  let order = 0;
  for (const text of STANDARD_NOC_CONDITIONS) {
    order += 10;
    await repo.insertCondition({ noc_id: nocId, sort_order: order, clause_no: String(order / 10), condition_text: text });
  }
}

export async function addStandardConditions(actor: Actor, id: number) {
  const { noc } = await mustWrite(actor.user, id, 'water_noc.update');
  if ((await repo.listConditions(id)).length > 0) fail('INVALID_STATE', 'This NOC already has conditions. Delete them first, or add the missing ones one by one.');
  await seedStandardConditions(id);
  await log(actor, noc, 'updated', `Standard conditions added to NOC ${String(noc.noc_number)}`);
  return repo.listConditions(id);
}

export async function addCondition(actor: Actor, id: number, input: unknown) {
  const { noc } = await mustWrite(actor.user, id, 'water_noc.update');
  const data = conditionCreateSchema.parse(input);
  const checked = data.compliance && data.compliance !== 'Not Checked';
  const conditionId = await repo.insertCondition({
    noc_id: id, sort_order: await repo.nextConditionOrder(id), clause_no: data.clause_no ?? null, condition_text: data.condition_text,
    compliance: data.compliance ?? 'Not Checked', remarks: data.remarks ?? null,
    checked_by: checked ? actor.user.id : null, checked_at: checked ? new Date() : null,
  });
  await log(actor, noc, 'updated', `Condition added to NOC ${String(noc.noc_number)}`);
  return repo.findCondition(conditionId);
}

export async function updateCondition(actor: Actor, id: number, conditionId: number, input: unknown) {
  const { noc } = await mustWrite(actor.user, id, 'water_noc.update');
  const condition = await repo.findCondition(conditionId);
  if (!condition || Number(condition.noc_id) !== id) fail('NOT_FOUND', 'Condition not found');
  const data = conditionUpdateSchema.parse(input);
  const patch: Record<string, unknown> = { ...data };
  if (data.compliance !== undefined) {
    const checked = data.compliance !== 'Not Checked';
    patch.checked_by = checked ? actor.user.id : null;
    patch.checked_at = checked ? new Date() : null;
  }
  await repo.updateCondition(conditionId, patch);
  await log(actor, noc, 'updated', `Condition ${String(condition!.clause_no ?? conditionId)} of NOC ${String(noc.noc_number)} marked ${data.compliance ?? 'updated'}`);
  return repo.findCondition(conditionId);
}

export async function deleteCondition(actor: Actor, id: number, conditionId: number) {
  const { noc } = await mustWrite(actor.user, id, 'water_noc.update');
  const condition = await repo.findCondition(conditionId);
  if (!condition || Number(condition.noc_id) !== id) fail('NOT_FOUND', 'Condition not found');
  await repo.softDeleteCondition(conditionId);
  await log(actor, noc, 'updated', `Condition removed from NOC ${String(noc.noc_number)}`);
}

/* ───────────────────────────── meters and readings ───────────────────────────── */

async function loadMeter(nocId: number, meterId: number) {
  const meter = await repo.findMeter(meterId);
  if (!meter || Number(meter.noc_id) !== nocId) return fail('NOT_FOUND', 'Meter not found');
  return meter;
}

export async function addMeter(actor: Actor, id: number, input: unknown) {
  const { noc } = await mustWrite(actor.user, id, 'water_noc.update');
  const data = meterSchema.parse(input);
  if (data.unit_id && !(await repo.unitBelongs(data.unit_id, Number(noc.employer_id)))) fail('INVALID_REFERENCE', 'That unit does not belong to this company');
  const source = data.source ?? 'Borewell';
  const meterId = await repo.insertMeter({
    employer_id: noc.employer_id, unit_id: data.unit_id ?? noc.unit_id ?? null, noc_id: id, name: data.name, source,
    reading_unit: data.reading_unit ?? 'KL', counts_toward_noc: (data.counts_toward_noc ?? source === 'Borewell') ? 1 : 0,
    status: data.status ?? 'active', notes: data.notes ?? null, created_by: actor.user.id,
  });
  await log(actor, noc, 'updated', `Meter ${data.name} added to NOC ${String(noc.noc_number)}`);
  return repo.findMeter(meterId);
}

export async function updateMeter(actor: Actor, id: number, meterId: number, input: unknown) {
  const { noc } = await mustWrite(actor.user, id, 'water_noc.update');
  await loadMeter(id, meterId);
  const data = meterUpdateSchema.parse(input);
  await repo.updateMeter(meterId, { ...data, counts_toward_noc: data.counts_toward_noc === undefined ? undefined : data.counts_toward_noc ? 1 : 0 });
  await log(actor, noc, 'updated', `Meter ${meterId} of NOC ${String(noc.noc_number)} updated`);
  return repo.findMeter(meterId);
}

export async function deleteMeter(actor: Actor, id: number, meterId: number) {
  const { noc } = await mustWrite(actor.user, id, 'water_noc.update');
  await loadMeter(id, meterId);
  await repo.softDeleteMeter(meterId);
  await log(actor, noc, 'updated', `Meter ${meterId} removed from NOC ${String(noc.noc_number)}`);
}

/** A reading may not be below the one before it (unless the meter was reset) nor above the one after it. */
async function checkOrder(meterId: number, date: string, value: number, isReset: boolean, exceptId?: number) {
  if (date > today()) fail('VALIDATION_FAILED', 'A reading cannot be dated in the future', { issues: [{ field: 'reading_date', message: 'Choose a date up to today' }] });
  if (await repo.readingOnDay(meterId, date, exceptId)) fail('DUPLICATE', `There is already a reading for ${date}. Edit that one instead.`);
  if (!isReset) {
    const previous = await repo.previousReading(meterId, date, exceptId);
    if (previous && value < Number(previous.reading_value)) {
      fail('VALIDATION_FAILED', `This reading (${value}) is lower than the previous one (${Number(previous.reading_value)} on ${String(previous.reading_date)}). If the meter was replaced or reset, tick "Meter reset".`,
        { issues: [{ field: 'reading_value', message: `Lower than the previous reading of ${Number(previous.reading_value)}` }] });
    }
  }
  const next = await repo.nextReading(meterId, date, exceptId);
  if (next && !next.is_reset && value > Number(next.reading_value)) {
    fail('VALIDATION_FAILED', `This reading (${value}) is higher than the next one (${Number(next.reading_value)} on ${String(next.reading_date)}).`,
      { issues: [{ field: 'reading_value', message: `Higher than the later reading of ${Number(next.reading_value)}` }] });
  }
}

export async function addReading(actor: Actor, id: number, meterId: number, input: unknown) {
  const { noc } = await mustWrite(actor.user, id, 'water_noc.update');
  const meter = await loadMeter(id, meterId);
  const data = readingSchema.parse(input);
  await checkOrder(meterId, data.reading_date, data.reading_value, Boolean(data.is_reset));
  const readingId = await repo.insertReading({
    meter_id: meterId, reading_date: data.reading_date, reading_value: data.reading_value, is_reset: Boolean(data.is_reset),
    remarks: data.remarks ?? null, entered_by: actor.user.id,
  });
  await log(actor, noc, 'updated', `Reading ${data.reading_value} (${String(meter.name)}, ${data.reading_date}) recorded for NOC ${String(noc.noc_number)}`);
  return repo.findReading(readingId);
}

export async function updateReading(actor: Actor, id: number, readingId: number, input: unknown) {
  await mustWrite(actor.user, id, 'water_noc.update');
  const reading = await repo.findReading(readingId);
  if (!reading) fail('NOT_FOUND', 'Reading not found');
  await loadMeter(id, Number(reading!.meter_id));
  const data = readingUpdateSchema.parse(input);
  const date = data.reading_date ?? String(reading!.reading_date);
  const value = data.reading_value ?? Number(reading!.reading_value);
  const isReset = data.is_reset ?? Boolean(reading!.is_reset);
  await checkOrder(Number(reading!.meter_id), date, value, isReset, readingId);
  await repo.updateReading(readingId, { reading_date: date, reading_value: value, is_reset: isReset ? 1 : 0, remarks: data.remarks });
  return repo.findReading(readingId);
}

export async function deleteReading(actor: Actor, id: number, readingId: number) {
  await mustWrite(actor.user, id, 'water_noc.update');
  const reading = await repo.findReading(readingId);
  if (!reading) fail('NOT_FOUND', 'Reading not found');
  await loadMeter(id, Number(reading!.meter_id));
  await repo.deleteReading(readingId);
}

/* ───────────────────────────── lookups ───────────────────────────── */

export async function lookup(user: AuthUser, type: string, params: { q?: string; employerId?: number }) {
  assertPermission(user, 'water_noc.read');
  const access = await accessOf(user);
  if (!access.canWrite) fail('FORBIDDEN', 'Not available for your role');
  if (type === 'employers') {
    const rows = await repo.lookupEmployers((params.q ?? '').trim());
    return rows.map((row) => ({ value: String(row.id), label: String(row.company_name), hint: [row.employer_code, row.city].filter(Boolean).join(' · ') }));
  }
  if (type === 'units' && params.employerId) {
    const rows = await repo.lookupUnits(params.employerId);
    return rows.map((row) => ({ value: String(row.id), label: String(row.unit_name), hint: row.location ? String(row.location) : undefined }));
  }
  return fail('VALIDATION_FAILED', 'Unknown lookup');
}
