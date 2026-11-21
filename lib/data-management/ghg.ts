/**
 * GHG engine: Scope 1, 2 and the applicable Scope 3 emissions from the records of the other registers.
 *
 *   emissions = activity data x emission factor      (kg CO2e)       total = Scope 1 + Scope 2 + Scope 3
 *
 * There are NO built-in emission factors. A factor is used only when the administrator has entered it (and approved it) in the emission-factor
 * register, for the right fuel / activity, geography, year and boundary; an activity with no factor is listed as "factor missing" and adds nothing,
 * so the figures are never based on a number nobody can name the source of.
 *
 * Counting rules (so nothing is counted twice):
 *   - fuel burnt in boilers, DG sets and other equipment (ENR-02)             -> Scope 1, stationary combustion
 *   - fuel of the company's own vehicles (TRN-01 / TRN-02, vehicle = Own)     -> Scope 1, mobile combustion (it is not also taken from ENR-02)
 *   - hired vehicles (vehicle = Hired)                                        -> Scope 3 transport: their fuel if given and a fuel factor exists, otherwise tonne-km
 *   - grid electricity (ENR-01)                                               -> Scope 2
 *   - waste sent out (WST-04) by treatment method                             -> Scope 3 waste
 *   - purchased materials (PUR-01), only for materials that have a factor     -> Scope 3 purchased goods
 *   - refrigerants, process, steam, commuting, business travel (GHG-01)       -> by the scope of the factor chosen
 */
import type { RollRow } from './calc';

export interface EmissionFactor {
  id: number; ef_code: string; name: string; activity_key: string; scope: number; category: string; unit: string; factor: number; ncv: number | null;
  source: string; source_year: number | null; version: string | null; valid_from: string; valid_to: string | null; status: string; geography: string | null;
}

export interface GhgLine {
  month: string; scope: 1 | 2 | 3; category: string; activity: string; quantity: number; unit: string;
  ef_code: string | null; factor: number | null; factor_unit: string | null; source: string | null; kg_co2e: number | null; note: string | null;
}

export interface GhgResult {
  lines: GhgLine[];
  scopeKg: { 1: number; 2: number; 3: number };
  totalKg: number;
  byMonth: { month: string; s1: number; s2: number; s3: number; total: number }[];
  missing: { key: string; activity: string; quantity: number; unit: string }[];
  mismatched: { activity: string; unit: string; factor_unit: string; ef_code: string }[];
  notes: string[];
}

export const FUEL_UNIT: Record<string, string> = { Diesel: 'L', Petrol: 'L', LPG: 'kg', PNG: 'SCM', 'Furnace oil': 'L', Biomass: 'kg', Coal: 'kg', Other: '' };
const fuelKey = (fuel: string) => `fuel:${fuel.toLowerCase().replace(/\s+/g, '-')}`;
const slug = (value: string) => value.toLowerCase().trim().replace(/\s+/g, '-');

export interface Sources {
  'ENR-01': RollRow[]; 'ENR-02': RollRow[]; 'TRN-01': RollRow[]; 'TRN-02': RollRow[]; 'WST-04': RollRow[]; 'PUR-01': RollRow[]; 'GHG-01': RollRow[];
}

interface Activity { date: string; scope: 1 | 2 | 3; category: string; activity: string; key: string; quantity: number; unit: string; efCode?: string }

