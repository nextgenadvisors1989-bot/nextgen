'use client';

/**
 * The administrator's emission-factor register. Nothing is pre-filled: the client enters each factor from its own source (a published factor
 * list, a supplier certificate, a study), with the unit it is per, the year and geography it is valid for and who approved it. A factor counts in
 * the GHG calculation only when its status is "approved" and the record's date lies between "valid from" and "valid to".
 */
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { fmt, todayIso } from './dm-common';

interface Factor {
  id: number; ef_code: string; name: string; activity_key: string; scope: number; category: string; unit: string; factor: number; ncv: number | null; gases: string | null; gwp_basis: string | null;
  geography: string | null; source: string; source_year: number | null; version: string | null; valid_from: string; valid_to: string | null; data_quality: string | null; evidence: string | null; status: string; notes: string | null;
}
interface Activity { key: string; label: string; scope: number; unit: string }

const EMPTY = { ef_code: '', name: '', activity_key: '', scope: '1', category: '', unit: '', factor_kg_co2e: '', ncv_gj_per_unit: '', gases: '', gwp_basis: 'AR6', geography: 'India', source: '', source_year: '', version: '', valid_from: todayIso(), valid_to: '', data_quality: '', evidence: '', status: 'draft', notes: '' };
const INPUT = 'focus-ring h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-slate-500';

