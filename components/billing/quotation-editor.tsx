'use client';

/** Create, edit and move a quotation through its life (Draft, Sent, Accepted / Rejected / Expired, Invoiced). Totals are worked out as you type. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/loader';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { quotationTotals } from '@/lib/billing/gst';
import { StatusPill, fieldMap, itemError, rupees, today } from '@/components/billing/billing-ui';

interface Line { category: string; scope: string; frequency: string; sac_code: string; fee: string }
interface Lookups {
  employers: { id: number; name: string; gstin: string | null; contact: string | null; address: string; state: string | null; employees: number | null }[];
  services: { id: number; name: string; scope: string | null; frequency: string; default_fee: string | number; sac_code: string | null; status: string }[];
  seller: { defaultSac: string };
  defaults?: { elements: string[]; notes: string[]; paymentTerms: string[]; validityDays: number; subject: string; directive: string };
}

const blank = () => ({ employer_id: '', client_name: '', client_address: '', client_contact: '', contact_designation: '', client_profile: '', employee_strength: '', shifts: '', industry: '', client_gstin: '', client_state_code: '', subject: '', directive: '', elements: '', notes: '', payment_terms: '', service_period: 'Monthly / Renewable', quote_date: today(), valid_until: '', gst_percent: '18' });

export function QuotationEditor({ quotationId }: { quotationId?: number }) {
  const router = useRouter();
  const toast = useToast();
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [form, setForm] = useState(blank());
  const [lines, setLines] = useState<Line[]>([]);
  const [meta, setMeta] = useState<{ number: string; status: string; invoiceId: number | null } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const [lookup, existing] = await Promise.all([
      api.get<Lookups>('/api/admin/billing/lookups'),
      quotationId ? api.get<Record<string, unknown>>(`/api/admin/billing/quotations/${quotationId}`) : Promise.resolve(null),
    ]);
    if (lookup.ok) {
      setLookups(lookup.data ?? null);
      const d = lookup.data?.defaults;
      // a new quotation starts with the standard wording; an existing one is loaded below
      if (d && !quotationId) {
        const valid = new Date();
        valid.setDate(valid.getDate() + d.validityDays);
        setForm((current) => ({ ...current, subject: d.subject, directive: d.directive, elements: d.elements.join('\n'), notes: d.notes.join('\n'), payment_terms: d.paymentTerms.join('\n'),
          valid_until: `${valid.getFullYear()}-${String(valid.getMonth() + 1).padStart(2, '0')}-${String(valid.getDate()).padStart(2, '0')}` }));
      }
    }
    if (existing) {
      if (!existing.ok || !existing.data) { toast.error(existing.message); setLoading(false); return; }
      const q = existing.data as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      setForm({
        employer_id: q.employer_id ? String(q.employer_id) : '', client_name: q.client_name ?? '', client_address: q.client_address ?? '', client_contact: q.client_contact ?? '', contact_designation: q.contact_designation ?? '', client_profile: q.client_profile ?? '',
        employee_strength: q.employee_strength === null || q.employee_strength === undefined ? '' : String(q.employee_strength), shifts: q.shifts === null || q.shifts === undefined ? '' : String(q.shifts), industry: q.industry ?? '',
        payment_terms: (q.payment_terms ?? []).join('\n'), service_period: q.service_period ?? 'Monthly / Renewable',
        client_gstin: q.client_gstin ?? '', client_state_code: q.client_state_code ?? '', subject: q.subject ?? '', directive: q.directive ?? '', elements: (q.framework_elements ?? []).join('\n'), notes: q.notes ?? '',
        quote_date: String(q.quote_date).slice(0, 10), valid_until: q.valid_until ? String(q.valid_until).slice(0, 10) : '', gst_percent: String(Number(q.gst_percent)),
      });
      setLines((q.items ?? []).map((i: Record<string, unknown>) => ({ category: String(i.category), scope: String(i.scope ?? ''), frequency: String(i.frequency), sac_code: String(i.sac_code ?? ''), fee: String(Number(i.fee)) })));
      setMeta({ number: q.quotation_number, status: q.status, invoiceId: q.invoice_id ? Number(q.invoice_id) : null });
    }
    setLoading(false);
  }, [quotationId, toast]);
  useEffect(() => { void load(); }, [load]);

  const editable = !meta || ['Draft', 'Sent'].includes(meta.status);
  const totals = useMemo(() => quotationTotals(lines.map((l) => Number(l.fee) || 0), Number(form.gst_percent) || 0), [lines, form.gst_percent]);
  const set = (key: keyof ReturnType<typeof blank>) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  function pickEmployer(value: string) {
    const employer = lookups?.employers.find((e) => String(e.id) === value);
    setForm((current) => ({
      ...current, employer_id: value,
      ...(employer ? { client_name: employer.name, client_address: employer.address, client_contact: employer.contact ?? current.client_contact, client_gstin: employer.gstin ?? '',
        client_state_code: employer.gstin ? employer.gstin.slice(0, 2) : current.client_state_code, client_profile: employer.employees ? `${employer.employees} employees` : current.client_profile } : {}),
    }));
  }

  function addFromCatalogue(value: string) {
    const service = lookups?.services.find((s) => String(s.id) === value);
    if (service) setLines((current) => [...current, { category: service.name, scope: service.scope ?? '', frequency: service.frequency, sac_code: service.sac_code ?? '', fee: String(Number(service.default_fee)) }]);
  }

  const patchLine = (index: number, key: keyof Line, value: string) => setLines((current) => current.map((l, i) => (i === index ? { ...l, [key]: value } : l)));

  async function save() {
    setBusy('save');
    setErrors({});
    const payload = {
      employer_id: form.employer_id ? Number(form.employer_id) : null, client_name: form.client_name, client_address: form.client_address, client_contact: form.client_contact, contact_designation: form.contact_designation, client_profile: form.client_profile,
      employee_strength: form.employee_strength, shifts: form.shifts, industry: form.industry, service_period: form.service_period, payment_terms: form.payment_terms.split('\n').map((l) => l.trim()).filter(Boolean),
      client_gstin: form.client_gstin, client_state_code: form.client_state_code, subject: form.subject, directive: form.directive, notes: form.notes, quote_date: form.quote_date, valid_until: form.valid_until,
      gst_percent: Number(form.gst_percent), framework_elements: form.elements.split('\n').map((l) => l.trim()).filter(Boolean),
      items: lines.map((l) => ({ category: l.category, scope: l.scope, frequency: l.frequency || 'Monthly', sac_code: l.sac_code, fee: Number(l.fee) || 0 })),
    };
    const response = quotationId ? await api.put<{ id: number }>(`/api/admin/billing/quotations/${quotationId}`, payload) : await api.post<{ id: number }>('/api/admin/billing/quotations', payload);
    setBusy(null);
    if (!response.ok) { setErrors(fieldMap(response)); toast.error(response.message); return; }
    toast.success(response.message);
    if (!quotationId && response.data) router.replace(`/admin/billing/quotations/${response.data.id}`);
    else await load();
  }

  async function move(status: string) {
    setBusy(status);
    const response = await api.post(`/api/admin/billing/quotations/${quotationId}/status`, { status });
    setBusy(null);
    if (response.ok) { toast.success(`Quotation marked ${status.toLowerCase()}`); await load(); } else toast.error(response.message);
  }

  async function invoice() {
    setBusy('invoice');
    const response = await api.post<{ id: number }>(`/api/admin/billing/quotations/${quotationId}/invoice`, {});
    setBusy(null);
    if (response.ok && response.data) { toast.success(response.message); router.push(`/admin/billing/invoices/${response.data.id}`); } else toast.error(response.message);
  }

  async function remove() {
    const response = await api.delete(`/api/admin/billing/quotations/${quotationId}`);
    if (response.ok) { toast.success(response.message); router.push('/admin/billing'); } else toast.error(response.message);
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;
  const activeServices = lookups?.services.filter((s) => s.status === 'active') ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-ink">{meta ? meta.number : 'New quotation'}</h2>
          {meta && <StatusPill status={meta.status} />}
        </div>
        <div className="flex flex-wrap gap-2">
          {quotationId && <a href={`/api/pdf/billing/quotation/${quotationId}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm font-medium text-ink-soft hover:bg-surface-muted">PDF</a>}
          {meta?.status === 'Draft' && <Button variant="outline" size="sm" loading={busy === 'Sent'} onClick={() => move('Sent')}>Mark as sent</Button>}
          {meta?.status === 'Sent' && <><Button variant="outline" size="sm" loading={busy === 'Accepted'} onClick={() => move('Accepted')}>Client accepted</Button>
            <Button variant="outline" size="sm" loading={busy === 'Rejected'} onClick={() => move('Rejected')}>Rejected</Button><Button variant="ghost" size="sm" loading={busy === 'Expired'} onClick={() => move('Expired')}>Expired</Button></>}
          {meta && ['Rejected', 'Expired'].includes(meta.status) && <Button variant="outline" size="sm" loading={busy === 'Sent'} onClick={() => move('Sent')}>Send again</Button>}
          {meta?.status === 'Accepted' && <Button size="sm" loading={busy === 'invoice'} onClick={invoice}>Create invoice</Button>}
          {meta?.status === 'Invoiced' && meta.invoiceId && <Button size="sm" variant="outline" onClick={() => router.push(`/admin/billing/invoices/${meta.invoiceId}`)}>Open invoice</Button>}
          {meta?.status === 'Draft' && <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(true)}>Delete</Button>}
        </div>
      </div>
      {!editable && <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">A quotation that has been {meta?.status.toLowerCase()} is read-only, so the document the client saw stays as it was.</p>}

      <Card>
        <CardHeader title="Client" description="Pick a company already on the platform to fill the details, or type a new prospect." />
        <CardBody>
          <fieldset disabled={!editable} className="grid gap-3 md:grid-cols-2">
            <Select label="Company on the platform (optional)" value={form.employer_id} onChange={pickEmployer} searchable clearable placeholder="A new prospect" options={(lookups?.employers ?? []).map((e) => ({ value: String(e.id), label: e.name }))} />
            <Input label="Client / organisation" value={form.client_name} onChange={set('client_name')} error={errors.client_name} />
            <div className="md:col-span-2"><Input label="Address" value={form.client_address} onChange={set('client_address')} error={errors.client_address} /></div>
            <Input label="Contact person" value={form.client_contact} onChange={set('client_contact')} error={errors.client_contact} />
            <Input label="Designation" value={form.contact_designation} onChange={set('contact_designation')} error={errors.contact_designation} />
            <Input label="Employee strength" type="number" min={0} value={form.employee_strength} onChange={set('employee_strength')} error={errors.employee_strength} />
            <Input label="Number of shifts" type="number" min={0} value={form.shifts} onChange={set('shifts')} error={errors.shifts} />
            <div className="md:col-span-2"><Input label="Industry / sector" value={form.industry} onChange={set('industry')} error={errors.industry} /></div>
            <Input label="Client GSTIN (optional)" value={form.client_gstin} onChange={set('client_gstin')} error={errors.client_gstin} />
            <Input label="State code" value={form.client_state_code} onChange={set('client_state_code')} error={errors.client_state_code} placeholder="33" />
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Quotation" />
        <CardBody>
          <fieldset disabled={!editable} className="grid gap-3 md:grid-cols-3">
            <Input label="Quotation date" type="date" value={form.quote_date} onChange={set('quote_date')} error={errors.quote_date} />
            <Input label="Valid until" type="date" value={form.valid_until} onChange={set('valid_until')} error={errors.valid_until} />
            <Input label="GST %" type="number" min={0} max={28} step="0.01" value={form.gst_percent} onChange={set('gst_percent')} error={errors.gst_percent} />
            <Input label="Service period" value={form.service_period} onChange={set('service_period')} error={errors.service_period} />
            <div className="md:col-span-3"><Input label="Subject" value={form.subject} onChange={set('subject')} error={errors.subject} /></div>
            <div className="md:col-span-3"><Textarea label="Core directive" rows={2} value={form.directive} onChange={set('directive')} error={errors.directive} /></div>
          </fieldset>
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Itemised service fees" description="One line per service. The fee is per the frequency shown (monthly by default)." />
        <div className="space-y-3 px-4 pb-4">
          {errors.items && <p className="text-sm text-red-600">{errors.items}</p>}
          {lines.map((line, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-3 md:grid-cols-12">
              <div className="md:col-span-4"><Input label="Service" value={line.category} disabled={!editable} onChange={(e) => patchLine(i, 'category', e.target.value)} error={itemError(errors, i, 'category')} /></div>
              <div className="md:col-span-4"><Input label="Scope and deliverables" value={line.scope} disabled={!editable} onChange={(e) => patchLine(i, 'scope', e.target.value)} error={itemError(errors, i, 'scope')} /></div>
              <div className="md:col-span-1"><Input label="Frequency" value={line.frequency} disabled={!editable} onChange={(e) => patchLine(i, 'frequency', e.target.value)} /></div>
              <div className="md:col-span-2"><Input label="Fee" type="number" min={0} value={line.fee} disabled={!editable} onChange={(e) => patchLine(i, 'fee', e.target.value)} error={itemError(errors, i, 'fee')} /></div>
              <div className="flex items-end md:col-span-1">{editable && <Button variant="ghost" size="sm" onClick={() => setLines((current) => current.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>Remove</Button>}</div>
            </div>
          ))}
          {editable && (
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-72"><Select label="Add from the service catalogue" value="" onChange={addFromCatalogue} placeholder="Choose a service" searchable options={activeServices.map((s) => ({ value: String(s.id), label: `${s.name} - ${rupees(s.default_fee)}` }))} /></div>
              <Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, { category: '', scope: '', frequency: 'Monthly', sac_code: '', fee: '' }])}>Add a custom line</Button>
              <Button variant="ghost" size="sm" onClick={() => setLines(activeServices.map((s) => ({ category: s.name, scope: s.scope ?? '', frequency: s.frequency, sac_code: s.sac_code ?? '', fee: String(Number(s.default_fee)) })))}>Use the whole catalogue</Button>
            </div>
          )}
          <dl className="ml-auto max-w-sm space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-muted">Base service sub-total</dt><dd className="tabular-nums">{rupees(totals.subtotal)}</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Statutory GST @ {Number(form.gst_percent) || 0}%</dt><dd className="tabular-nums">{rupees(totals.gst)}</dd></div>
            <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total payable</dt><dd className="tabular-nums">{rupees(totals.total)}</dd></div>
          </dl>
        </div>
      </Card>

      <Card>
        <CardHeader title="Included framework elements and notes" />
        <CardBody>
          <fieldset disabled={!editable} className="grid gap-3">
            <Textarea label="Included framework elements (one per line)" rows={4} value={form.elements} onChange={set('elements')} error={errors.framework_elements} />
            <Textarea label="Notes (one per line)" rows={4} value={form.notes} onChange={set('notes')} error={errors.notes} />
            <Textarea label="Payment terms (one per line)" rows={4} value={form.payment_terms} onChange={set('payment_terms')} error={errors.payment_terms} />
          </fieldset>
        </CardBody>
      </Card>

      {editable && <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => router.push('/admin/billing')}>Back</Button><Button onClick={save} loading={busy === 'save'}>{quotationId ? 'Save changes' : 'Create quotation'}</Button></div>}
      <ConfirmDialog open={confirmDelete} onClose={() => setConfirmDelete(false)} onConfirm={remove} title="Delete this draft quotation?" message="A draft has not been sent, so it can be deleted. A sent quotation is kept." confirmLabel="Delete" />
    </div>
  );
}