const num = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function collectActivities(src: Sources, factors: EmissionFactor[]): Activity[] {
  const out: Activity[] = [];
  for (const row of src['ENR-02']) {
    const fuel = String(row.data.fuel ?? '');
    const consumed = num(row.data.consumed);
    if (!fuel || consumed === null || consumed <= 0) continue;
    out.push({ date: row.entry_date, scope: 1, category: 'Stationary combustion', activity: `${fuel} (${String(row.data.purpose ?? 'equipment')})`, key: fuelKey(fuel), quantity: consumed, unit: FUEL_UNIT[fuel] ?? '' });
  }
  for (const row of src['ENR-01']) {
    const consumption = num(row.data.consumption);
    const solar = num(row.data.solar_kwh) ?? 0;
    const dg = num(row.data.dg_kwh) ?? 0;
    const renewable = num(row.data.renewable_kwh) ?? 0;
    const grid = num(row.data.grid_kwh) ?? (consumption !== null ? Math.max(consumption - solar - dg - renewable, 0) : null);
    if (grid === null || grid <= 0) continue;
    out.push({ date: row.entry_date, scope: 2, category: 'Purchased electricity', activity: 'Grid electricity', key: 'electricity:grid', quantity: grid, unit: 'kWh' });
  }
  for (const code of ['TRN-01', 'TRN-02'] as const) {
    for (const row of src[code]) {
      const own = row.data.ownership === 'Own';
      const fuel = String(row.data.fuel_type ?? '');
      const fuelQty = num(row.data.fuel_l);
      const tonneKm = num(row.data.tonne_km);
      const direction = code === 'TRN-01' ? 'inbound' : 'outbound';
      if (own) {
        if (fuel && fuelQty && fuelQty > 0) {
          if (fuel === 'Electric') out.push({ date: row.entry_date, scope: 2, category: 'Purchased electricity', activity: 'Electric vehicles (own)', key: 'electricity:grid', quantity: fuelQty, unit: 'kWh' });
          else out.push({ date: row.entry_date, scope: 1, category: 'Mobile combustion (own vehicles)', activity: `${fuel}, ${direction} transport`, key: fuelKey(fuel), quantity: fuelQty, unit: 'L' });
        }
      } else {
        const hasFuelFactor = fuel && fuelQty && fuelQty > 0 && factors.some((f) => f.activity_key === fuelKey(fuel));
        if (hasFuelFactor) out.push({ date: row.entry_date, scope: 3, category: `Transportation (hired, ${direction})`, activity: `${fuel} of hired vehicles`, key: fuelKey(fuel), quantity: fuelQty as number, unit: 'L' });
        else if (tonneKm && tonneKm > 0) out.push({ date: row.entry_date, scope: 3, category: `Transportation (hired, ${direction})`, activity: 'Hired transport work', key: 'transport:hired', quantity: tonneKm, unit: 'tonne-km' });
      }
    }
  }
  for (const row of src['WST-04']) {
    const qty = num(row.data.qty_kg);
    const method = String(row.data.method ?? '');
    if (qty && qty > 0 && method) out.push({ date: row.entry_date, scope: 3, category: 'Waste disposal', activity: `${String(row.data.waste_type ?? 'Waste')} - ${method}`, key: `waste:${slug(method)}`, quantity: qty, unit: 'kg' });
  }
  const materialKeys = new Set(factors.filter((f) => f.activity_key.startsWith('material:')).map((f) => f.activity_key));
  if (materialKeys.size) {
    for (const row of src['PUR-01']) {
      const material = String(row.data.material ?? '');
      const key = `material:${slug(material)}`;
      const net = num(row.data.net_qty);
      const uom = row.data.uom;
      if (!material || !net || !materialKeys.has(key) || (uom !== 'kg' && uom !== 'MT')) continue;
      out.push({ date: row.entry_date, scope: 3, category: 'Purchased goods and services', activity: material, key, quantity: uom === 'MT' ? net * 1000 : net, unit: 'kg' });
    }
  }
  for (const row of src['GHG-01']) {
    const qty = num(row.data.quantity);
    const efCode = String(row.data.ef_code ?? '');
    const factor = factors.find((f) => f.ef_code === efCode);
    if (!qty || qty <= 0 || !efCode) continue;
    out.push({ date: row.entry_date, scope: (factor?.scope ?? 3) as 1 | 2 | 3, category: String(row.data.activity ?? 'Other'), activity: factor?.name ?? efCode, key: factor?.activity_key ?? `ef:${efCode}`, quantity: qty, unit: factor?.unit ?? '', efCode });
  }
  return out;
}

/** The approved factor for an activity on a date: the latest one valid on that day. */
export function findFactor(factors: EmissionFactor[], key: string, date: string, efCode?: string): EmissionFactor | null {
  const approved = factors.filter((f) => f.status === 'approved' && (efCode ? f.ef_code === efCode : f.activity_key === key) && f.valid_from <= date && (!f.valid_to || f.valid_to >= date));
  approved.sort((a, b) => (a.valid_from < b.valid_from ? 1 : -1));
  return approved[0] ?? null;
}

