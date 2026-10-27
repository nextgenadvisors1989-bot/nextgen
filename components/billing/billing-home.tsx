'use client';

/** Admin billing home: the money at a glance, then the quotation register, the invoice register and the service catalogue. */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/ui/table';
import { Button, LinkButton } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { StatusPill, fieldMap, rupees } from '@/components/billing/billing-ui';

type Row = Record<string, unknown> & { id: number };
const QUOTATION_STATUSES = ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Invoiced'];
const INVOICE_STATUSES = ['Draft', 'Issued', 'Part paid', 'Paid', 'Cancelled'];

function useRegister(path: string, status: string, search: string) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (search) query.set('search', search);
    const response = await api.get<Row[]>(`/api/admin/billing/${path}?${query.toString()}`);
    setRows(response.ok && Array.isArray(response.data) ? response.data : []);
    setLoading(false);
  }, [path, status, search]);
  useEffect(() => { void load(); }, [load]);
  return { rows, loading, reload: load };
}

function Filters({ statuses, status, onStatus, search, onSearch, action }: { statuses: string[]; status: string; onStatus: (v: string) => void; search: string; onSearch: (v: string) => void; action: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3 px-4 pb-3">
      <div className="w-56"><Input label="Search" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Client or number" /></div>
      <div className="w-44"><Select label="Status" value={status} onChange={onStatus} placeholder="All" clearable options={statuses.map((s) => ({ value: s, label: s }))} /></div>
      <div className="ml-auto">{action}</div>
    </div>
  );
}

function QuotationRegister() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const { rows, loading } = useRegister('quotations', status, search);
  const columns: Column<Row>[] = [
    { key: 'number', header: 'Quotation', render: (r) => <Link href={`/admin/billing/quotations/${r.id}`} className="font-medium text-accent hover:underline">{String(r.quotation_number)}</Link> },
    { key: 'client', header: 'Client', render: (r) => <span className="text-ink">{String(r.client_name)}</span> },
    { key: 'date', header: 'Date', hideOnMobile: true, render: (r) => <span className="text-ink-soft">{formatDate(r.quote_date as string)}</span> },
    { key: 'valid', header: 'Valid until', hideOnMobile: true, render: (r) => <span className={r.is_expired ? 'text-red-600' : 'text-ink-soft'}>{formatDate(r.valid_until as string)}</span> },
    { key: 'total', header: 'Total (incl. GST)', align: 'right', render: (r) => <span className="font-medium tabular-nums">{rupees(r.total)}</span> },
    { key: 'status', header: 'Status', align: 'center', render: (r) => <StatusPill status={String(r.status)} /> },
    { key: 'pdf', header: '', align: 'right', render: (r) => <a href={`/api/pdf/billing/quotation/${r.id}`} target="_blank" rel="noreferrer" className="link text-xs">PDF</a> },
  ];
  return (
    <Card padded={false}>
      <CardHeader title="Quotations" description="Price the monthly service lines for a client, send it, and turn the accepted one into an invoice." />
      <Filters statuses={QUOTATION_STATUSES} status={status} onStatus={setStatus} search={search} onSearch={setSearch} action={<LinkButton href="/admin/billing/quotations/new" size="sm">New quotation</LinkButton>} />
      <DataTable<Row> columns={columns} data={rows} loading={loading} rowKey={(r) => r.id} emptyTitle="No quotations yet" emptySubtitle="Create the first one with New quotation." />
    </Card>
  );
}

function InvoiceRegister() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const { rows, loading } = useRegister('invoices', status, search);
  const columns: Column<Row>[] = [
    { key: 'number', header: 'Invoice', render: (r) => <Link href={`/admin/billing/invoices/${r.id}`} className="font-medium text-accent hover:underline">{r.status === 'Draft' ? 'Draft' : String(r.invoice_number)}</Link> },
    { key: 'buyer', header: 'Buyer', render: (r) => <span className="text-ink">{String(r.buyer_name)}</span> },
    { key: 'date', header: 'Date', hideOnMobile: true, render: (r) => <span className="text-ink-soft">{formatDate(r.invoice_date as string)}</span> },
    { key: 'due', header: 'Due', hideOnMobile: true, render: (r) => <span className={r.is_overdue ? 'font-medium text-red-600' : 'text-ink-soft'}>{formatDate(r.due_date as string)}</span> },
    { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="font-medium tabular-nums">{rupees(r.total)}</span> },
    { key: 'balance', header: 'Balance', align: 'right', hideOnMobile: true, render: (r) => <span className="tabular-nums text-ink-soft">{['Issued', 'Part paid'].includes(String(r.status)) ? rupees(r.balance) : '-'}</span> },
    { key: 'status', header: 'Status', align: 'center', render: (r) => <StatusPill status={String(r.status)} overdue={Boolean(r.is_overdue)} /> },
    { key: 'pdf', header: '', align: 'right', render: (r) => <a href={`/api/pdf/billing/invoice/${r.id}`} target="_blank" rel="noreferrer" className="link text-xs">PDF</a> },
  ];
  return (
    <Card padded={false}>
      <CardHeader title="Tax invoices" description="GST invoices. An invoice gets its number when it is issued; payments you record produce a receipt each." />
      <Filters statuses={INVOICE_STATUSES} status={status} onStatus={setStatus} search={search} onSearch={setSearch} action={<LinkButton href="/admin/billing/invoices/new" size="sm">New invoice</LinkButton>} />
      <DataTable<Row> columns={columns} data={rows} loading={loading} rowKey={(r) => r.id} emptyTitle="No invoices yet" emptySubtitle="Convert an accepted quotation, or raise one with New invoice." />
    </Card>
  );
}

