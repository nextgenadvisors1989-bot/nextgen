'use client';

/**
 * The employer's own legal register: the licences, certificates, permits and
 * returns their company holds, with the expiry status the platform derives from
 * the dates. Every call goes to the employer-scoped endpoints, so the company is
 * taken from the session and never from the browser.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input, Textarea } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { ComplianceBadge, ComplianceStats, DaysBadge } from '@/components/compliance/shared';
import { DOCUMENT_TYPES, EXPIRY_STATUSES } from '@/lib/validations/compliance.validation';

interface EmployerDocumentRow {
  id: number;
  document_name: string;
  document_type: string;
  document_number: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  days_to_expiry?: number | null;
  effective_status?: string;
  compliance_status: string;
  is_verified: boolean | number;
  has_file?: number;
  unit_name?: string | null;
}

export function EmployerDocumentsTable({ canCreate, canUpdate }: { canCreate: boolean; canUpdate: boolean }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<EmployerDocumentRow>({
    endpoint: '/api/employer/compliance-documents',
    initialFilters: { search: '', document_type: 'all', compliance_status: 'all', expiringWithin: 'all' },
    initialSortBy: 'expiry_date',
    initialSortDir: 'asc',
  });
  const [renewing, setRenewing] = useState<EmployerDocumentRow | null>(null);
  const [renewValues, setRenewValues] = useState({ issue_date: '', expiry_date: '', validity_period_days: '', document_number: '', fee_amount: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const stats = list.extra.stats as Record<string, number> | undefined;
  const expiring = (list.extra.expiring as EmployerDocumentRow[] | undefined) ?? [];

  const columns: Column<EmployerDocumentRow>[] = [
    {
      key: 'document',
      header: 'Document',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/employer/compliance-documents/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.document_name, 46)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {[row.document_type, row.document_number].filter(Boolean).join(' · ')}
          </span>
        </div>
      ),
    },
    {
      key: 'authority',
      header: 'Issued by',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{truncate(row.issuing_authority ?? '—', 30)}</span>,
    },
    {
      key: 'expiry',
      header: 'Expiry',
      render: (row) => (
        <span className="text-ink-soft">
          {row.expiry_date ? formatDate(row.expiry_date) : '—'}
          <span className="mt-1 flex"><DaysBadge days={row.days_to_expiry ?? null} /></span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className="flex flex-col items-start gap-1">
          <ComplianceBadge value={row.effective_status ?? row.compliance_status} />
          {Boolean(row.is_verified) && <Badge tone="success" dot>Verified</Badge>}
        </span>
      ),
    },
    {
      key: 'file',
      header: 'Certificate',
      align: 'center',
      hideOnMobile: true,
      render: (row) => (
        row.has_file
          ? <Link href={`/employer/compliance-documents/${row.id}`} className="text-brand-600 hover:underline">View</Link>
          : <span className="text-ink-muted">—</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Link href={`/employer/compliance-documents/${row.id}`} className="btn-icon" title="Open document" aria-label={`Open ${row.document_name}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {canUpdate && (
            <button type="button" className="btn-icon" title="Record renewal"
              aria-label={`Renew ${row.document_name}`}
              onClick={() => {
                setRenewing(row);
                setErrors({});
                setRenewValues({
                  issue_date: new Date().toISOString().slice(0, 10),
                  expiry_date: '', validity_period_days: '', document_number: row.document_number ?? '',
                  fee_amount: '', notes: '',
                });
              }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
              </svg>
            </button>
          )}
        </span>
      ),
    },
  ];

  async function submitRenew() {
    if (!renewing) return;
    setBusy(true);
    setErrors({});
    const result = await api.post<{ expiryDate: string; complianceStatus: string }>(
      `/api/employer/compliance-documents/${renewing.id}/renew`,
      {
        issue_date: renewValues.issue_date || null,
        expiry_date: renewValues.expiry_date || null,
        validity_period_days: renewValues.validity_period_days ? Number(renewValues.validity_period_days) : null,
        document_number: renewValues.document_number.trim() || null,
        fee_amount: renewValues.fee_amount ? Number(renewValues.fee_amount) : null,
        notes: renewValues.notes.trim() || null,
      }
    );
    setBusy(false);
    if (result.ok) {
      success('Renewal recorded', `Now valid to ${result.data?.expiryDate ?? ''} — ${result.data?.complianceStatus ?? ''}.`);
      setRenewing(null);
      list.refresh();
      router.refresh();
      return;
    }
    const mapped = fieldErrors(result);
    setErrors(Object.keys(mapped).length ? mapped : { expiry_date: result.message });
    errorToast('Could not record the renewal', result.message);
  }

  return (
    <div className="space-y-5">
      <ComplianceStats
        items={[
          { label: 'Documents on file', value: formatNumber(stats?.total ?? list.pagination.total), hint: 'Your legal register', tone: 'brand' },
          { label: 'Expiring within 30 days', value: formatNumber(stats?.within30 ?? 0), hint: 'Start the renewal now', tone: 'warning' },
          { label: 'Expired', value: formatNumber(stats?.expired ?? 0), hint: 'Renewal overdue', tone: 'danger' },
          { label: 'Verified by the auditor', value: formatNumber(stats?.verified ?? 0), hint: `${formatNumber(stats?.valid ?? 0)} currently valid`, tone: 'success' },
        ]}
      />

      {expiring.length > 0 && (
        <Card>
          <CardHeader
            title="Needs attention"
            description="Documents already expired or lapsing inside the reminder window."
          />
          <ul className="divide-y divide-line">
            {expiring.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <span className="min-w-0">
                  <Link href={`/employer/compliance-documents/${row.id}`} className="font-medium text-brand-600 hover:underline">
                    {row.document_name}
                  </Link>
                  <span className="block text-xs text-ink-muted">
                    {[row.document_type, row.expiry_date ? `expires ${formatDate(row.expiry_date)}` : null].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <ComplianceBadge value={row.effective_status ?? row.compliance_status} />
                  <DaysBadge days={row.days_to_expiry ?? null} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by document, number or authority…' },
            {
              key: 'document_type', type: 'select', label: 'Type',
              options: [{ value: 'all', label: 'All types' }, ...DOCUMENT_TYPES.map((value) => ({ value, label: value }))],
            },
            {
              key: 'compliance_status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, ...EXPIRY_STATUSES.map((value) => ({ value, label: value }))],
            },
            {
              key: 'expiringWithin', type: 'select', label: 'Expiring in',
              options: [
                { value: 'all', label: 'Any time' },
                { value: '30', label: 'Next 30 days' },
                { value: '90', label: 'Next 90 days' },
                { value: '180', label: 'Next 180 days' },
              ],
            },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm" disabled={list.data.length === 0}
                onClick={() => downloadCsv(
                  `compliance-documents-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Document', 'Type', 'Number', 'Issuing authority', 'Issue date', 'Expiry date', 'Days to expiry', 'Status'],
                  list.data.map((row) => [
                    row.document_name, row.document_type, row.document_number, row.issuing_authority,
                    row.issue_date, row.expiry_date, row.days_to_expiry ?? '',
                    row.effective_status ?? row.compliance_status,
                  ])
                )}
              >
                Export CSV
              </Button>
              {canCreate && <LinkButton href="/employer/compliance-documents/create" size="sm">Add Document</LinkButton>}
            </div>
          }
        />

        <DataTable<EmployerDocumentRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No compliance documents on file"
          emptySubtitle="Record your licences, registrations and returns so expiry reminders reach you in time."
          emptyAction={canCreate ? <LinkButton href="/employer/compliance-documents/create" size="sm">Add Document</LinkButton> : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}

      <Modal
        open={Boolean(renewing)}
        onClose={() => setRenewing(null)}
        title="Record a renewal"
        description={renewing ? `${renewing.document_name} — the expiry status and reminders update straight away.` : ''}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setRenewing(null)} disabled={busy}>Cancel</Button>
            <Button onClick={submitRenew} loading={busy}>Record Renewal</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DatePicker label="New issue date" value={renewValues.issue_date} error={errors.issue_date}
            onChange={(value) => setRenewValues((current) => ({ ...current, issue_date: value }))} />
          <DatePicker label="New expiry date" value={renewValues.expiry_date} error={errors.expiry_date}
            helper="Or give a validity period"
            onChange={(value) => setRenewValues((current) => ({ ...current, expiry_date: value }))} />
          <Input label="Validity period (days)" type="number" min={1} max={36500}
            value={renewValues.validity_period_days} error={errors.validity_period_days}
            onChange={(event) => setRenewValues((current) => ({ ...current, validity_period_days: event.target.value }))} />
          <Input label="Renewed document number" value={renewValues.document_number} error={errors.document_number}
            onChange={(event) => setRenewValues((current) => ({ ...current, document_number: event.target.value }))} />
          <Input label="Renewal fee (₹)" type="number" min={0} step="0.01"
            value={renewValues.fee_amount} error={errors.fee_amount}
            onChange={(event) => setRenewValues((current) => ({ ...current, fee_amount: event.target.value }))} />
          <div className="sm:col-span-2">
            <Textarea label="Notes" rows={3} value={renewValues.notes} error={errors.notes}
              onChange={(event) => setRenewValues((current) => ({ ...current, notes: event.target.value }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
}