function convert(quantity: number, unit: string, factorUnit: string): number | null {
  const a = unit.toLowerCase();
  const b = factorUnit.toLowerCase();
  if (a === b) return quantity;
  if (a === 'kg' && b === 'mt') return quantity / 1000;
  if (a === 'mt' && b === 'kg') return quantity * 1000;
  if (a === 'l' && b === 'kl') return quantity / 1000;
  if (a === 'kl' && b === 'l') return quantity * 1000;
  return null;
}

export function calculateGhg(src: Sources, factors: EmissionFactor[]): GhgResult {
  const activities = collectActivities(src, factors);
  const grouped = new Map<string, GhgLine>();
  const missing = new Map<string, { key: string; activity: string; quantity: number; unit: string }>();
  const mismatched = new Map<string, { activity: string; unit: string; factor_unit: string; ef_code: string }>();

  for (const item of activities) {
    const factor = findFactor(factors, item.key, item.date, item.efCode);
    const month = item.date.slice(0, 7);
    let kg: number | null = null;
    let note: string | null = null;
    if (!factor) {
      note = 'No approved emission factor for this activity and date';
      const m = missing.get(item.key) ?? { key: item.key, activity: item.activity, quantity: 0, unit: item.unit };
      m.quantity += item.quantity;
      missing.set(item.key, m);
    } else {
      const qty = convert(item.quantity, item.unit || factor.unit, factor.unit);
      if (qty === null) {
        note = `Factor ${factor.ef_code} is per ${factor.unit}, the records are in ${item.unit}`;
        mismatched.set(`${item.key}|${factor.ef_code}`, { activity: item.activity, unit: item.unit, factor_unit: factor.unit, ef_code: factor.ef_code });
      } else {
        kg = qty * factor.factor;
      }
    }
    const id = `${month}|${item.scope}|${item.category}|${item.activity}|${factor?.ef_code ?? ''}`;
    const line = grouped.get(id) ?? { month, scope: item.scope, category: item.category, activity: item.activity, quantity: 0, unit: item.unit, ef_code: factor?.ef_code ?? null,
      factor: factor?.factor ?? null, factor_unit: factor?.unit ?? null, source: factor ? `${factor.source}${factor.source_year ? ` ${factor.source_year}` : ''}${factor.version ? ` (${factor.version})` : ''}` : null, kg_co2e: null, note };
    line.quantity += item.quantity;
    if (kg !== null) line.kg_co2e = (line.kg_co2e ?? 0) + kg;
    grouped.set(id, line);
  }

  const lines = [...grouped.values()].sort((a, b) => (a.month === b.month ? a.scope - b.scope : a.month < b.month ? -1 : 1))
    .map((line) => ({ ...line, quantity: Math.round(line.quantity * 1000) / 1000, kg_co2e: line.kg_co2e === null ? null : Math.round(line.kg_co2e * 1000) / 1000 }));
  const scopeKg = { 1: 0, 2: 0, 3: 0 };
  const months = new Map<string, { month: string; s1: number; s2: number; s3: number; total: number }>();
  for (const line of lines) {
    if (line.kg_co2e === null) continue;
    scopeKg[line.scope] += line.kg_co2e;
    const m = months.get(line.month) ?? { month: line.month, s1: 0, s2: 0, s3: 0, total: 0 };
    m[`s${line.scope}` as 's1' | 's2' | 's3'] += line.kg_co2e;
    m.total += line.kg_co2e;
    months.set(line.month, m);
  }
  const notes: string[] = [];
  if (!factors.some((f) => f.status === 'approved')) notes.push('No emission factor has been approved yet, so no emissions can be calculated. The administrator enters them in Data Management → Emission factors.');
  return {
    lines, scopeKg, totalKg: scopeKg[1] + scopeKg[2] + scopeKg[3],
    byMonth: [...months.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
    missing: [...missing.values()], mismatched: [...mismatched.values()], notes,
  };
}
