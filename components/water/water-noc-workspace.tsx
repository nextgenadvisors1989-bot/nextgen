'use client';

/**
 * One groundwater NOC: its details, the conditions checklist, the water meters with their readings, and what the readings say
 * about how much water is really drawn each day against the approved quantity.
 * The Water auditor and administrator can change things; the company reads the same screen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Tabs } from '@/components/ui/tabs';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api, apiFetch, fieldErrors } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { UsageChart } from '@/components/water/usage-chart';
import {
  NOC_STATUS_TONE, USAGE_TONE, type ConditionState, type NocCondition, type NocDetail, type NocPanel, type WaterMeter,
} from '@/types/water';

const CONDITION_STATES: ConditionState[] = ['Not Checked', 'Compliant', 'Non-Compliant', 'Not Applicable'];
const METER_SOURCES = ['Borewell', 'Municipal', 'RO Feed', 'Canteen', 'Toilet', 'Guest House', 'Hydrant', 'Gardening', 'Boiler', 'Laboratory', 'Other'];

const num = (value: number | null | undefined, digits = 1) =>
  value === null || value === undefined ? '-' : Number(value).toLocaleString('en-IN', { maximumFractionDigits: digits });

export function WaterNocWorkspace({ nocId, panel }: { nocId: number; panel: NocPanel }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [detail, setDetail] = useState<NocDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const result = await api.get<NocDetail>(`/api/water-noc/${nocId}`);
    if (!result.ok || !result.data || !('noc' in result.data)) {
      setLoadError(result.message || 'The NOC could not be opened');
      return;
    }
    setLoadError(null);
    setDetail(result.data);
  }, [nocId]);
  useEffect(() => { void load(); }, [load]);

  if (loadError) return <Card><CardBody><EmptyState title="This NOC cannot be opened" subtitle={loadError} /></CardBody></Card>;
  if (!detail) return <Card><CardBody><p className="py-10 text-center text-sm text-ink-muted">Opening the NOC...</p></CardBody></Card>;

  const { noc, usage, conditions, can } = detail;
  const met = conditions.filter((condition) => condition.compliance === 'Compliant').length;
  const notMet = conditions.filter((condition) => condition.compliance === 'Non-Compliant').length;
  const percent = usage.recent.percent;

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={NOC_STATUS_TONE[noc.derived_status] ?? 'slate'}>{noc.derived_status}</Badge>
                <span className="font-mono text-xs text-ink-muted">{noc.noc_number}</span>
              </div>
              <h2 className="mt-2 text-xl font-semibold text-ink">{noc.title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{noc.employer_name}{noc.unit_name ? ` · ${noc.unit_name}` : ''}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {can.download && <a className="btn btn-outline btn-sm" href={`/api/pdf/water-noc/${noc.id}`} target="_blank" rel="noreferrer">Download PDF</a>}
              {detail.fileUrl && <a className="btn btn-outline btn-sm" href={detail.fileUrl} target="_blank" rel="noreferrer">View NOC letter</a>}
              {can.delete && <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)}>Delete NOC</Button>}
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Approved" value={`${num(Number(noc.approved_quantity_lpd) / 1000)} KLD`} hint={`${num(noc.approved_quantity_lpd, 0)} litres a day · ${noc.purpose}`} tone="brand" />
        <StatCard
          label="Drawn, last 30 days"
          value={usage.recent.days ? `${num(usage.recent.avgKld)} KLD` : 'No readings'}
          hint={percent === null ? 'Enter meter readings' : <><Badge tone={USAGE_TONE[usage.recent.status]}>{usage.recent.status}</Badge> <span className="ml-1">{percent.toFixed(0)}% of the limit</span></>}
          tone={usage.recent.status === 'Over limit' ? 'red' : usage.recent.status === 'Near limit' ? 'amber' : 'emerald'}
        />
        <StatCard label="Valid until" value={noc.expiry_date ? formatDate(noc.expiry_date) : '-'} hint={`Renewed every ${noc.renewal_cycle_years} years`} tone={noc.derived_status === 'Valid' ? 'emerald' : noc.derived_status === 'Expiring Soon' ? 'amber' : 'red'} />
        <StatCard label="Conditions met" value={`${met} / ${conditions.length}`} hint={notMet > 0 ? `${notMet} not met` : conditions.length ? 'No breach recorded' : 'No conditions added'} tone={notMet > 0 ? 'red' : 'emerald'} />
      </div>

      <Tabs
        defaultTab="overview"
        items={[
          { key: 'overview', label: 'NOC details', content: <OverviewTab detail={detail} onChanged={load} /> },
          { key: 'conditions', label: 'Conditions', badge: notMet > 0 ? <Badge tone="danger">{notMet}</Badge> : undefined, content: <ConditionsTab detail={detail} onChanged={load} /> },
          { key: 'meters', label: 'Meters & readings', content: <MetersTab detail={detail} onChanged={load} /> },
          { key: 'usage', label: 'Usage vs limit', content: <UsageTab detail={detail} /> },
        ]}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete this NOC?"
        message="The NOC, its conditions and its legal-register entry are removed. The meters and readings stay on record against the company."
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={async () => {
          setDeleting(true);
          const result = await api.delete(`/api/water-noc/${nocId}`);
          setDeleting(false);
          if (result.ok) { success('NOC deleted'); router.push(`/${panel}/water-noc`); } else errorToast('Could not delete it', result.message);
        }}
      />
    </div>
  );
}

/* ───────────────────────────── NOC details ───────────────────────────── */

