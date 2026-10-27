'use client';

/**
 * The groundwater NOC register: every NOC with its approved quantity, its validity, how much water the meters say is really
 * being drawn (last 30 days, against the limit) and how many conditions are ticked. The API scopes the rows by role.
 */
import { useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { useList } from '@/lib/utils/use-list';
import { formatDate } from '@/lib/utils/dates';
import { WaterNocCreateModal } from '@/components/water/water-noc-create-modal';
import { NOC_STATUS_TONE, USAGE_TONE, type NocListRow, type NocPanel } from '@/types/water';

export function WaterNocRegister({ panel, canCreate = false }: { panel: NocPanel; canCreate?: boolean }) {
  const list = useList<NocListRow>({ endpoint: '/api/water-noc', initialFilters: { search: '' }, initialSortBy: 'expiry_date', initialSortDir: 'asc' });
  const [createOpen, setCreateOpen] = useState(false);

  const columns: Column<NocListRow>[] = [
    {
      key: 'noc',
      header: 'NOC',
      className: 'min-w-[200px]',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/${panel}/water-noc/${row.id}`} className="font-medium text-brand-600 hover:underline">{row.noc_number}</Link>
          <span className="block text-xs text-ink-muted">{row.issuing_authority ?? 'Authority not recorded'}</span>
        </div>
      ),
    },
    {
      key: 'employer',
      header: 'Company',
      hideOnMobile: true,
      render: (row) => (
        <div className="max-w-[220px]">
          <span className="block text-ink-soft">{row.employer_name}</span>
          {row.unit_name && <span className="block text-xs text-ink-muted">{row.unit_name}</span>}
        </div>
      ),
    },
    {
      key: 'approved',
      header: 'Approved',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (
        <span className="whitespace-nowrap">
          <strong className="text-ink">{(Number(row.approved_quantity_lpd) / 1000).toLocaleString('en-IN', { maximumFractionDigits: 1 })}</strong>
          <span className="text-xs text-ink-muted"> KLD</span>
        </span>
      ),
    },
    {
      key: 'validity',
      header: 'Valid until',
      hideOnMobile: true,
      render: (row) => (
        <div className="whitespace-nowrap">
          <span className="block text-ink-soft">{row.expiry_date ? formatDate(row.expiry_date) : '-'}</span>
          <Badge tone={NOC_STATUS_TONE[row.derived_status] ?? 'slate'}>{row.derived_status}</Badge>
        </div>
      ),
    },
    {
      key: 'usage',
      header: 'Drawn (30 days)',
      render: (row) => (
        <div className="min-w-[130px]">
          {row.avg_kld_30 === null ? (
            <span className="text-xs text-ink-muted">No readings yet</span>
          ) : (
            <>
              <span className="block whitespace-nowrap text-ink"><strong>{row.avg_kld_30.toFixed(1)}</strong> <span className="text-xs text-ink-muted">KLD · {row.percent_30?.toFixed(0)}%</span></span>
              <Badge tone={USAGE_TONE[row.usage_status] ?? 'slate'}>{row.usage_status}</Badge>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'conditions',
      header: 'Conditions',
      hideOnMobile: true,
      align: 'center',
      render: (row) => (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <Badge tone={row.conditions_total > 0 && row.conditions_compliant === row.conditions_total ? 'success' : 'slate'}>{row.conditions_compliant}/{row.conditions_total} met</Badge>
          {row.conditions_non_compliant > 0 && <Badge tone="danger">{row.conditions_non_compliant} not met</Badge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <LinkButton href={`/${panel}/water-noc/${row.id}`} size="sm" variant="outline">Open</LinkButton>
          <a className="btn-icon" title="Download PDF" aria-label={`Download ${row.noc_number}`} href={`/api/pdf/water-noc/${row.id}`} target="_blank" rel="noreferrer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" /></svg>
          </a>
        </span>
      ),
    },
  ];

  return (
    <>
      <Card padded={false}>
        <Filters
          definitions={[{ key: 'search', type: 'search', placeholder: 'Search by NOC number, company or authority' }]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={canCreate ? <Button size="sm" onClick={() => setCreateOpen(true)}>+ Record NOC</Button> : undefined}
        />
        <DataTable<NocListRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No groundwater NOC recorded"
          emptySubtitle={panel === 'employer' ? 'Your auditor records your groundwater NOC here, with its conditions and the water meter readings.' : 'Record a company’s groundwater NOC, tick its conditions on each visit and keep the meter readings.'}
          footer={list.data.length > 0 ? <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} /> : null}
        />
      </Card>
      {list.error && <p className="px-4 pb-3 text-sm text-red-600">{list.error}</p>}
      {canCreate && <WaterNocCreateModal open={createOpen} onClose={() => setCreateOpen(false)} panel={panel === 'admin' ? 'admin' : 'auditor'} />}
    </>
  );
}
