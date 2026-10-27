'use client';

/**
 * "Record a groundwater NOC": the company, the NOC number and authority, the validity, the approved quantity in litres a
 * day (split by purpose) and the well. The standard 18 NOC conditions can be added in the same step, ready to tick on a visit.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';

interface Option { value: string; label: string; hint?: string }

async function lookup(type: string, extra = ''): Promise<Option[]> {
  const result = await api.get<Option[]>(`/api/water-noc/lookups?type=${type}${extra}`);
  return result.ok && Array.isArray(result.data) ? result.data : [];
}

const EMPTY = {
  employer_id: '', unit_id: '', noc_number: '', issuing_authority: '', issue_date: '', expiry_date: '', approved_quantity_lpd: '',
  purpose: 'Domestic', purpose_domestic_lpd: '', purpose_gardening_lpd: '', purpose_other_lpd: '',
  well_type: 'Bore well', well_depth_m: '', well_diameter_in: '', pump_hp: '', pumping_hours_per_day: '',
};

export function WaterNocCreateModal({ open, onClose, panel }: { open: boolean; onClose: () => void; panel: 'admin' | 'auditor' }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [employers, setEmployers] = useState<Option[]>([]);
  const [units, setUnits] = useState<Option[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [withConditions, setWithConditions] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) void lookup('employers').then(setEmployers); }, [open]);
  useEffect(() => {
    setUnits([]);
    if (form.employer_id) void lookup('units', `&employerId=${form.employer_id}`).then(setUnits);
  }, [form.employer_id]);

  const set = (field: keyof typeof EMPTY) => (value: string) => setForm((current) => ({ ...current, [field]: value }));
  const text = (field: keyof typeof EMPTY) => (event: React.ChangeEvent<HTMLInputElement>) => set(field)(event.target.value);
  const split = ['purpose_domestic_lpd', 'purpose_gardening_lpd', 'purpose_other_lpd'].reduce((sum, key) => sum + (Number(form[key as keyof typeof EMPTY]) || 0), 0);
  const approved = Number(form.approved_quantity_lpd) || 0;

  async function create() {
    setSaving(true);
    setErrors({});
    const result = await api.post<{ id: number }>('/api/water-noc', { ...form, standard_conditions: withConditions });
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrors(result));
      errorToast('Could not record the NOC', result.message);
      return;
    }
    success('Groundwater NOC recorded', withConditions ? 'The 18 standard conditions are ready to tick.' : undefined);
    onClose();
    setForm({ ...EMPTY });
    router.push(`/${panel}/water-noc/${result.data?.id}`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a groundwater NOC"
      description="The permission a company holds to draw a stated quantity of groundwater each day."
      size="xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={create} loading={saving} disabled={!form.employer_id || !form.noc_number.trim() || approved <= 0}>Record NOC</Button>
        </div>
      }
    >
      <div className="space-y-6">
        <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select label="Company" required searchable options={employers} value={form.employer_id} onChange={set('employer_id')} placeholder="Choose the company" error={errors.employer_id} />
          <Select label="Unit" options={units} value={form.unit_id} onChange={set('unit_id')} placeholder={form.employer_id ? 'Whole company' : 'Choose the company first'} clearable disabled={!units.length} />
          <Input label="NOC number" required value={form.noc_number} onChange={text('noc_number')} placeholder="As printed on the NOC" error={errors.noc_number} />
          <Input label="Issuing authority" value={form.issuing_authority} onChange={text('issuing_authority')} placeholder="e.g. Water Resources Department, Chennai" />
          <DatePicker label="Issue date" value={form.issue_date} onChange={set('issue_date')} error={errors.issue_date} />
          <DatePicker label="Valid until" value={form.expiry_date} onChange={set('expiry_date')} error={errors.expiry_date} helper="A NOC is renewed every three years." />
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-ink">Approved quantity</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <Input label="Approved (litres a day)" required type="number" min={0} value={form.approved_quantity_lpd} onChange={text('approved_quantity_lpd')} placeholder="100000" error={errors.approved_quantity_lpd}
              helper={approved > 0 ? `${(approved / 1000).toLocaleString('en-IN')} KLD` : undefined} />
            <Input label="Domestic (LPD)" type="number" min={0} value={form.purpose_domestic_lpd} onChange={text('purpose_domestic_lpd')} error={errors.purpose_domestic_lpd} />
            <Input label="Gardening (LPD)" type="number" min={0} value={form.purpose_gardening_lpd} onChange={text('purpose_gardening_lpd')} />
            <Input label="Other (LPD)" type="number" min={0} value={form.purpose_other_lpd} onChange={text('purpose_other_lpd')} />
          </div>
          {split > 0 && (
            <p className={`text-xs ${split > approved ? 'text-red-600' : 'text-ink-muted'}`}>
              Purposes add up to {split.toLocaleString('en-IN')} LPD{approved > 0 ? ` of ${approved.toLocaleString('en-IN')}` : ''}.
            </p>
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-ink">Well (optional)</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
            <Input label="Type" value={form.well_type} onChange={text('well_type')} />
            <Input label="Depth (m)" type="number" min={0} value={form.well_depth_m} onChange={text('well_depth_m')} />
            <Input label="Diameter (in)" type="number" min={0} value={form.well_diameter_in} onChange={text('well_diameter_in')} />
            <Input label="Pump (HP)" type="number" min={0} value={form.pump_hp} onChange={text('pump_hp')} />
            <Input label="Pumping hours / day" type="number" min={0} max={24} value={form.pumping_hours_per_day} onChange={text('pumping_hours_per_day')} />
          </div>
        </section>

        <label className="flex items-start gap-3 rounded-lg border border-line bg-surface-muted p-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-500" checked={withConditions} onChange={(event) => setWithConditions(event.target.checked)} />
          <span>
            <strong className="text-ink">Add the 18 standard NOC conditions</strong>
            <span className="block text-ink-muted">Flow meter, monthly drawal statements, rainwater harvesting, monitoring bore well, three-yearly renewal and the rest, ready to tick on a visit. You can edit or remove any of them.</span>
          </span>
        </label>
      </div>
    </Modal>
  );
}