function ServiceCatalogue() {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<Record<string, string> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [remove, setRemove] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await api.get<Row[]>('/api/admin/billing/services');
    setRows(response.ok && Array.isArray(response.data) ? response.data : []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!edit) return;
    setBusy(true);
    setErrors({});
    const payload = { name: edit.name, scope: edit.scope, frequency: edit.frequency || 'Monthly', default_fee: Number(edit.default_fee || 0), sac_code: edit.sac_code, status: edit.status || 'active' };
    const response = edit.id ? await api.put(`/api/admin/billing/services/${edit.id}`, payload) : await api.post('/api/admin/billing/services', payload);
    setBusy(false);
    if (response.ok) { toast.success(response.message); setEdit(null); await load(); } else { setErrors(fieldMap(response)); toast.error(response.message); }
  }

  async function confirmRemove() {
    if (!remove) return;
    const response = await api.delete(`/api/admin/billing/services/${remove.id}`);
    if (response.ok) { toast.success(response.message); setRemove(null); await load(); } else toast.error(response.message);
  }

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Service', render: (r) => <div><div className="font-medium text-ink">{String(r.name)}</div><div className="max-w-xl text-xs text-ink-muted">{String(r.scope ?? '')}</div></div> },
    { key: 'frequency', header: 'Frequency', hideOnMobile: true, render: (r) => <span className="text-ink-soft">{String(r.frequency)}</span> },
    { key: 'sac', header: 'SAC', hideOnMobile: true, render: (r) => <span className="text-ink-soft">{String(r.sac_code ?? '-')}</span> },
    { key: 'fee', header: 'Default fee', align: 'right', render: (r) => <span className="tabular-nums">{rupees(r.default_fee)}</span> },
    { key: 'status', header: 'Status', align: 'center', render: (r) => <Badge tone={r.status === 'active' ? 'success' : 'slate'}>{String(r.status)}</Badge> },
    { key: 'actions', header: '', align: 'right', render: (r) => (
      <span className="flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setEdit({ id: String(r.id), name: String(r.name), scope: String(r.scope ?? ''), frequency: String(r.frequency), default_fee: String(r.default_fee), sac_code: String(r.sac_code ?? ''), status: String(r.status) })}>Edit</Button>
        <Button size="sm" variant="ghost" onClick={() => setRemove(r)}>Remove</Button>
      </span>
    ) },
  ];

  return (
    <Card padded={false}>
      <CardHeader title="Service catalogue" description="The lines you pick from when pricing a quotation. A quotation keeps its own copy, so changing the catalogue never changes a document already sent."
        action={<Button size="sm" onClick={() => setEdit({ name: '', scope: '', frequency: 'Monthly', default_fee: '', sac_code: '', status: 'active' })}>Add service</Button>} />
      <DataTable<Row> columns={columns} data={rows} loading={loading} rowKey={(r) => r.id} />
      <Modal open={Boolean(edit)} onClose={() => setEdit(null)} title={edit?.id ? 'Edit service' : 'Add service'} footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
        {edit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2"><Input label="Service name" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} error={errors.name} /></div>
            <div className="sm:col-span-2"><Textarea label="Scope and deliverables" rows={3} value={edit.scope} onChange={(e) => setEdit({ ...edit, scope: e.target.value })} error={errors.scope} /></div>
            <Input label="Frequency" value={edit.frequency} onChange={(e) => setEdit({ ...edit, frequency: e.target.value })} error={errors.frequency} />
            <Input label="Default fee" type="number" min={0} value={edit.default_fee} onChange={(e) => setEdit({ ...edit, default_fee: e.target.value })} error={errors.default_fee} />
            <Input label="SAC code" value={edit.sac_code} onChange={(e) => setEdit({ ...edit, sac_code: e.target.value })} error={errors.sac_code} />
            <Select label="Status" value={edit.status} onChange={(v) => setEdit({ ...edit, status: v })} options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </div>
        )}
      </Modal>
      <ConfirmDialog open={Boolean(remove)} onClose={() => setRemove(null)} onConfirm={confirmRemove} title="Remove this service?" message="It disappears from the list you pick from. Quotations already written keep their own copy." confirmLabel="Remove" />
    </Card>
  );
}

export function BillingHome() {
  const [summary, setSummary] = useState<{ openQuotations: number; outstanding: number; overdue: number; receivedThisMonth: number } | null>(null);
  useEffect(() => { api.get<typeof summary>('/api/admin/billing/summary').then((r) => r.ok && setSummary(r.data ?? null)); }, []);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Open quotations" value={String(summary?.openQuotations ?? '-')} hint="Draft or sent" tone="brand" />
        <StatCard label="Outstanding" value={summary ? rupees(summary.outstanding) : '-'} hint="Issued, not fully paid" tone="amber" />
        <StatCard label="Overdue" value={summary ? rupees(summary.overdue) : '-'} hint="Past the due date" tone={summary && summary.overdue > 0 ? 'red' : 'emerald'} />
        <StatCard label="Received this month" value={summary ? rupees(summary.receivedThisMonth) : '-'} hint="Payments recorded" tone="emerald" />
      </div>
      <Tabs items={[
        { key: 'quotations', label: 'Quotations', content: <QuotationRegister /> },
        { key: 'invoices', label: 'Tax invoices', content: <InvoiceRegister /> },
        { key: 'services', label: 'Service catalogue', content: <ServiceCatalogue /> },
      ]} />
    </div>
  );
}