const FIELDS = [
  'noc_number', 'issuing_authority', 'applied_on', 'issue_date', 'expiry_date', 'renewal_cycle_years', 'purpose', 'approved_quantity_lpd',
  'purpose_domestic_lpd', 'purpose_gardening_lpd', 'purpose_other_lpd', 'well_type', 'well_depth_m', 'well_diameter_in', 'pump_hp',
  'pumping_hours_per_day', 'abstraction_structures', 'notes',
] as const;

function OverviewTab({ detail, onChanged }: { detail: NocDetail; onChanged: () => void }) {
  const { success, error: errorToast } = useToast();
  const { noc, can } = detail;
  const original = useMemo(() => Object.fromEntries(FIELDS.map((key) => [key, (noc as unknown as Record<string, unknown>)[key] === null ? '' : String((noc as unknown as Record<string, unknown>)[key])])) as Record<string, string>, [noc]);
  const [draft, setDraft] = useState(original);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(original), [original]);
  const dirty = FIELDS.filter((key) => draft[key] !== original[key]);
  const set = (key: string) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const field = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key)(event.target.value);

  async function save() {
    setSaving(true);
    setErrors({});
    const body: Record<string, string | null> = {};
    dirty.forEach((key) => { body[key] = draft[key] === '' ? null : draft[key]; });
    const result = await api.patch(`/api/water-noc/${noc.id}`, body);
    setSaving(false);
    if (!result.ok) { setErrors(fieldErrors(result)); errorToast('Could not save', result.message); return; }
    success('NOC saved');
    onChanged();
  }

  async function uploadLetter(file: File | undefined) {
    if (!file) return;
    const body = new FormData();
    body.append('file', file);
    const result = await apiFetch(`/api/water-noc/${noc.id}/file`, { method: 'POST', body });
    if (result.ok) { success('NOC letter attached'); onChanged(); } else errorToast('Could not attach it', result.message);
  }

  if (!can.edit) {
    const row = (label: string, value: string | null | undefined) => (
      <div key={label}>
        <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
        <dd className="mt-0.5 whitespace-pre-line text-ink">{value || '-'}</dd>
      </div>
    );
    return (
      <Card padded={false}>
        <CardHeader title="NOC details" />
        <CardBody>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm md:grid-cols-3">
            {row('NOC number', noc.noc_number)}
            {row('Issuing authority', noc.issuing_authority)}
            {row('Purpose', noc.purpose)}
            {row('Applied on', noc.applied_on ? formatDate(noc.applied_on) : null)}
            {row('Issued on', noc.issue_date ? formatDate(noc.issue_date) : null)}
            {row('Valid until', noc.expiry_date ? formatDate(noc.expiry_date) : null)}
            {row('Approved quantity', `${num(noc.approved_quantity_lpd, 0)} litres a day`)}
            {row('Domestic / gardening / other (LPD)', [noc.purpose_domestic_lpd, noc.purpose_gardening_lpd, noc.purpose_other_lpd].map((v) => num(v, 0)).join(' / '))}
            {row('Well', [noc.well_type, noc.well_depth_m ? `${noc.well_depth_m} m deep` : null, noc.well_diameter_in ? `${noc.well_diameter_in} in` : null, noc.pump_hp ? `${noc.pump_hp} HP pump` : null].filter(Boolean).join(', '))}
            {row('Notes', noc.notes)}
          </dl>
        </CardBody>
      </Card>
    );
  }

  const split = ['purpose_domestic_lpd', 'purpose_gardening_lpd', 'purpose_other_lpd'].reduce((sum, key) => sum + (Number(draft[key]) || 0), 0);
  return (
    <Card padded={false}>
      <CardHeader
        title="NOC details"
        description="Changes here also update the entry in the Legal Register."
        action={dirty.length > 0 ? <Button size="sm" onClick={save} loading={saving}>Save details</Button> : undefined}
      />
      <CardBody className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Input label="NOC number" required value={draft.noc_number} onChange={field('noc_number')} error={errors.noc_number} />
          <Input label="Issuing authority" value={draft.issuing_authority} onChange={field('issuing_authority')} />
          <Input label="Purpose" value={draft.purpose} onChange={field('purpose')} placeholder="Domestic" />
          <DatePicker label="Applied on" value={draft.applied_on} onChange={set('applied_on')} />
          <DatePicker label="Issued on" value={draft.issue_date} onChange={set('issue_date')} error={errors.issue_date} />
          <DatePicker label="Valid until" value={draft.expiry_date} onChange={set('expiry_date')} error={errors.expiry_date} />
          <Input label="Renewal cycle (years)" type="number" min={1} max={10} value={draft.renewal_cycle_years} onChange={field('renewal_cycle_years')} />
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">Approved quantity</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Input label="Approved (litres a day)" required type="number" min={0} value={draft.approved_quantity_lpd} onChange={field('approved_quantity_lpd')} error={errors.approved_quantity_lpd} helper={`${num((Number(draft.approved_quantity_lpd) || 0) / 1000)} KLD`} />
            <Input label="Domestic (LPD)" type="number" min={0} value={draft.purpose_domestic_lpd} onChange={field('purpose_domestic_lpd')} error={errors.purpose_domestic_lpd} />
            <Input label="Gardening (LPD)" type="number" min={0} value={draft.purpose_gardening_lpd} onChange={field('purpose_gardening_lpd')} />
            <Input label="Other (LPD)" type="number" min={0} value={draft.purpose_other_lpd} onChange={field('purpose_other_lpd')} />
          </div>
          {split > 0 && <p className={`mt-1 text-xs ${split > (Number(draft.approved_quantity_lpd) || 0) ? 'text-red-600' : 'text-ink-muted'}`}>Purposes add up to {num(split, 0)} LPD.</p>}
        </div>
        <div>
          <h3 className="mb-3 text-sm font-semibold text-ink">Well</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
            <Input label="Type" value={draft.well_type} onChange={field('well_type')} />
            <Input label="Depth (m)" type="number" min={0} value={draft.well_depth_m} onChange={field('well_depth_m')} />
            <Input label="Diameter (in)" type="number" min={0} value={draft.well_diameter_in} onChange={field('well_diameter_in')} />
            <Input label="Pump (HP)" type="number" min={0} value={draft.pump_hp} onChange={field('pump_hp')} />
            <Input label="Pumping hours / day" type="number" min={0} max={24} value={draft.pumping_hours_per_day} onChange={field('pumping_hours_per_day')} />
            <Input label="Abstraction structures" type="number" min={0} value={draft.abstraction_structures} onChange={field('abstraction_structures')} />
          </div>
        </div>
        <Textarea label="Notes" rows={2} value={draft.notes} onChange={field('notes')} />

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <label htmlFor="noc-letter" className="btn btn-outline btn-sm cursor-pointer">{detail.fileUrl ? 'Replace the NOC letter' : 'Upload the NOC letter'}</label>
          <input id="noc-letter" type="file" accept=".pdf,image/png,image/jpeg" className="sr-only" onChange={(event) => { void uploadLetter(event.target.files?.[0]); event.target.value = ''; }} />
          {detail.fileUrl ? <a href={detail.fileUrl} target="_blank" rel="noreferrer" className="text-sm text-brand-600 hover:underline">Open the stored letter</a> : <span className="text-xs text-ink-muted">PDF, PNG or JPG. It is also filed in the Legal Register.</span>}
        </div>
      </CardBody>
    </Card>
  );
}

