'use client';

/**
 * The Factory Profile of a company, in the sections of the client's sheet. Read-only until "Edit"; the repeating lists (units, departments, holidays, areas,
 * welfare, treatment plants, migrant workers) add and remove rows. Used by the employer for its own profile and by an administrator for any company.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/loader';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';

type Profile = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Loaded { exists: boolean; updated_at: string | null; employer: { id: number; name: string; code: string | null; address: string; gst: string | null; cin: string | null; industry: string | null }; profile: Profile }

const TREATMENT = ['STP', 'ETP', 'CETP', 'RO / ZLD', 'Other'];
const text = (value: unknown) => (value === null || value === undefined || value === '' ? '' : String(value));

export function FactoryProfile({ endpoint }: { endpoint: string }) {
  const toast = useToast();
  const [data, setData] = useState<Loaded | null>(null);
  const [form, setForm] = useState<Profile>({});
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const response = await api.get<Loaded>(endpoint);
    if (response.ok && response.data) { setData(response.data); setForm(response.data.profile); } else toast.error(response.message);
    setLoading(false);
  }, [endpoint, toast]);
  useEffect(() => { void load(); }, [load]);

  const set = (key: string) => (event: { target: { value: string } }) => setForm((c) => ({ ...c, [key]: event.target.value }));
  const lock = !editing;
  const field = (key: string, label: string, props: { type?: string; helper?: string } = {}) => (
    <Input label={label} type={props.type} value={text(form[key])} onChange={set(key)} disabled={lock} error={errors[key]} helper={props.helper} />
  );

  const list = (key: string) => (form[key] as Record<string, any>[] | undefined) ?? []; // eslint-disable-line @typescript-eslint/no-explicit-any
  const setRow = (key: string, index: number, patch: Record<string, unknown>) => setForm((c) => ({ ...c, [key]: list(key).map((r, i) => (i === index ? { ...r, ...patch } : r)) }));
  const addRow = (key: string, row: Record<string, unknown>) => setForm((c) => ({ ...c, [key]: [...list(key), row] }));
  const removeRow = (key: string, index: number) => setForm((c) => ({ ...c, [key]: list(key).filter((_, i) => i !== index) }));
  const err = (key: string, index: number, column: string) => errors[`${key}.${index}.${column}`];

  async function save() {
    setBusy(true);
    setErrors({});
    const response = await api.put<Loaded>(endpoint, form);
    setBusy(false);
    if (!response.ok) { setErrors(fieldErrors(response)); toast.error(response.message); return; }
    toast.success(response.message);
    setEditing(false);
    if (response.data) { setData(response.data); setForm(response.data.profile); }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  if (!data) return null;
  const { employer } = data;

  /** One repeating list: a heading, its rows with the given inputs, and Add. */
  const rows = (key: string, title: string, blank: Record<string, unknown>, cells: (row: Record<string, any>, i: number) => React.ReactNode, hint?: string) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
    <Card padded={false}>
      <CardHeader title={title} description={hint} action={editing ? <Button size="sm" variant="outline" onClick={() => addRow(key, blank)}>Add row</Button> : undefined} />
      <CardBody className="space-y-3">
        {list(key).length === 0 && <p className="text-sm text-ink-muted">Nothing recorded.</p>}
        {list(key).map((row, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="grid flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{cells(row, i)}</div>
            {editing && <Button size="sm" variant="ghost" onClick={() => removeRow(key, i)} aria-label={`Remove row ${i + 1}`}>Remove</Button>}
          </div>
        ))}
      </CardBody>
    </Card>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{employer.name}</h2>
          <p className="text-sm text-ink-muted">{employer.address || 'No address on file'}</p>
          <p className="mt-1 text-xs text-ink-muted">{[employer.code && `Code ${employer.code}`, employer.gst && `GSTIN ${employer.gst}`, employer.cin && `CIN ${employer.cin}`, employer.industry].filter(Boolean).join('  ·  ')}</p>
          {data.updated_at && <p className="mt-1 text-xs text-ink-muted">Last updated {formatDate(data.updated_at)}</p>}
        </div>
        <div className="flex gap-2">
          {editing ? <><Button variant="ghost" onClick={() => { setEditing(false); setErrors({}); setForm(data.profile); }}>Cancel</Button><Button onClick={save} loading={busy}>Save profile</Button></> : <Button onClick={() => setEditing(true)}>{data.exists ? 'Edit profile' : 'Fill in the profile'}</Button>}
        </div>
      </div>
      {!data.exists && !editing && <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">No factory profile has been recorded for this company yet.</p>}

      <Card padded={false}><CardHeader title="Identity and licences" description="Name, address, GSTIN and company registration come from the company record." />
        <CardBody className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Textarea label="Name of the occupier(s)" rows={2} value={text(form.occupiers)} onChange={set('occupiers')} disabled={lock} error={errors.occupiers} /></div>
          {field('factory_licence_no', 'Factory licence no.')}{field('inspector_note', 'Number and proceeding of the Inspector')}
          {field('year_of_establishment', 'Year of establishment', { type: 'date' })}{field('msme_registration', 'MSME registration (Udyam)')}
          <Select label="MSME status" value={text(form.msme_status)} onChange={(v) => setForm((c) => ({ ...c, msme_status: v }))} disabled={lock} clearable placeholder="Not set" options={['Micro', 'Small', 'Medium'].map((v) => ({ value: v, label: v }))} />
          {field('occupational_details', 'Occupational details / industry')}
          {field('management_representative', 'Management representative')}{field('operation_representative', 'Factory operation representative')}
          {field('safety_officer', 'Safety officer (name and registration)')}{field('labour_welfare_officer', 'Labour welfare officer')}
        </CardBody></Card>

      <Card padded={false}><CardHeader title="People and working pattern" />
        <CardBody className="grid gap-3 md:grid-cols-3">
          {field('manpower_onroll', 'Manpower on roll', { type: 'number' })}{field('manpower_male', 'Male', { type: 'number' })}{field('manpower_female', 'Female', { type: 'number' })}
          <div className="md:col-span-3"><Textarea label="Working hours and shift timings" rows={2} value={text(form.working_hours)} onChange={set('working_hours')} disabled={lock} error={errors.working_hours} /></div>
          {field('weekly_holiday', 'Weekly holiday')}<div className="md:col-span-2">{field('benefits', 'Benefits (OT, ESI, PF, compensation, medical, welfare ...)')}</div>
        </CardBody></Card>

      {rows('migrant', 'Migrant workers, state-wise', { state: '', count: '' }, (r, i) => (<><Input label="State" value={text(r.state)} onChange={(e) => setRow('migrant', i, { state: e.target.value })} disabled={lock} error={err('migrant', i, 'state')} />
        <Input label="Workers" type="number" value={text(r.count)} onChange={(e) => setRow('migrant', i, { count: e.target.value })} disabled={lock} /></>))}
      {rows('units', 'Units of the establishment', { name: '', established: '' }, (r, i) => (<><Input label="Unit name" value={text(r.name)} onChange={(e) => setRow('units', i, { name: e.target.value })} disabled={lock} error={err('units', i, 'name')} />
        <Input label="Established" type="date" value={text(r.established)} onChange={(e) => setRow('units', i, { established: e.target.value })} disabled={lock} /></>))}
      {rows('departments', 'Departments', { name: '' }, (r, i) => <Input label="Department / wing" value={text(r.name)} onChange={(e) => setRow('departments', i, { name: e.target.value })} disabled={lock} error={err('departments', i, 'name')} />)}
      {rows('holidays', 'National and festival holidays', { name: '', date: '' }, (r, i) => (<><Input label="Holiday" value={text(r.name)} onChange={(e) => setRow('holidays', i, { name: e.target.value })} disabled={lock} error={err('holidays', i, 'name')} />
        <Input label="Date" type="date" value={text(r.date)} onChange={(e) => setRow('holidays', i, { date: e.target.value })} disabled={lock} error={err('holidays', i, 'date')} /></>), 'As declared under the Tamil Nadu Industrial Establishments (National and Festival Holidays) Act, 1958.')}

      <Card padded={false}><CardHeader title="Land and building" />
        <CardBody className="grid gap-3 md:grid-cols-3">
          {field('survey_number', 'Survey number')}{field('land_total', 'Factory land (total)')}{field('constructed_area_sqm', 'Constructed area (sq.m)', { type: 'number' })}
          {field('open_space_sqm', 'Open space (sq.m)', { type: 'number' })}<div className="md:col-span-2">{field('compound_spacing', 'Spacing between compound wall (N / E / W / S)')}</div>
        </CardBody></Card>
      {rows('areas', 'Area of the factory set-up', { name: '', sqm: '' }, (r, i) => (<><Input label="Area" value={text(r.name)} onChange={(e) => setRow('areas', i, { name: e.target.value })} disabled={lock} error={err('areas', i, 'name')} />
        <Input label="Sq. metres" type="number" value={text(r.sqm)} onChange={(e) => setRow('areas', i, { sqm: e.target.value })} disabled={lock} /></>))}
      {rows('welfare', 'Welfare facilities', { name: '', value: '', note: '' }, (r, i) => (<><Input label="Facility" value={text(r.name)} onChange={(e) => setRow('welfare', i, { name: e.target.value })} disabled={lock} error={err('welfare', i, 'name')} />
        <Input label="Area / number" value={text(r.value)} onChange={(e) => setRow('welfare', i, { value: e.target.value })} disabled={lock} /><Input label="Note (e.g. section of the Factories Act)" value={text(r.note)} onChange={(e) => setRow('welfare', i, { note: e.target.value })} disabled={lock} /></>))}
      {rows('treatment', 'Treatment plants', { kind: 'ETP', capacity: '', compliance: '', details: '' }, (r, i) => (<><Select label="Plant" value={text(r.kind)} onChange={(v) => setRow('treatment', i, { kind: v })} disabled={lock} options={TREATMENT.map((v) => ({ value: v, label: v }))} />
        <Input label="Capacity" value={text(r.capacity)} onChange={(e) => setRow('treatment', i, { capacity: e.target.value })} disabled={lock} /><Input label="Statutory compliance" value={text(r.compliance)} onChange={(e) => setRow('treatment', i, { compliance: e.target.value })} disabled={lock} />
        <Input label="Dimensions / cost / HP" value={text(r.details)} onChange={(e) => setRow('treatment', i, { details: e.target.value })} disabled={lock} /></>))}

      <Card padded={false}><CardHeader title="Power, boiler and compressors" />
        <CardBody className="grid gap-3 md:grid-cols-3">
          {field('connected_hp', 'Connected HP', { type: 'number' })}{field('transformer_kva', 'Transformer (HT) capacity')}{field('sanction_load_kva', 'Sanction load')}
          {field('surrender_load_kva', 'Surrender load')}{field('supply_demand_kva', 'Supply demand')}{field('electric_use_load_kva', 'Electric use load')}
          {field('electrical_load_units_day', 'Electrical load (units / kWh per day, average)', { type: 'number' })}{field('compressor_live', 'Compressor - live')}{field('compressor_standby', 'Compressor - standby')}
          {field('boiler_capacity', 'Boiler capacity')}{field('boiler_steam_per_day', 'Steam production (per day average)')}{field('boiler_pressure', 'Boiler pressure')}
          {field('dg_capacity', 'DG capacity')}
        </CardBody></Card>

      {editing && <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => { setEditing(false); setErrors({}); setForm(data.profile); }}>Cancel</Button><Button onClick={save} loading={busy}>Save profile</Button></div>}
    </div>
  );
}
