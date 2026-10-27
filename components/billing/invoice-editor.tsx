'use client';

/**
 * A GST tax invoice. A Draft is a form (buyer, lines, live CGST + SGST or IGST totals); Issuing gives it its number and locks it; after that this
 * page shows it read-only with the payments received, lets you record a payment (each gives a receipt) or cancel an unpaid invoice.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/loader';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { invoiceTotals, supplyTypeFor } from '@/lib/billing/gst';
import { formatDate } from '@/lib/utils/dates';
import { StatusPill, fieldMap, itemError, rupees, today } from '@/components/billing/billing-ui';

interface Line { description: string; sac_code: string; quantity: string; uom: string; unit_price: string; gst_percent: string }
interface Lookups {
  employers: { id: number; name: string; gstin: string | null; pan: string | null; address: string; state: string | null }[];
  seller: { stateCode: string; defaultSac: string };
}
interface Payment { id: number; receipt_number: string; payment_date: string; amount: string | number; mode: string; reference: string | null }

const blank = () => ({ employer_id: '', buyer_name: '', buyer_address: '', buyer_gstin: '', buyer_pan: '', buyer_state_code: '', consignee_name: '', consignee_address: '', invoice_date: today(), payment_terms: 'Net 30 days', place_of_supply: '', notes: '' });
const MODES = ['Bank transfer', 'UPI', 'Cheque', 'Cash', 'Card / online'];

export function InvoiceEditor({ invoiceId }: { invoiceId?: number }) {
  const router = useRouter();
  const toast = useToast();
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [form, setForm] = useState(blank());
  const [lines, setLines] = useState<Line[]>([]);
  const [meta, setMeta] = useState<{ number: string; status: string; total: number; paid: number; balance: number; overdue: boolean; quotationId: number | null; cancelReason: string | null } | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'issue' | 'delete' | 'cancel' | 'pay' | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [pay, setPay] = useState({ amount: '', payment_date: today(), mode: 'Bank transfer', reference: '', remarks: '' });
  const [payErrors, setPayErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const [lookup, existing] = await Promise.all([api.get<Lookups>('/api/admin/billing/lookups'), invoiceId ? api.get<Record<string, any>>(`/api/admin/billing/invoices/${invoiceId}`) : Promise.resolve(null)]); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (lookup.ok) setLookups(lookup.data ?? null);
    if (existing) {
      if (!existing.ok || !existing.data) { toast.error(existing.message); setLoading(false); return; }
      const v = existing.data;
      setForm({
        employer_id: v.employer_id ? String(v.employer_id) : '', buyer_name: v.buyer_name ?? '', buyer_address: v.buyer_address ?? '', buyer_gstin: v.buyer_gstin ?? '', buyer_pan: v.buyer_pan ?? '', buyer_state_code: v.buyer_state_code ?? '',
        consignee_name: v.consignee_name ?? '', consignee_address: v.consignee_address ?? '', invoice_date: String(v.invoice_date).slice(0, 10), payment_terms: v.payment_terms ?? 'Net 30 days', place_of_supply: v.place_of_supply ?? '', notes: v.notes ?? '',
      });
      setLines((v.items ?? []).map((i: Record<string, unknown>) => ({ description: String(i.description), sac_code: String(i.sac_code ?? ''), quantity: String(Number(i.quantity)), uom: String(i.uom ?? ''), unit_price: String(Number(i.unit_price)), gst_percent: String(Number(i.gst_percent)) })));
      setPayments(v.payments ?? []);
      setMeta({ number: v.invoice_number, status: v.status, total: Number(v.total), paid: Number(v.amount_paid), balance: Number(v.balance), overdue: Boolean(v.due_date && v.due_date < today() && ['Issued', 'Part paid'].includes(v.status)), quotationId: v.quotation_id ? Number(v.quotation_id) : null, cancelReason: v.cancel_reason ?? null });
      setPay((current) => ({ ...current, amount: String(Number(v.balance)) }));
    } else if (lookup.ok && lookup.data) {
      setLines([{ description: '', sac_code: lookup.data.seller.defaultSac, quantity: '1', uom: 'Nos', unit_price: '', gst_percent: '18' }]);
    }
    setLoading(false);
  }, [invoiceId, toast]);
  useEffect(() => { void load(); }, [load]);

  const editable = !meta || meta.status === 'Draft';
  const stateCode = form.buyer_state_code || (form.buyer_gstin.length >= 2 ? form.buyer_gstin.slice(0, 2) : '');
  const supply = supplyTypeFor(lookups?.seller.stateCode ?? '33', stateCode);
  const totals = useMemo(() => invoiceTotals(lines.map((l) => ({ quantity: Number(l.quantity) || 0, unit_price: Number(l.unit_price) || 0, gst_percent: Number(l.gst_percent) || 0 })), supply), [lines, supply]);
  const set = (key: keyof ReturnType<typeof blank>) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const patch = (index: number, key: keyof Line, value: string) => setLines((current) => current.map((l, i) => (i === index ? { ...l, [key]: value } : l)));

  function pickEmployer(value: string) {
    const e = lookups?.employers.find((x) => String(x.id) === value);
    setForm((current) => ({ ...current, employer_id: value, ...(e ? { buyer_name: e.name, buyer_address: e.address, buyer_gstin: e.gstin ?? '', buyer_pan: e.pan ?? '', buyer_state_code: e.gstin ? e.gstin.slice(0, 2) : current.buyer_state_code, place_of_supply: e.state ?? current.place_of_supply } : {}) }));
  }

  async function save() {
    setBusy('save');
    setErrors({});
    const payload = {
      employer_id: form.employer_id ? Number(form.employer_id) : null, quotation_id: meta?.quotationId ?? null, buyer_name: form.buyer_name, buyer_address: form.buyer_address, buyer_gstin: form.buyer_gstin, buyer_pan: form.buyer_pan,
      buyer_state_code: form.buyer_state_code, consignee_name: form.consignee_name, consignee_address: form.consignee_address, invoice_date: form.invoice_date, payment_terms: form.payment_terms, place_of_supply: form.place_of_supply, notes: form.notes,
      items: lines.map((l) => ({ description: l.description, sac_code: l.sac_code, quantity: Number(l.quantity), uom: l.uom, unit_price: Number(l.unit_price) || 0, gst_percent: Number(l.gst_percent) || 0 })),
    };
    const response = invoiceId ? await api.put<{ id: number }>(`/api/admin/billing/invoices/${invoiceId}`, payload) : await api.post<{ id: number }>('/api/admin/billing/invoices', payload);
    setBusy(null);
    if (!response.ok) { setErrors(fieldMap(response)); toast.error(response.message); return false; }
    toast.success(response.message);
    if (!invoiceId && response.data) router.replace(`/admin/billing/invoices/${response.data.id}`); else await load();
    return true;
  }

  async function act(path: string, body: unknown, done: string) {
    setBusy(path);
    const response = await api.post(`/api/admin/billing/invoices/${invoiceId}/${path}`, body);
    setBusy(null);
    if (response.ok) { toast.success(done); setDialog(null); await load(); return null; }
    return response;
  }

  async function issue() {
    // issue what is on screen: save first, so the locked document is the one the person is looking at
    if (editable && !(await save())) { setDialog(null); return; }
    const failed = await act('issue', {}, 'Invoice issued');
    if (failed) { toast.error(failed.message); setDialog(null); }
  }

  async function recordPayment() {
    setPayErrors({});
    const failed = await act('payments', { ...pay, amount: Number(pay.amount) }, 'Payment recorded');
    if (failed) { setPayErrors(fieldMap(failed)); toast.error(failed.message); }
  }

  async function cancel() {
    const failed = await act('cancel', { reason: cancelReason }, 'Invoice cancelled');
    if (failed) toast.error(failed.message);
  }

  async function remove() {
    const response = await api.delete(`/api/admin/billing/invoices/${invoiceId}`);
    if (response.ok) { toast.success(response.message); router.push('/admin/billing'); } else toast.error(response.message);
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-ink">{!meta ? 'New tax invoice' : meta.status === 'Draft' ? 'Draft invoice' : meta.number}</h2>
          {meta && <StatusPill status={meta.status} overdue={meta.overdue} />}
        </div>
        <div className="flex flex-wrap gap-2">
          {invoiceId && <a href={`/api/pdf/billing/invoice/${invoiceId}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm font-medium text-ink-soft hover:bg-surface-muted">PDF</a>}
          {invoiceId && meta?.status === 'Draft' && <Button size="sm" onClick={() => setDialog('issue')}>Issue invoice</Button>}
          {meta && ['Issued', 'Part paid'].includes(meta.status) && <Button size="sm" onClick={() => setDialog('pay')}>Record payment</Button>}
          {meta && ['Issued', 'Part paid'].includes(meta.status) && meta.paid === 0 && <Button size="sm" variant="outline" onClick={() => setDialog('cancel')}>Cancel invoice</Button>}
          {meta?.status === 'Draft' && invoiceId && <Button size="sm" variant="ghost" onClick={() => setDialog('delete')}>Delete</Button>}
        </div>
      </div>
      {meta?.status === 'Cancelled' && <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">This invoice was cancelled: {meta.cancelReason}</p>}
      {meta && meta.status !== 'Draft' && <p className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-sm text-ink-soft">An issued invoice cannot be edited. To correct it, cancel it (if nothing has been paid) and raise a new one.</p>}

      <Card>
        <CardHeader title="Buyer" description="Pick a company on the platform to fill the details, or type them. The buyer's state decides CGST + SGST or IGST." />
        <CardBody>
          <fieldset disabled={!editable} className="grid gap-3 md:grid-cols-2">
            <Select label="Company on the platform (optional)" value={form.employer_id} onChange={pickEmployer} searchable clearable placeholder="Another buyer" options={(lookups?.employers ?? []).map((e) => ({ value: String(e.id), label: e.name }))} />
            <Input label="Buyer name" value={form.buyer_name} onChange={set('buyer_name')} error={errors.buyer_name} />
            <div className="md:col-span-2"><Input label="Address" value={form.buyer_address} onChange={set('buyer_address')} error={errors.buyer_address} /></div>
            <Input label="GSTIN" value={form.buyer_gstin} onChange={set('buyer_gstin')} error={errors.buyer_gstin} />
            <Input label="PAN" value={form.buyer_pan} onChange={set('buyer_pan')} error={errors.buyer_pan} />
            <Input label="State code" value={form.buyer_state_code} onChange={set('buyer_state_code')} error={errors.buyer_state_code} helper={stateCode ? `Supply is ${supply.toLowerCase()} (${supply === 'Inter-state' ? 'IGST' : 'CGST + SGST'})` : 'Blank is treated as your own state'} />
            <Input label="Place of supply" value={form.place_of_supply} onChange={set('place_of_supply')} error={errors.place_of_supply} />
            <Input label="Consignee (if different)" value={form.consignee_name} onChange={set('consignee_name')} error={errors.consignee_name} />
            <Input label="Consignee address" value={form.consignee_address} onChange={set('consignee_address')} error={errors.consignee_address} />
          </fieldset>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Invoice" />
        <CardBody>
          <fieldset disabled={!editable} className="grid gap-3 md:grid-cols-3">
            <Input label="Invoice date" type="date" value={form.invoice_date} onChange={set('invoice_date')} error={errors.invoice_date} />
            <Input label="Payment terms" value={form.payment_terms} onChange={set('payment_terms')} error={errors.payment_terms} helper="e.g. Net 30 days" />
            <Input label="Notes" value={form.notes} onChange={set('notes')} error={errors.notes} />
          </fieldset>
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Lines" />
        <div className="space-y-3 px-4 pb-4">
          {errors.items && <p className="text-sm text-red-600">{errors.items}</p>}
          {lines.map((line, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-line p-3 md:grid-cols-12">
              <div className="md:col-span-4"><Input label="Description" value={line.description} disabled={!editable} onChange={(e) => patch(i, 'description', e.target.value)} error={itemError(errors, i, 'description')} /></div>
              <div className="md:col-span-2"><Input label="HSN / SAC" value={line.sac_code} disabled={!editable} onChange={(e) => patch(i, 'sac_code', e.target.value)} error={itemError(errors, i, 'sac_code')} /></div>
              <div className="md:col-span-1"><Input label="Qty" type="number" min={0} step="0.001" value={line.quantity} disabled={!editable} onChange={(e) => patch(i, 'quantity', e.target.value)} error={itemError(errors, i, 'quantity')} /></div>
              <div className="md:col-span-1"><Input label="UOM" value={line.uom} disabled={!editable} onChange={(e) => patch(i, 'uom', e.target.value)} /></div>
              <div className="md:col-span-2"><Input label="Unit price" type="number" min={0} value={line.unit_price} disabled={!editable} onChange={(e) => patch(i, 'unit_price', e.target.value)} error={itemError(errors, i, 'unit_price')} /></div>
              <div className="md:col-span-1"><Input label="GST %" type="number" min={0} max={28} value={line.gst_percent} disabled={!editable} onChange={(e) => patch(i, 'gst_percent', e.target.value)} error={itemError(errors, i, 'gst_percent')} /></div>
              <div className="flex items-end md:col-span-1">{editable && lines.length > 1 && <Button variant="ghost" size="sm" onClick={() => setLines((current) => current.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1}`}>Remove</Button>}</div>
              <p className="text-xs text-ink-muted md:col-span-12">Line total {rupees(totals.lines[i]?.amount)} (taxable {rupees(totals.lines[i]?.taxable_value)} + GST {rupees(totals.lines[i]?.gst_amount)})</p>
            </div>
          ))}
          {editable && <Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, { description: '', sac_code: lookups?.seller.defaultSac ?? '', quantity: '1', uom: 'Nos', unit_price: '', gst_percent: '18' }])}>Add a line</Button>}
          <dl className="ml-auto max-w-sm space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-ink-muted">Taxable value</dt><dd className="tabular-nums">{rupees(totals.subtotal)}</dd></div>
            {supply === 'Inter-state' ? <div className="flex justify-between"><dt className="text-ink-muted">IGST</dt><dd className="tabular-nums">{rupees(totals.igst)}</dd></div> : <>
              <div className="flex justify-between"><dt className="text-ink-muted">CGST</dt><dd className="tabular-nums">{rupees(totals.cgst)}</dd></div>
              <div className="flex justify-between"><dt className="text-ink-muted">SGST</dt><dd className="tabular-nums">{rupees(totals.sgst)}</dd></div></>}
            <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Invoice total</dt><dd className="tabular-nums">{rupees(totals.total)}</dd></div>
            {meta && meta.status !== 'Draft' && <><div className="flex justify-between"><dt className="text-ink-muted">Paid</dt><dd className="tabular-nums">{rupees(meta.paid)}</dd></div>
              <div className="flex justify-between font-medium"><dt>Balance due</dt><dd className="tabular-nums">{rupees(meta.balance)}</dd></div></>}
          </dl>
        </div>
      </Card>

      {payments.length > 0 && (
        <Card padded={false}>
          <CardHeader title="Payments received" description="Each payment has its own receipt." />
          <ul className="divide-y divide-line">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span><span className="font-medium text-ink">{p.receipt_number}</span> <span className="text-ink-muted">- {formatDate(p.payment_date)}, {p.mode}{p.reference ? `, ${p.reference}` : ''}</span></span>
                <span className="flex items-center gap-3"><span className="tabular-nums font-medium">{rupees(p.amount)}</span><a href={`/api/pdf/billing/receipt/${p.id}`} target="_blank" rel="noreferrer" className="link text-xs">Receipt PDF</a></span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editable && <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => router.push('/admin/billing')}>Back</Button><Button onClick={save} loading={busy === 'save'}>{invoiceId ? 'Save draft' : 'Create draft'}</Button></div>}

      <ConfirmDialog open={dialog === 'issue'} onClose={() => setDialog(null)} onConfirm={issue} variant="primary" title="Issue this invoice?" message="It gets its invoice number and can no longer be edited. This is what the client is billed." confirmLabel="Issue" />
      <ConfirmDialog open={dialog === 'delete'} onClose={() => setDialog(null)} onConfirm={remove} title="Delete this draft?" message="A draft has no invoice number yet, so it can be deleted." confirmLabel="Delete" />
      <Modal open={dialog === 'cancel'} onClose={() => setDialog(null)} title="Cancel this invoice" description="Only an invoice with nothing paid can be cancelled. The number stays on record as cancelled."
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Keep it</Button><Button onClick={cancel} loading={busy === 'cancel'}>Cancel invoice</Button></>}>
        <Textarea label="Reason" rows={3} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
      </Modal>
      <Modal open={dialog === 'pay'} onClose={() => setDialog(null)} title="Record a payment" description={meta ? `Balance due ${rupees(meta.balance)}` : undefined}
        footer={<><Button variant="ghost" onClick={() => setDialog(null)}>Cancel</Button><Button onClick={recordPayment} loading={busy === 'payments'}>Record payment</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Amount received" type="number" min={0} value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} error={payErrors.amount} />
          <Input label="Date" type="date" max={today()} value={pay.payment_date} onChange={(e) => setPay({ ...pay, payment_date: e.target.value })} error={payErrors.payment_date} />
          <Select label="Mode" value={pay.mode} onChange={(v) => setPay({ ...pay, mode: v })} options={MODES.map((m) => ({ value: m, label: m }))} />
          <Input label="Reference" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="UTR / cheque number" error={payErrors.reference} />
          <div className="sm:col-span-2"><Input label="Remarks" value={pay.remarks} onChange={(e) => setPay({ ...pay, remarks: e.target.value })} error={payErrors.remarks} /></div>
        </div>
      </Modal>
    </div>
  );
}
