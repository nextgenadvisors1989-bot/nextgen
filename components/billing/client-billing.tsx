'use client';

/** The client's (employer's) read-only view of the quotations and tax invoices sent to their company, with PDFs and receipts. */
import { useEffect, useState } from 'react';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/ui/table';
import { Spinner } from '@/components/ui/loader';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { StatusPill, rupees } from '@/components/billing/billing-ui';

type Row = Record<string, unknown> & { id: number };

function useRows(path: string) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => { api.get<Row[]>(`/api/employer/billing/${path}`).then((r) => setRows(r.ok && Array.isArray(r.data) ? r.data : [])); }, [path]);
  return rows;
}

export function ClientBilling() {
  const quotations = useRows('quotations');
  const invoices = useRows('invoices');
  const [receipts, setReceipts] = useState<Record<number, { id: number; receipt_number: string }[]>>({});

  async function showReceipts(invoiceId: number) {
    if (receipts[invoiceId]) return;
    const response = await api.get<{ payments: { id: number; receipt_number: string }[] }>(`/api/employer/billing/invoices/${invoiceId}`);
    if (response.ok && response.data) setReceipts((current) => ({ ...current, [invoiceId]: response.data!.payments }));
  }

  if (!quotations || !invoices) return <div className="flex justify-center py-12"><Spinner /></div>;
  const open = invoices.filter((i) => ['Issued', 'Part paid'].includes(String(i.status)));
  const due = open.reduce((sum, i) => sum + Number(i.balance ?? 0), 0);
  const overdue = open.filter((i) => i.is_overdue).reduce((sum, i) => sum + Number(i.balance ?? 0), 0);

  const quotationColumns: Column<Row>[] = [
    { key: 'number', header: 'Quotation', render: (r) => <a href={`/api/pdf/billing/quotation/${r.id}`} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">{String(r.quotation_number)}</a> },
    { key: 'date', header: 'Date', hideOnMobile: true, render: (r) => <span className="text-ink-soft">{formatDate(r.quote_date as string)}</span> },
    { key: 'valid', header: 'Valid until', hideOnMobile: true, render: (r) => <span className="text-ink-soft">{formatDate(r.valid_until as string)}</span> },
    { key: 'total', header: 'Total (incl. GST)', align: 'right', render: (r) => <span className="font-medium tabular-nums">{rupees(r.total)}</span> },
    { key: 'status', header: 'Status', align: 'center', render: (r) => <StatusPill status={String(r.status)} /> },
    { key: 'pdf', header: '', align: 'right', hideOnMobile: true, render: (r) => <a href={`/api/pdf/billing/quotation/${r.id}`} target="_blank" rel="noreferrer" className="link text-xs">PDF</a> },
  ];
  const invoiceColumns: Column<Row>[] = [
    { key: 'number', header: 'Invoice', render: (r) => <a href={`/api/pdf/billing/invoice/${r.id}`} target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">{String(r.invoice_number)}</a> },
    { key: 'date', header: 'Date', hideOnMobile: true, render: (r) => <span className="text-ink-soft">{formatDate(r.invoice_date as string)}</span> },
    { key: 'due', header: 'Due', hideOnMobile: true, render: (r) => <span className={r.is_overdue ? 'font-medium text-red-600' : 'text-ink-soft'}>{formatDate(r.due_date as string)}</span> },
    { key: 'total', header: 'Total', align: 'right', render: (r) => <span className="font-medium tabular-nums">{rupees(r.total)}</span> },
    { key: 'balance', header: 'Balance', align: 'right', hideOnMobile: true, render: (r) => <span className="tabular-nums text-ink-soft">{['Issued', 'Part paid'].includes(String(r.status)) ? rupees(r.balance) : '-'}</span> },
    { key: 'status', header: 'Status', align: 'center', render: (r) => <StatusPill status={String(r.status)} overdue={Boolean(r.is_overdue)} /> },
    { key: 'pdf', header: '', align: 'right', hideOnMobile: true, render: (r) => (
      <span className="flex flex-wrap justify-end gap-2" onMouseEnter={() => { if (Number(r.amount_paid) > 0) void showReceipts(r.id); }} onFocus={() => { if (Number(r.amount_paid) > 0) void showReceipts(r.id); }}>
        <a href={`/api/pdf/billing/invoice/${r.id}`} target="_blank" rel="noreferrer" className="link text-xs">Invoice PDF</a>
        {(receipts[r.id] ?? []).map((p) => <a key={p.id} href={`/api/pdf/billing/receipt/${p.id}`} target="_blank" rel="noreferrer" className="link text-xs">Receipt {p.receipt_number.slice(-4)}</a>)}
        {Number(r.amount_paid) > 0 && !receipts[r.id] && <button type="button" className="link text-xs" onClick={() => showReceipts(r.id)}>Receipts</button>}
      </span>
    ) },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Invoices to pay" value={String(open.length)} hint="Issued, not fully paid" tone="amber" />
        <StatCard label="Balance due" value={rupees(due)} tone="brand" />
        <StatCard label="Overdue" value={rupees(overdue)} tone={overdue > 0 ? 'red' : 'emerald'} />
      </div>
      <Tabs items={[
        { key: 'invoices', label: 'Tax invoices', badge: <span className="ml-1.5">{invoices.length}</span>, content: <Card padded={false}><CardHeader title="Tax invoices" description="Invoices issued to your company." /><DataTable<Row> columns={invoiceColumns} data={invoices} serialNumber={false} rowKey={(r) => r.id} emptyTitle="No invoices yet" /></Card> },
        { key: 'quotations', label: 'Quotations', badge: <span className="ml-1.5">{quotations.length}</span>, content: <Card padded={false}><CardHeader title="Quotations" description="Price quotations sent to your company." /><DataTable<Row> columns={quotationColumns} data={quotations} serialNumber={false} rowKey={(r) => r.id} emptyTitle="No quotations yet" /></Card> },
      ]} />
    </div>
  );
}
