/**
 * Factory Profile: one record per employer. An employer reads and edits its own; an administrator reads and edits any company's.
 * The repeating lists (units, departments, holidays, areas, welfare, treatment plants, migrant workers) are JSON arrays validated here.
 */
import { z } from 'zod';
import { execute, queryOne, type RowDataPacket } from '@/lib/db/mysql';

function fail(message: string, code: string, extra: Record<string, unknown> = {}): never {
  throw Object.assign(new Error(message), { code, ...extra });
}

const str = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));
const int = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().int().min(0).max(100000000).nullable()).default(null);
const dec = z.preprocess((v) => (v === '' || v === undefined ? null : v), z.coerce.number().min(0).max(1000000000).nullable()).default(null);
const day = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date'), z.literal(''), z.null()]).optional().transform((v) => (v ? v : null));
const name = z.string().trim().min(1, 'Give it a name').max(200);

export const factoryProfileSchema = z.object({
  occupiers: str(1000), factory_licence_no: str(100), inspector_note: str(255), year_of_establishment: day, msme_registration: str(100), msme_status: z.enum(['Micro', 'Small', 'Medium']).optional().nullable().or(z.literal('')).transform((v) => (v ? v : null)),
  management_representative: str(150), operation_representative: str(150), occupational_details: str(255),
  manpower_onroll: int, manpower_male: int, manpower_female: int, working_hours: str(1000), weekly_holiday: str(100), benefits: str(500), safety_officer: str(200), labour_welfare_officer: str(200),
  survey_number: str(100), land_total: str(100), constructed_area_sqm: dec, open_space_sqm: dec, compound_spacing: str(255),
  connected_hp: dec, transformer_kva: str(60), sanction_load_kva: str(60), surrender_load_kva: str(60), supply_demand_kva: str(60), electric_use_load_kva: str(60), electrical_load_units_day: dec,
  compressor_live: str(100), compressor_standby: str(100), boiler_capacity: str(100), boiler_steam_per_day: str(100), boiler_pressure: str(60), dg_capacity: str(150),
  units: z.array(z.object({ name, established: day })).max(50).default([]),
  departments: z.array(z.object({ name })).max(100).default([]),
  holidays: z.array(z.object({ name, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date') })).max(60).default([]),
  areas: z.array(z.object({ name, sqm: dec })).max(60).default([]),
  welfare: z.array(z.object({ name, value: str(120), note: str(300) })).max(40).default([]),
  treatment: z.array(z.object({ kind: z.enum(['STP', 'ETP', 'CETP', 'RO / ZLD', 'Other']), capacity: str(60), compliance: str(200), details: str(300) })).max(20).default([]),
  migrant: z.array(z.object({ state: z.string().trim().min(1).max(100), count: int })).max(40).default([]),
});

export type FactoryProfileInput = z.infer<typeof factoryProfileSchema>;
const LISTS = { units: 'units_json', departments: 'departments_json', holidays: 'holidays_json', areas: 'areas_json', welfare: 'welfare_json', treatment: 'treatment_json', migrant: 'migrant_json' } as const;
const SCALARS = ['occupiers', 'factory_licence_no', 'inspector_note', 'year_of_establishment', 'msme_registration', 'msme_status', 'management_representative', 'operation_representative', 'occupational_details',
  'manpower_onroll', 'manpower_male', 'manpower_female', 'working_hours', 'weekly_holiday', 'benefits', 'safety_officer', 'labour_welfare_officer', 'survey_number', 'land_total', 'constructed_area_sqm',
  'open_space_sqm', 'compound_spacing', 'connected_hp', 'transformer_kva', 'sanction_load_kva', 'surrender_load_kva', 'supply_demand_kva', 'electric_use_load_kva', 'electrical_load_units_day',
  'compressor_live', 'compressor_standby', 'boiler_capacity', 'boiler_steam_per_day', 'boiler_pressure', 'dg_capacity'] as const;

const parse = (value: unknown) => { try { return value ? JSON.parse(String(value)) : []; } catch { return []; } };
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));

/** The employer's identity block (from the employer record) plus its factory profile; a company with no profile yet gets the identity and empty lists. */
export async function getFactoryProfile(employerId: number) {
  const employer = await queryOne<RowDataPacket>(
    `SELECT id, company_name, employer_code, gst_number, pan_number, cin_number, industry_type, address_line_1, address_line_2, city, state, pincode, number_of_units, approximate_employee_count FROM employers WHERE id = ? AND deleted_at IS NULL`, [employerId]);
  if (!employer) fail('Company not found', 'NOT_FOUND');
  const row = await queryOne<RowDataPacket>('SELECT * FROM employer_factory_profiles WHERE employer_id = ?', [employerId]);
  const profile: Record<string, unknown> = {};
  for (const key of SCALARS) profile[key] = row ? (row[key] instanceof Date ? String(row[key]).slice(0, 10) : row[key] ?? null) : null;
  if (row?.year_of_establishment) profile.year_of_establishment = String(row.year_of_establishment).slice(0, 10);
  for (const [key, column] of Object.entries(LISTS)) profile[key] = row ? parse(row[column]) : [];
  for (const key of ['constructed_area_sqm', 'open_space_sqm', 'connected_hp', 'electrical_load_units_day', 'manpower_onroll', 'manpower_male', 'manpower_female']) profile[key] = num(profile[key]);
  const address = [employer!.address_line_1, employer!.address_line_2, [employer!.city, employer!.pincode].filter(Boolean).join(' - '), employer!.state].filter(Boolean).join(', ');
  return {
    exists: Boolean(row), updated_at: row?.updated_at ?? null,
    employer: { id: Number(employer!.id), name: String(employer!.company_name), code: employer!.employer_code ?? null, address, gst: employer!.gst_number ?? null, cin: employer!.cin_number ?? null, industry: employer!.industry_type ?? null },
    profile,
  };
}

export async function saveFactoryProfile(employerId: number, payload: unknown, userId: number) {
  if (!(await queryOne<RowDataPacket>('SELECT id FROM employers WHERE id = ? AND deleted_at IS NULL', [employerId]))) fail('Company not found', 'NOT_FOUND');
  const input = factoryProfileSchema.parse(payload);
  const scalarValues = SCALARS.map((key) => input[key] as unknown);
  const listValues = Object.keys(LISTS).map((key) => JSON.stringify(input[key as keyof typeof LISTS]));
  const columns = [...SCALARS, ...Object.values(LISTS)];
  await execute(
    `INSERT INTO employer_factory_profiles (employer_id, ${columns.join(', ')}, updated_by) VALUES (?, ${columns.map(() => '?').join(', ')}, ?)
     ON DUPLICATE KEY UPDATE ${columns.map((c) => `${c} = VALUES(${c})`).join(', ')}, updated_by = VALUES(updated_by)`,
    [employerId, ...scalarValues, ...listValues, userId]);
  return { employerId };
}