/* ───────────────────────────── conditions ───────────────────────────── */

function ConditionsTab({ detail, onChanged }: { detail: NocDetail; onChanged: () => void }) {
  const { success, error: errorToast } = useToast();
  const { conditions, can, noc } = detail;
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [clause, setClause] = useState('');
  const [busy, setBusy] = useState(false);
  const counts = CONDITION_STATES.map((state) => ({ state, total: conditions.filter((condition) => condition.compliance === state).length }));

  async function addStandard() {
    setBusy(true);
    const result = await api.post(`/api/water-noc/${noc.id}/conditions/standard`, {});
    setBusy(false);
    if (result.ok) { success('Standard conditions added'); onChanged(); } else errorToast('Could not add them', result.message);
  }

  async function addOne() {
    setBusy(true);
    const result = await api.post(`/api/water-noc/${noc.id}/conditions`, { condition_text: text, clause_no: clause || null });
    setBusy(false);
    if (result.ok) { success('Condition added'); setAdding(false); setText(''); setClause(''); onChanged(); } else errorToast('Could not add it', result.message);
  }

  return (
    <Card padded={false}>
      <CardHeader
        title="Conditions of the NOC"
        description={can.edit ? 'On each visit mark whether the company meets the condition and note what you saw.' : 'What the NOC requires, and whether the company was found to meet it.'}
        action={can.edit ? (
          <div className="flex flex-wrap gap-2">
            {conditions.length === 0 && <Button size="sm" variant="outline" onClick={addStandard} loading={busy}>Add the 18 standard conditions</Button>}
            <Button size="sm" onClick={() => setAdding(true)}>+ Add condition</Button>
          </div>
        ) : undefined}
      />
      {conditions.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 sm:px-6">
          {counts.map((item) => (
            <Badge key={item.state} tone={item.state === 'Compliant' ? 'success' : item.state === 'Non-Compliant' ? 'danger' : 'slate'}>{item.state}: {item.total}</Badge>
          ))}
        </div>
      )}
      {conditions.length === 0 ? (
        <CardBody><EmptyState title="No conditions recorded" subtitle={can.edit ? 'Add the standard NOC conditions, or write the ones printed on this NOC.' : 'The auditor has not recorded the NOC conditions yet.'} /></CardBody>
      ) : (
        <ol className="divide-y divide-line">
          {conditions.map((condition) => <ConditionRow key={condition.id} condition={condition} nocId={noc.id} canEdit={can.edit} onChanged={onChanged} />)}
        </ol>
      )}

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Add a condition"
        footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={addOne} loading={busy} disabled={text.trim().length < 5}>Add</Button></div>}
      >
        <div className="space-y-4">
          <Input label="Clause no. (optional)" value={clause} onChange={(event) => setClause(event.target.value)} placeholder="e.g. 19" />
          <Textarea label="Condition" rows={4} value={text} onChange={(event) => setText(event.target.value)} placeholder="As written on the NOC" />
        </div>
      </Modal>
    </Card>
  );
}

