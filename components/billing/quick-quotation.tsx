'use client';

/**
 * The quotation shortcut in the admin header: one icon opens a short form (client, services and their fees, GST, validity), and "Generate"
 * creates the quotation, opens its PDF and offers to keep editing it. It uses the same API as the full editor, so the result is an ordinary Draft quotation.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { quotationTotals } from '@/lib/billing/gst';
import { fieldMap, rupees, today } from '@/components/billing/billing-ui';

interface Lookups {
  employers: { id: number; name: string; gstin: string | null; contact: string | null; address: string; employees: number | null }[];
  services: { id: number; name: string; scope: string | null; frequency: string; default_fee: string | number; sac_code: string | null; status: string }[];
  defaults: { elements: string[]; notes: string[]; paymentTerms: string[]; validityDays: number; subject: string; directive: string };
}

const plusDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const blank = () => ({ employer_id: '', client_name: '', client_address: '', client_contact: '', contact_designation: '', employee_strength: '', shifts: '', industry: '', client_gstin: '', gst_percent: '18' });

export function QuickQuotationButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [form, setForm] = useState(blank());
  const [picked, setPicked] = useState<Record<number, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ id: number; number: string; total: number } | null>(null);

  useEffect(() => {
    if (!open || lookups) return;
    api.get<Lookups>('/api/admin/billing/lookups').then((r) => { if (r.ok && r.data) setLookups(r.data); else toast.error(r.message); });
  }, [open, lookups, toast]);

  const services = useMemo(() => (lookups?.services ?? []).filter((s) => s.status === 'active'), [lookups]);
  const chosen = services.filter((s) => picked[s.id] !== undefined);
  const totals = quotationTotals(chosen.map((s) => Number(picked[s.id]) || 0), Number(form.gst_percent) || 0);
  const set = (key: keyof ReturnType<typeof blank>) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  function pickEmployer(value: string) {
    const employer = lookups?.employers.find((e) => String(e.id) === value);
    setForm((current) => ({
      ...current, employer_id: value,
      ...(employer ? { client_name: employer.name, client_address: employer.address, client_contact: employer.contact ?? current.client_contact, client_gstin: employer.gstin ?? '', employee_strength: employer.employees ? String(employer.employees) : current.employee_strength } : {}),
    }));
  }

  const toggle = (id: number, fee: string | number) => setPicked((current) => {
    const next = { ...current };
    if (next[id] === undefined) next[id] = String(Number(fee)); else delete next[id];
    return next;
  });

  function close() {
    setOpen(false);
    setDone(null);
    setErrors({});
  }

  async function generate() {
    if (!lookups) return;
    if (chosen.length === 0) { setErrors({ items: 'Tick at least one service' }); return; }
    setBusy(true);
    setErrors({});
    const d = lookups.defaults;
    const response = await api.post<{ id: number; quotation_number: string; total: number }>('/api/admin/billing/quotations', {
      employer_id: form.employer_id ? Number(form.employer_id) : null, client_name: form.client_name, client_address: form.client_address, client_contact: form.client_contact,
      contact_designation: form.contact_designation, employee_strength: form.employee_strength, shifts: form.shifts, industry: form.industry, client_gstin: form.client_gstin,
      subject: d.subject, directive: d.directive, framework_elements: d.elements, notes: d.notes.join('\n'), payment_terms: d.paymentTerms,
      quote_date: today(), valid_until: plusDays(d.validityDays), service_period: 'Monthly / Renewable', gst_percent: Number(form.gst_percent) || 0,
      items: chosen.map((s) => ({ category: s.name, scope: s.scope ?? '', frequency: s.frequency, sac_code: s.sac_code ?? '', fee: Number(picked[s.id]) || 0 })),
    });
    setBusy(false);
    if (!response.ok || !response.data) { setErrors(fieldMap(response)); toast.error(response.message); return; }
    setDone({ id: response.data.id, number: response.data.quotation_number, total: response.data.total });
    window.open(`/api/pdf/billing/quotation/${response.data.id}`, '_blank', 'noopener');
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="Generate a quotation" aria-label="Generate a quotation"
        className="rounded-lg p-2 text-ink-soft transition-colors hover:bg-surface-muted hover:text-brand-600">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v4h4" /><path d="M9.5 11h5M9.5 11c2.5 0 3.5 1 3.5 2s-1 2-3.5 2l3.5 3.5" />
        </svg>
      </button>

      <Modal open={open} onClose={close} size="xl" title={done ? 'Quotation generated' : 'Generate a quotation'}
        description={done ? undefined : 'Pick the client and the services; the premium quotation opens as a PDF. You can refine it afterwards in Billing.'}
        footer={done ? (
          <><Button variant="ghost" onClick={() => { setDone(null); setPicked({}); setForm(blank()); }}>Create another</Button>
            <Button variant="outline" onClick={() => window.open(`/api/pdf/billing/quotation/${done.id}`, '_blank', 'noopener')}>Open the PDF again</Button>
            <Button onClick={() => { close(); router.push(`/admin/billing/quotations/${done.id}`); }}>Edit in Billing</Button></>
        ) : (
          <><Button variant="ghost" onClick={close}>Cancel</Button><Button onClick={generate} loading={busy} disabled={!lookups}>Generate quotation</Button></>
        )}>
        {done ? (
          <div className="space-y-2 py-2 text-sm">
            <p className="text-ink">Quotation <strong>{done.number}</strong> was created as a draft for <strong>{rupees(done.total)}</strong> including GST, and its PDF opened in a new tab.</p>
            <p className="text-ink-muted">If the PDF did not open, your browser blocked the pop-up: use "Open the PDF again". Mark it as sent from Billing once you have sent it to the client.</p>
          </div>
        ) : !lookups ? <p className="py-6 text-center text-sm text-ink-muted">Loading...</p> : (
          <div className="space-y-5">
            <section className="grid gap-3 md:grid-cols-2">
              <Select label="Company on the platform (optional)" value={form.employer_id} onChange={pickEmployer} searchable clearable placeholder="A new prospect" options={lookups.employers.map((e) => ({ value: String(e.id), label: e.name }))} />
              <Input label="Client / organisation" value={form.client_name} onChange={set('client_name')} error={errors.client_name} />
              <div className="md:col-span-2"><Input label="Address" value={form.client_address} onChange={set('client_address')} error={errors.client_address} /></div>
              <Input label="Contact person" value={form.client_contact} onChange={set('client_contact')} />
              <Input label="Designation" value={form.contact_designation} onChange={set('contact_designation')} />
              <div className="grid grid-cols-3 gap-3 md:col-span-2">
                <Input label="Employees" type="number" min={0} value={form.employee_strength} onChange={set('employee_strength')} error={errors.employee_strength} />
                <Input label="Shifts" type="number" min={0} value={form.shifts} onChange={set('shifts')} error={errors.shifts} />
                <Input label="Industry / sector" value={form.industry} onChange={set('industry')} />
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Services and monthly fee</h3>
                <button type="button" className="link text-xs" onClick={() => setPicked(chosen.length === services.length ? {} : Object.fromEntries(services.map((s) => [s.id, String(Number(s.default_fee))])))}>
                  {chosen.length === services.length ? 'Clear all' : 'Select all'}
                </button>
              </div>
              {errors.items && <p className="mt-1 text-sm text-red-600" role="alert">{errors.items}</p>}
              <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-lg border border-line">
                {services.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 px-3 py-2">
                    <input type="checkbox" id={`qs-${s.id}`} checked={picked[s.id] !== undefined} onChange={() => toggle(s.id, s.default_fee)} className="h-4 w-4 shrink-0 accent-[#C59B27]" />
                    <label htmlFor={`qs-${s.id}`} className="min-w-0 flex-1 cursor-pointer">
                      <span className="block truncate text-[13px] font-medium text-ink">{s.name}</span>
                      <span className="block truncate text-xs text-ink-muted">{s.scope}</span>
                    </label>
                    <input aria-label={`Fee for ${s.name}`} type="number" min={0} disabled={picked[s.id] === undefined} value={picked[s.id] ?? ''} onChange={(e) => setPicked({ ...picked, [s.id]: e.target.value })}
                      className="w-28 rounded-lg border border-line px-2 py-1.5 text-right text-sm tabular-nums disabled:bg-surface-muted disabled:text-ink-muted" />
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-wrap items-end justify-between gap-4">
              <div className="w-28"><Input label="GST %" type="number" min={0} max={28} step="0.01" value={form.gst_percent} onChange={set('gst_percent')} error={errors.gst_percent} /></div>
              <dl className="ml-auto grid grid-cols-[auto_auto] gap-x-6 gap-y-1 text-sm">
                <dt className="text-ink-muted">Sub-total</dt><dd className="text-right tabular-nums">{rupees(totals.subtotal)}</dd>
                <dt className="text-ink-muted">GST @ {Number(form.gst_percent) || 0}%</dt><dd className="text-right tabular-nums">{rupees(totals.gst)}</dd>
                <dt className="font-semibold text-ink">Total monthly payable</dt><dd className="text-right font-semibold tabular-nums">{rupees(totals.total)}</dd>
              </dl>
            </section>
          </div>
        )}
      </Modal>
    </>
  );
}