export function EmissionFactors({ canEdit }: { canEdit: boolean }) {
  const { success, error: errorToast } = useToast();
  const [factors, setFactors] = useState<Factor[] | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [editing, setEditing] = useState<{ id: number | null; form: Record<string, string> } | null>(null);
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const result = await api.get('/api/admin/data-management/factors');
    if (!result.ok) { errorToast(result.message); return; }
    const raw = result.raw as { factors: Factor[]; activities: Activity[] };
    setFactors(raw.factors);
    setActivities(raw.activities);
  }, [errorToast]);
  useEffect(() => { void load(); }, [load]);

  const open = (factor?: Factor) => {
    setIssues({});
    setEditing(factor
      ? { id: factor.id, form: { ef_code: factor.ef_code, name: factor.name, activity_key: factor.activity_key, scope: String(factor.scope), category: factor.category, unit: factor.unit, factor_kg_co2e: String(factor.factor), ncv_gj_per_unit: factor.ncv === null ? '' : String(factor.ncv), gases: factor.gases ?? '', gwp_basis: factor.gwp_basis ?? '', geography: factor.geography ?? '', source: factor.source, source_year: factor.source_year ? String(factor.source_year) : '', version: factor.version ?? '', valid_from: factor.valid_from, valid_to: factor.valid_to ?? '', data_quality: factor.data_quality ?? '', evidence: factor.evidence ?? '', status: factor.status, notes: factor.notes ?? '' } }
      : { id: null, form: { ...EMPTY } });
  };

  async function save() {
    if (!editing) return;
    setSaving(true);
    setIssues({});
    const result = editing.id ? await api.put(`/api/admin/data-management/factors/${editing.id}`, editing.form) : await api.post('/api/admin/data-management/factors', editing.form);
    setSaving(false);
    if (!result.ok) {
      const mapped: Record<string, string> = {};
      if (Array.isArray(result.errors)) for (const issue of result.errors) mapped[issue.field] = issue.message;
      setIssues(mapped);
      errorToast(result.message);
      return;
    }
    success(result.message);
    setEditing(null);
    void load();
  }
  async function remove(factor: Factor) {
    if (!window.confirm(`Remove the factor ${factor.ef_code}? Calculations that used it will no longer count that activity.`)) return;
    const result = await api.delete(`/api/admin/data-management/factors/${factor.id}`);
    if (!result.ok) { errorToast(result.message); return; }
    success(result.message);
    void load();
  }

  const set = (key: string, value: string) => setEditing((current) => (current ? { ...current, form: { ...current.form, [key]: value } } : current));
  const field = (key: string, label: string, props: { type?: string; hint?: string; required?: boolean; list?: string } = {}) => (
    <div>
      <label htmlFor={`ef-${key}`} className="label">{label}{props.required ? <span className="text-red-600"> *</span> : null}</label>
      <input id={`ef-${key}`} type={props.type ?? 'text'} step={props.type === 'number' ? 'any' : undefined} list={props.list} value={editing?.form[key] ?? ''} onChange={(event) => set(key, event.target.value)} className={INPUT} aria-invalid={Boolean(issues[key])} />
      {issues[key] ? <span className="mt-1 block text-xs text-red-600">{issues[key]}</span> : props.hint ? <span className="mt-1 block text-xs text-ink-muted">{props.hint}</span> : null}
    </div>
  );

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl text-sm text-ink-soft">
            <p>Each factor is <strong>kg CO2e per unit of activity</strong> (per litre of diesel, per kWh of grid electricity, per kg of waste landfilled ...). Enter the client's own official values with their source. <strong>Nothing is pre-filled</strong> and nothing is guessed: an activity with no approved factor is shown as “factor missing” and adds nothing to the totals.</p>
            <p className="mt-2">A factor is used when its status is <em>approved</em> and the date of the record lies from “valid from” to “valid to”. When a factor changes, add a new one that starts on the new date; the old one keeps counting for older records.</p>
          </div>
          {canEdit && <Button onClick={() => open()}>Add a factor</Button>}
        </div>
      </Card>
      <Card padded={false}>
        <div className="relative overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-2.5">Code</th><th className="px-3 py-2.5">Activity</th><th className="px-3 py-2.5">Scope</th><th className="px-3 py-2.5 text-right">kg CO2e per unit</th><th className="px-3 py-2.5">Valid</th><th className="px-3 py-2.5">Source</th><th className="px-3 py-2.5">Status</th><th className="px-3 py-2.5"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody className="divide-y divide-line">
              {(factors ?? []).map((f) => (
                <tr key={f.id} className="align-top hover:bg-surface-muted/60">
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold">{f.ef_code}</td>
                  <td className="px-3 py-2.5">{f.name}<span className="block font-mono text-xs text-ink-muted">{f.activity_key}</span></td>
                  <td className="px-3 py-2.5">{f.scope}<span className="block text-xs text-ink-muted">{f.category}</span></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmt(f.factor, 6)}<span className="block text-xs text-ink-muted">per {f.unit}</span></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">{f.valid_from}<br />{f.valid_to ? `to ${f.valid_to}` : 'open ended'}</td>
                  <td className="px-3 py-2.5 text-xs">{f.source}{f.source_year ? ` ${f.source_year}` : ''}{f.version ? ` (${f.version})` : ''}<span className="block text-ink-muted">{f.geography}</span></td>
                  <td className="px-3 py-2.5"><Badge tone={f.status === 'approved' ? 'success' : f.status === 'draft' ? 'warning' : 'slate'}>{f.status}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    {canEdit && <><button type="button" onClick={() => open(f)} className="focus-ring rounded px-2 py-1 text-sm font-medium text-brand-700 hover:underline">Edit</button><button type="button" onClick={() => void remove(f)} className="focus-ring rounded px-2 py-1 text-sm text-ink-muted hover:text-red-700 hover:underline">Remove</button></>}
                  </td>
                </tr>
              ))}
              {factors && factors.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-muted">No emission factors yet. Add the client's official factors; until then the GHG figures stay empty.</td></tr>}
              {!factors && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-muted">Loading…</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <Modal open onClose={() => setEditing(null)} size="xl" title={editing.id ? 'Edit the emission factor' : 'Add an emission factor'} description="From the client's own source; nothing is assumed."
          footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button onClick={() => void save()} loading={saving}>Save</Button></div>}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {field('ef_code', 'Factor code', { required: true, hint: 'Your own reference, for example EF-DSL-01' })}
            {field('name', 'Name', { required: true, hint: 'For example Diesel, stationary combustion' })}
            <div>
              <label htmlFor="ef-activity_key" className="label">Activity it applies to <span className="text-red-600">*</span></label>
              <input id="ef-activity_key" list="ef-activities" value={editing.form.activity_key} onChange={(event) => { set('activity_key', event.target.value); const hit = activities.find((a) => a.key === event.target.value); if (hit) { set('scope', String(hit.scope)); if (!editing.form.unit) set('unit', hit.unit); } }} className={INPUT} aria-invalid={Boolean(issues.activity_key)} />
              <datalist id="ef-activities">{activities.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}</datalist>
              {issues.activity_key ? <span className="mt-1 block text-xs text-red-600">{issues.activity_key}</span> : <span className="mt-1 block text-xs text-ink-muted">Pick from the list, or type kind:name (for example material:cotton-yarn)</span>}
            </div>
            <div>
              <label htmlFor="ef-scope" className="label">Scope <span className="text-red-600">*</span></label>
              <select id="ef-scope" value={editing.form.scope} onChange={(event) => set('scope', event.target.value)} className={INPUT}><option value="1">Scope 1 — direct</option><option value="2">Scope 2 — purchased energy</option><option value="3">Scope 3 — other indirect</option></select>
              {issues.scope && <span className="mt-1 block text-xs text-red-600">{issues.scope}</span>}
            </div>
            {field('category', 'Category', { required: true, hint: 'For example Stationary combustion' })}
            {field('unit', 'The factor is per (unit)', { required: true, hint: 'L, kg, kWh, SCM, tonne-km, MT ... must match the unit of the records' })}
            {field('factor_kg_co2e', 'Factor (kg CO2e per unit)', { type: 'number', required: true })}
            {field('ncv_gj_per_unit', 'Net calorific value (GJ per unit)', { type: 'number', hint: 'Optional, for energy in GJ' })}
            {field('gases', 'Gases included', { hint: 'CO2, CH4, N2O ...' })}
            {field('gwp_basis', 'GWP basis', { hint: 'AR4, AR5 or AR6' })}
            {field('geography', 'Geography')}
            {field('source', 'Source', { required: true, hint: 'Publisher and document' })}
            {field('source_year', 'Source year', { type: 'number' })}
            {field('version', 'Version')}
            {field('valid_from', 'Valid from', { type: 'date', required: true })}
            {field('valid_to', 'Valid to', { type: 'date', hint: 'Leave empty if it has no end date' })}
            {field('data_quality', 'Data quality', { hint: 'For example Published, Supplier-specific, Estimate' })}
            {field('evidence', 'Evidence reference')}
            <div>
              <label htmlFor="ef-status" className="label">Status</label>
              <select id="ef-status" value={editing.form.status} onChange={(event) => set('status', event.target.value)} className={INPUT}><option value="draft">Draft — not used yet</option><option value="approved">Approved — used in the calculation</option><option value="retired">Retired — no longer used</option></select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label htmlFor="ef-notes" className="label">Notes</label>
              <textarea id="ef-notes" rows={2} value={editing.form.notes} onChange={(event) => set('notes', event.target.value)} className="focus-ring w-full rounded-lg border border-line px-3 py-2 text-sm" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