function ConditionRow({ condition, nocId, canEdit, onChanged }: { condition: NocCondition; nocId: number; canEdit: boolean; onChanged: () => void }) {
  const { success, error: errorToast } = useToast();
  const [remarks, setRemarks] = useState(condition.remarks ?? '');
  const [removing, setRemoving] = useState(false);
  useEffect(() => setRemarks(condition.remarks ?? ''), [condition.remarks]);

  async function patch(body: Record<string, unknown>, done: string) {
    const result = await api.patch(`/api/water-noc/${nocId}/conditions/${condition.id}`, body);
    if (result.ok) { success(done); onChanged(); } else errorToast('Could not save', result.message);
  }

  const tone = condition.compliance === 'Compliant' ? 'success' : condition.compliance === 'Non-Compliant' ? 'danger' : 'slate';
  return (
    <li className={`px-4 py-4 sm:px-6 ${condition.compliance === 'Non-Compliant' ? 'border-l-4 border-red-400 bg-red-50/40' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm text-ink">
          <span className="mr-2 font-semibold text-ink-muted">{condition.clause_no ?? '-'}.</span>{condition.condition_text}
        </p>
        {canEdit ? (
          <div className="flex items-center gap-2">
            <div className="w-44">
              <Select
                size="sm"
                options={CONDITION_STATES.map((state) => ({ value: state, label: state }))}
                value={condition.compliance}
                onChange={(value) => { if (value !== condition.compliance) void patch({ compliance: value }, 'Condition marked'); }}
              />
            </div>
            <button type="button" className="text-xs font-semibold text-red-600 hover:underline" onClick={() => setRemoving(true)}>Remove</button>
          </div>
        ) : (
          <Badge tone={tone}>{condition.compliance}</Badge>
        )}
      </div>
      {canEdit ? (
        <div className="mt-2">
          <input
            type="text"
            value={remarks}
            onChange={(event) => setRemarks(event.target.value)}
            onBlur={() => { if (remarks.trim() !== (condition.remarks ?? '').trim()) void patch({ remarks }, 'Remark saved'); }}
            placeholder="What you saw on the visit (optional)"
            aria-label="Remark"
            className="focus-ring h-9 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-400"
          />
        </div>
      ) : condition.remarks ? <p className="mt-1 text-sm text-ink-soft">{condition.remarks}</p> : null}
      {condition.checked_at && (
        <p className="mt-1 text-xs text-ink-muted">Checked {formatDateTime(condition.checked_at)}{condition.checked_by_name ? ` by ${condition.checked_by_name}` : ''}</p>
      )}
      <ConfirmDialog
        open={removing}
        onClose={() => setRemoving(false)}
        title="Remove this condition?"
        message="It is removed from this NOC's checklist."
        confirmLabel="Remove"
        onConfirm={async () => {
          const result = await api.delete(`/api/water-noc/${nocId}/conditions/${condition.id}`);
          setRemoving(false);
          if (result.ok) { success('Condition removed'); onChanged(); } else errorToast('Could not remove it', result.message);
        }}
      />
    </li>
  );
}

/* ───────────────────────────── meters and readings ───────────────────────────── */

function MetersTab({ detail, onChanged }: { detail: NocDetail; onChanged: () => void }) {
  const { success, error: errorToast } = useToast();
  const { meters, readings, can, noc } = detail;
  const [selectedId, setSelectedId] = useState<number | null>(meters[0]?.id ?? null);
  const [meterModal, setMeterModal] = useState<{ open: boolean; meter: WaterMeter | null }>({ open: false, meter: null });
  const [showAll, setShowAll] = useState(false);
  const [removing, setRemoving] = useState<WaterMeter | null>(null);
  useEffect(() => {
    if (!meters.some((meter) => meter.id === selectedId)) setSelectedId(meters[0]?.id ?? null);
  }, [meters, selectedId]);
  const selected = meters.find((meter) => meter.id === selectedId) ?? null;
  const rows = readings.filter((reading) => reading.meter_id === selectedId);
  const visible = showAll ? rows : rows.slice(0, 12);

  return (
    <div className="space-y-4">
      <Card padded={false}>
        <CardHeader
          title="Water meters"
          description="Readings are the cumulative figure on the meter. The system works out the litres drawn per day between two readings."
          action={can.edit ? <Button size="sm" onClick={() => setMeterModal({ open: true, meter: null })}>+ Add meter</Button> : undefined}
        />
        {meters.length === 0 ? (
          <CardBody><EmptyState title="No meters yet" subtitle={can.edit ? 'Add the borewell meter first. A meter that counts toward the NOC is what the approved quantity is checked against.' : 'The auditor has not added the water meters yet.'} /></CardBody>
        ) : (
          <ul className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
            {meters.map((meter) => (
              <li key={meter.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(meter.id)}
                  aria-pressed={meter.id === selectedId}
                  className={`w-full rounded-xl border p-4 text-left transition-colors ${meter.id === selectedId ? 'border-brand-400 bg-brand-50/60' : 'border-line bg-white hover:bg-surface-muted'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-ink">{meter.name}</span>
                    {meter.counts_toward_noc ? <Badge tone="brand">Counts toward NOC</Badge> : <Badge tone="slate">{meter.source}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    {meter.last_reading_date ? `Last reading ${num(meter.last_reading_value, 2)} ${meter.reading_unit} on ${formatDate(meter.last_reading_date)}` : 'No readings yet'}
                  </p>
                  <p className="mt-2 text-sm text-ink-soft">{num(meter.recentKl, 0)} KL in 30 days{meter.recentKld ? ` · ${num(meter.recentKld)} KLD` : ''}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {selected && (
        <Card padded={false}>
          <CardHeader
            title={`Readings: ${selected.name}`}
            description={`${selected.reading_count} reading(s). ${selected.counts_toward_noc ? 'These readings are checked against the approved quantity.' : 'These readings are kept for the water balance only.'}`}
            action={can.edit ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setMeterModal({ open: true, meter: selected })}>Edit meter</Button>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(selected)}>Remove meter</Button>
              </div>
            ) : undefined}
          />
          {can.edit && <ReadingForm nocId={noc.id} meter={selected} onSaved={onChanged} />}
          {rows.length === 0 ? (
            <CardBody><p className="text-sm text-ink-muted">No readings recorded for this meter.</p></CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base min-w-full">
                <thead>
                  <tr>
                    <th className="table-head">Date</th>
                    <th className="table-head text-right">Reading ({selected.reading_unit})</th>
                    <th className="table-head text-right">Since previous</th>
                    <th className="table-head">Remarks</th>
                    {can.edit && <th className="table-head text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {visible.map((reading, index) => {
                    const previous = rows[index + 1];
                    const difference = previous && !reading.is_reset ? Number(reading.reading_value) - Number(previous.reading_value) : null;
                    return (
                      <ReadingRow key={reading.id} reading={reading} difference={difference} unit={selected.reading_unit} nocId={noc.id} canEdit={can.edit} onChanged={onChanged} />
                    );
                  })}
                </tbody>
              </table>
              {rows.length > 12 && (
                <div className="border-t border-line px-4 py-3 text-center">
                  <button type="button" onClick={() => setShowAll(!showAll)} className="text-sm font-semibold text-brand-600 hover:underline">
                    {showAll ? 'Show the latest 12' : `Show all ${rows.length} readings`}
                  </button>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <MeterModal open={meterModal.open} meter={meterModal.meter} nocId={noc.id} onClose={() => setMeterModal({ open: false, meter: null })} onSaved={onChanged} />
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name ?? 'this meter'}?`}
        message="The meter and its readings leave this NOC. The water-drawn figures are recalculated."
        confirmLabel="Remove"
        onConfirm={async () => {
          if (!removing) return;
          const result = await api.delete(`/api/water-noc/${noc.id}/meters/${removing.id}`);
          setRemoving(null);
          if (result.ok) { success('Meter removed'); onChanged(); } else errorToast('Could not remove it', result.message);
        }}
      />
    </div>
  );
}

function ReadingForm({ nocId, meter, onSaved }: { nocId: number; meter: WaterMeter; onSaved: () => void }) {
  const { success, error: errorToast } = useToast();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ reading_date: today, reading_value: '', is_reset: false, remarks: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    const result = await api.post(`/api/water-noc/${nocId}/meters/${meter.id}/readings`, { ...form, remarks: form.remarks || null });
    setSaving(false);
    if (!result.ok) { setErrors(fieldErrors(result)); errorToast('Reading not saved', result.message); return; }
    success('Reading recorded');
    setForm({ ...form, reading_value: '', remarks: '', is_reset: false });
    onSaved();
  }

  return (
    <form onSubmit={save} className="grid grid-cols-1 items-start gap-4 border-b border-line px-4 py-4 sm:px-6 md:grid-cols-[170px_190px_1fr_auto]">
      <DatePicker label="Reading date" value={form.reading_date} onChange={(value) => setForm({ ...form, reading_date: value })} max={today} error={errors.reading_date} />
      <Input label={`Meter reading (${meter.reading_unit})`} type="number" min={0} step="0.01" required value={form.reading_value} onChange={(event) => setForm({ ...form, reading_value: event.target.value })} error={errors.reading_value} />
      <Input label="Remarks" value={form.remarks} onChange={(event) => setForm({ ...form, remarks: event.target.value })} placeholder="Optional" />
      <div className="flex items-center gap-3 md:pt-7">
        <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink-soft" title="Tick when the meter was replaced or rolled over, so the drop is not counted as negative use">
          <input type="checkbox" className="h-4 w-4 accent-brand-500" checked={form.is_reset} onChange={(event) => setForm({ ...form, is_reset: event.target.checked })} />
          Meter reset
        </label>
        <Button type="submit" loading={saving} disabled={form.reading_value === ''}>Add reading</Button>
      </div>
    </form>
  );
}

function ReadingRow({ reading, difference, unit, nocId, canEdit, onChanged }: {
  reading: NocDetail['readings'][number]; difference: number | null; unit: string; nocId: number; canEdit: boolean; onChanged: () => void;
}) {
  const { success, error: errorToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(reading.reading_value));
  const [remarks, setRemarks] = useState(reading.remarks ?? '');
  const [removing, setRemoving] = useState(false);

  async function save() {
    const result = await api.patch(`/api/water-noc/${nocId}/readings/${reading.id}`, { reading_value: value, remarks: remarks || null });
    if (result.ok) { success('Reading saved'); setEditing(false); onChanged(); } else errorToast('Could not save', result.message);
  }

  return (
    <tr>
      <td className="table-cell whitespace-nowrap">{formatDate(reading.reading_date)}</td>
      <td className="table-cell text-right">
        {editing ? <input type="number" step="0.01" value={value} onChange={(event) => setValue(event.target.value)} aria-label="Reading" className="focus-ring h-8 w-28 rounded border border-line px-2 text-right text-sm" /> : num(reading.reading_value, 2)}
        {reading.is_reset ? <Badge tone="warning" className="ml-2">Reset</Badge> : null}
      </td>
      <td className="table-cell text-right text-ink-soft">{difference === null ? '-' : `${num(difference, 2)} ${unit}`}</td>
      <td className="table-cell text-ink-soft">
        {editing ? <input value={remarks} onChange={(event) => setRemarks(event.target.value)} aria-label="Remarks" className="focus-ring h-8 w-full rounded border border-line px-2 text-sm" /> : reading.remarks ?? ''}
      </td>
      {canEdit && (
        <td className="table-cell text-right">
          {editing ? (
            <span className="flex items-center justify-end gap-2">
              <button type="button" onClick={save} className="text-xs font-semibold text-brand-600 hover:underline">Save</button>
              <button type="button" onClick={() => setEditing(false)} className="text-xs text-ink-muted hover:underline">Cancel</button>
            </span>
          ) : (
            <span className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-600 hover:underline">Edit</button>
              <button type="button" onClick={() => setRemoving(true)} className="text-xs font-semibold text-red-600 hover:underline">Delete</button>
            </span>
          )}
          <ConfirmDialog
            open={removing}
            onClose={() => setRemoving(false)}
            title="Delete this reading?"
            message="The water drawn between the neighbouring readings is recalculated."
            confirmLabel="Delete"
            onConfirm={async () => {
              const result = await api.delete(`/api/water-noc/${nocId}/readings/${reading.id}`);
              setRemoving(false);
              if (result.ok) { success('Reading deleted'); onChanged(); } else errorToast('Could not delete it', result.message);
            }}
          />
        </td>
      )}
    </tr>
  );
}

function MeterModal({ open, meter, nocId, onClose, onSaved }: { open: boolean; meter: WaterMeter | null; nocId: number; onClose: () => void; onSaved: () => void }) {
  const { success, error: errorToast } = useToast();
  const [form, setForm] = useState({ name: '', source: 'Borewell', reading_unit: 'KL', counts_toward_noc: true, status: 'active' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(meter
      ? { name: meter.name, source: meter.source, reading_unit: meter.reading_unit, counts_toward_noc: Boolean(meter.counts_toward_noc), status: meter.status }
      : { name: '', source: 'Borewell', reading_unit: 'KL', counts_toward_noc: true, status: 'active' });
  }, [open, meter]);

  async function save() {
    setSaving(true);
    setErrors({});
    const result = meter
      ? await api.patch(`/api/water-noc/${nocId}/meters/${meter.id}`, form)
      : await api.post(`/api/water-noc/${nocId}/meters`, form);
    setSaving(false);
    if (!result.ok) { setErrors(fieldErrors(result)); errorToast('Could not save the meter', result.message); return; }
    success(meter ? 'Meter saved' : 'Meter added');
    onClose();
    onSaved();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={meter ? 'Edit meter' : 'Add a water meter'}
      footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} loading={saving} disabled={form.name.trim().length < 2}>Save</Button></div>}
    >
      <div className="space-y-4">
        <Input label="Meter name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Borewell O/P (M1)" error={errors.name} />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Water source / use" options={METER_SOURCES.map((value) => ({ value, label: value }))} value={form.source} onChange={(value) => setForm({ ...form, source: value, counts_toward_noc: meter ? form.counts_toward_noc : value === 'Borewell' })} />
          <Select label="Reading unit" options={[{ value: 'KL', label: 'Kilolitres (KL)' }, { value: 'L', label: 'Litres (L)' }]} value={form.reading_unit} onChange={(value) => setForm({ ...form, reading_unit: value })} />
        </div>
        <label className="flex items-start gap-3 rounded-lg border border-line bg-surface-muted p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500" checked={form.counts_toward_noc} onChange={(event) => setForm({ ...form, counts_toward_noc: event.target.checked })} />
          <span><strong className="text-ink">Counts toward the NOC limit</strong><span className="block text-ink-muted">Tick for the meters that measure groundwater drawn from the NOC well. Uses of that water (canteen, toilets, RO feed) are kept for the water balance only.</span></span>
        </label>
        {meter && (
          <Select label="Status" options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive (ignored)' }]} value={form.status} onChange={(value) => setForm({ ...form, status: value as 'active' | 'inactive' })} />
        )}
      </div>
    </Modal>
  );
}

/* ───────────────────────────── usage ───────────────────────────── */

function UsageTab({ detail }: { detail: NocDetail }) {
  const { usage, noc } = detail;
  const approvedKld = Number(noc.approved_quantity_lpd) / 1000;
  return (
    <div className="space-y-4">
      <Card padded={false}>
        <CardHeader
          title="Water drawn against the approved quantity"
          description={usage.sourceMeters.length ? `From: ${usage.sourceMeters.join(', ')}` : 'No meter is marked as counting toward this NOC yet.'}
        />
        <CardBody>
          <UsageChart months={usage.months} approvedKld={approvedKld} />
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Month by month" description="Water between two readings is spread evenly over the days between them, so a month holds only the days that were measured." />
        {usage.months.length === 0 ? (
          <CardBody><p className="text-sm text-ink-muted">Two readings on the NOC meter are needed before any usage can be worked out.</p></CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base min-w-full">
              <thead>
                <tr>
                  <th className="table-head">Month</th>
                  <th className="table-head text-right">Days measured</th>
                  <th className="table-head text-right">Drawn (KL)</th>
                  <th className="table-head text-right">Average (KLD)</th>
                  <th className="table-head text-right">Of the limit</th>
                  <th className="table-head">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...usage.months].reverse().map((month) => (
                  <tr key={month.month}>
                    <td className="table-cell font-medium">{new Date(`${month.month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</td>
                    <td className="table-cell text-right">{month.days}</td>
                    <td className="table-cell text-right">{num(month.litres / 1000, 0)}</td>
                    <td className="table-cell text-right">{num(month.avgKld)}</td>
                    <td className="table-cell text-right">{month.percent === null ? '-' : `${month.percent.toFixed(0)}%`}</td>
                    <td className="table-cell"><Badge tone={USAGE_TONE[month.status]}>{month.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td className="table-cell font-semibold">Whole record</td>
                  <td className="table-cell text-right">{usage.overall.days}</td>
                  <td className="table-cell text-right">{num(usage.overall.litres / 1000, 0)}</td>
                  <td className="table-cell text-right font-semibold">{num(usage.overall.avgKld)}</td>
                  <td className="table-cell text-right">{usage.overall.percent === null ? '-' : `${usage.overall.percent.toFixed(0)}%`}</td>
                  <td className="table-cell"><Badge tone={USAGE_TONE[usage.overall.status]}>{usage.overall.status}</Badge></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
