'use client';

/**
 * One of the platform's module families (assessments, risks, studies, work
 * permits) as a register: every module of that family, how many forms each one
 * carries, and where it has been published.
 *
 * The family is a filter over the same module table the builder writes to — there
 * is no separate register per family, so a module added in Modules & Forms shows
 * up here the moment it is given the family's type.
 */
import Link from 'next/link';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { useList } from '@/lib/utils/use-list';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';

export interface ModuleFamily {
  /** `MODULE_TYPES` value that selects this family. */
  type: string;
  label: string;
  singular: string;
  description: string;
}

interface ModuleRow {
  id: number;
  name: string;
  slug: string;
  category: string | null;
  status: string;
  version: string | null;
  forms_count: number | null;
  submissions_count?: number | null;
  default_tat_days: number | null;
  requires_verification: number | null;
  updated_at: string | null;
}

export function AdminModuleFamilyRegister({ family, canCreate = true }: {
  family: ModuleFamily;
  canCreate?: boolean;
}) {
  const list = useList<ModuleRow>({
    endpoint: '/api/admin/dynamic-modules',
    initialFilters: { search: '', status: 'all', module_type: family.type },
    initialSortBy: 'sort_order',
    initialSortDir: 'asc',
  });

  const columns: Column<ModuleRow>[] = [
    {
      key: 'module',
      header: family.singular,
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/dynamic-modules/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.name, 48)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {row.slug}{row.version ? ` · ${row.version}` : ''}
          </span>
        </div>
      ),
    },
    { key: 'category', header: 'Category', hideOnMobile: true, render: (row) => row.category ?? '—' },
    {
      key: 'forms',
      header: 'Forms',
      align: 'right',
      render: (row) => formatNumber(Number(row.forms_count ?? 0)),
    },
    {
      key: 'tat',
      header: 'Turnaround',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (row.default_tat_days ? `${formatNumber(Number(row.default_tat_days))} days` : '—'),
    },
    {
      key: 'verification',
      header: 'Verification',
      hideOnMobile: true,
      render: (row) => (Number(row.requires_verification) === 1
        ? <Badge tone="violet">Needs a verifier</Badge>
        : <Badge tone="slate">Self-contained</Badge>),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'updated',
      header: 'Last changed',
      hideOnMobile: true,
      render: (row) => (row.updated_at ? formatDate(row.updated_at) : '—'),
    },
  ];

  const published = list.data.filter((row) => ['published', 'active'].includes(String(row.status).toLowerCase())).length;
  const forms = list.data.reduce((total, row) => total + Number(row.forms_count ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={`${family.label} defined`} value={formatNumber(list.pagination.total)} tone="brand" />
        <StatCard label="Published" value={formatNumber(published)} tone="emerald" />
        <StatCard label="Forms across the family" value={formatNumber(forms)} tone="slate" />
      </div>

      <Card padded={false}>
        <div className="px-4 pt-4">
          <CardHeader
            title={family.label}
            description={family.description}
            action={
              canCreate ? (
                <LinkButton href="/admin/dynamic-modules" size="sm">Open the module builder</LinkButton>
              ) : undefined
            }
          />
        </div>

        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: `Search ${family.label.toLowerCase()}…` },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [
                { value: 'draft', label: 'Draft' },
                { value: 'published', label: 'Published' },
                { value: 'archived', label: 'Archived' },
              ],
            },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
        />

        <DataTable
          columns={columns}
          data={list.data}
          rowKey={(row) => row.id}
          loading={list.loading}
          emptyTitle={`No ${family.label.toLowerCase()} defined yet`}
          emptySubtitle={`Build the first ${family.singular.toLowerCase()} in Modules & Forms, add its form and publish it to the panels that need it.`}
        />

        {list.data.length > 0 && (
          <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
        )}
      </Card>
    </div>
  );
}
