'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { ComplianceBadge, ComplianceStats, DaysBadge, type LookupOption } from '@/components/compliance/shared';
import { DOCUMENT_TYPES, EXPIRY_STATUSES } from '@/lib/validations/compliance.validation';

interface DocumentRow {
  id: number;
  document_name: string;
  document_type: string;
  employer_id: number;
  company_name?: string;
  unit_name?: string | null;
  act_name?: string | null;
  act_short_name?: string | null;
  document_number: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  days_to_expiry?: number | null;
  effective_status?: string;
  compliance_status: string;
  is_verified: boolean | number;
  has_file?: number;
}

export function DocumentsTable({ canCreate, canDelete }: { canCreate: boolean; canDelete: boolean }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<DocumentRow>({
    endpoint: '/api/admin/compliance/documents',
    initialFilters: {
      search: '', employer_id: 'all', document_type: 'all', compliance_status: 'all',
      act_id: 'all', expiringWithin: 'all', from_date: '', to_date: '',
    },
    initialSortBy: 'expiry_date',
    initialSortDir: 'asc',
  });
  const [pendingDelete, setPendingDelete] = useState<DocumentRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const employerOptions = (list.extra.employerOptions as LookupOption[] | undefined) ?? [];
  const actOptions = (list.extra.actOptions as LookupOption[] | undefined) ?? [];
  const stats = list.extra.stats as Record<string, number> | undefined;
  const types = (list.extra.types as { document_type: string; total: number; expired: number }[] | undefined) ?? [];

  const columns: Column<DocumentRow>[] = [
    {
      key: 'document',
      header: 'Document',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/compliance/documents/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.document_name, 46)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {[row.document_type, row.document_number].filter(Boolean).join(' · ')}
          </span>
        </div>
      ),
    },
    {
      key: 'holder',
      header: 'Employer',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-ink-soft">
          {row.company_name ? (
            <Link href={`/admin/employers/${row.employer_id}`} className="hover:underline">{truncate(row.company_name, 30)}</Link>
          ) : '—'}
          {row.unit_name ? <span className="block text-xs text-ink-muted">{row.unit_name}</span> : null}
        </span>
      ),
    },
    {
      key: 'authority',
      header: 'Issuing authority',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{truncate(row.issuing_authority ?? '—', 30)}</span>,
    },
    {
      key: 'expiry',
      header: 'Expiry',
      render: (row) => (
        <span className="text-ink-soft">
          {row.expiry_date ? formatDate(row.expiry_date) : '—'}
          <span className="mt-1 flex">
            <DaysBadge days={row.days_to_expiry ?? null} />
          </span>
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
      header: 'File',
      align: 'center',
      hideOnMobile: true,
      render: (row) => (row.has_file ? <Badge tone="info">Attached</Badge> : <span className="text-ink-muted">—</span>),
    },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <Link href={`/admin/compliance/documents/${row.id}`} className="btn-icon" title="Open document" aria-label={`Open ${row.document_name}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          <Link href={`/admin/compliance/documents/${row.id}/edit`} className="btn-icon" title="Edit document" aria-label={`Edit ${row.document_name}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </Link>
          {canDelete && (
            <button type="button" className="btn-icon btn-icon-danger" title="Remove document"
              aria-label={`Remove ${row.document_name}`} onClick={() => setPendingDelete(row)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </span>
      ),
    },
  ];

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await api.delete(`/api/admin/compliance/documents/${pendingDelete.id}`);
    setDeleting(false);
    setPendingDelete(null);
    if (result.ok) {
      success('Document removed', `${pendingDelete.document_name} was removed from the legal register.`);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not remove the document', result.message);
    }
  }

  return (
    <div className="space-y-5">
      <ComplianceStats
        items={[
          { label: 'Documents tracked', value: formatNumber(stats?.total ?? list.pagination.total), hint: 'Licences, certificates, permits and returns', tone: 'brand' },
          { label: 'Expiring within 30 days', value: formatNumber(stats?.within30 ?? 0), hint: `${formatNumber(stats?.expiringSoon ?? 0)} in the reminder window`, tone: 'warning' },
          { label: 'Expired', value: formatNumber(stats?.expired ?? 0), hint: 'Renewal overdue', tone: 'danger' },
          { label: 'Verified', value: formatNumber(stats?.verified ?? 0), hint: `${formatNumber(stats?.renewalApplied ?? 0)} renewal applied`, tone: 'success' },
        ]}
      />

      {types.length > 0 && (
        <Card>
          <h3 className="mb-3 text-sm font-semibold text-ink">By document type</h3>
          <div className="flex flex-wrap gap-2">
            {types.map((row) => (
              <span key={row.document_type} className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-sm">
                <span className="text-ink-soft">{row.document_type}</span>
                <span className="font-semibold text-ink">{formatNumber(row.total)}</span>
                {Number(row.expired) > 0 && <Badge tone="danger">{formatNumber(row.expired)} expired</Badge>}
              </span>
            ))}
          </div>
        </Card>
      )}

      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by document, number, authority or employer…' },
            {
              key: 'employer_id', type: 'select', label: 'Employer',
              options: [{ value: 'all', label: 'All employers' }, ...employerOptions.map((option) => ({ value: option.value, label: option.label }))],
            },
            {
              key: 'document_type', type: 'select', label: 'Type',
              options: [{ value: 'all', label: 'All types' }, ...DOCUMENT_TYPES.map((value) => ({ value, label: value }))],
            },
            {
              key: 'compliance_status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, ...EXPIRY_STATUSES.map((value) => ({ value, label: value }))],
            },
            {
              key: 'act_id', type: 'select', label: 'Act',
              options: [{ value: 'all', label: 'All acts' }, ...actOptions.map((option) => ({ value: option.value, label: option.label }))],
            },
            {
              key: 'expiringWithin', type: 'select', label: 'Expiring in',
              options: [
                { value: 'all', label: 'Any time' },
                { value: '15', label: 'Next 15 days' },
                { value: '30', label: 'Next 30 days' },
                { value: '60', label: 'Next 60 days' },
                { value: '90', label: 'Next 90 days' },
              ],
            },
            { key: 'from_date', type: 'date', label: 'Expiry from' },
            { key: 'to_date', type: 'date', label: 'Expiry to' },
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
                  ['Document', 'Type', 'Number', 'Employer', 'Unit', 'Act', 'Issuing authority', 'Issue date', 'Expiry date', 'Days to expiry', 'Status', 'Verified'],
                  list.data.map((row) => [
                    row.document_name, row.document_type, row.document_number, row.company_name, row.unit_name,
                    row.act_name, row.issuing_authority, row.issue_date, row.expiry_date, row.days_to_expiry ?? '',
                    row.effective_status ?? row.compliance_status, row.is_verified ? 'Yes' : 'No',
                  ])
                )}
              >
                Export CSV
              </Button>
              {canCreate && <LinkButton href="/admin/compliance/documents/create" size="sm">Add Document</LinkButton>}
            </div>
          }
        />

        <DataTable<DocumentRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No compliance documents found"
          emptySubtitle="Adjust the filters, or record the licences and certificates an audit will ask for."
          emptyAction={canCreate ? <LinkButton href="/admin/compliance/documents/create" size="sm">Add Document</LinkButton> : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 text-sm text-red-600">{list.error}</p>}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Remove this document?"
        message={pendingDelete
          ? `${pendingDelete.document_name} will be removed from the legal register. The file attachment and its history are retained.`
          : ''}
        confirmLabel="Remove Document"
        variant="danger"
      />
    </div>
  );
}
