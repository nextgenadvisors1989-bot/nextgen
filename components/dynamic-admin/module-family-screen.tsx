'use client';

/**
 * One of the module families from the auditor's side: the modules the auditor may
 * work on, and the submissions they have started against them.
 *
 * Both lists are scoped server-side — the module list to what the signed-in
 * auditor is assigned, the submissions to their own drafts and filings — so the
 * screen never offers a module the auditor cannot open.
 */
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { LinkButton } from '@/components/ui/button';
import { Spinner } from '@/components/ui/loader';
import { EmptyState } from '@/components/ui/empty-state';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import type { ModuleFamily } from './module-family-register';

interface ModuleRow {
  id: number;
  name: string;
  slug: string;
  module_type?: string | null;
  category: string | null;
  forms_count: number | null;
  default_tat_days: number | null;
  status: string;
}

interface SubmissionRow {
  id: number;
  submission_number: string;
  module_name: string;
  form_name: string;
  title: string | null;
  status: string;
  score_percentage: number | null;
  updated_at: string;
}

export function AuditorModuleFamilyScreen({ family, canStart = true }: {
  family: ModuleFamily;
  canStart?: boolean;
}) {
  // `/api/auditor/forms` answers `{ modules, stats }` in one envelope rather than a
  // paginated `data` array, so it is read directly instead of through `useList`.
  const [allModules, setAllModules] = useState<ModuleRow[]>([]);
  const [modulesLoading, setModulesLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const response = await api.get<{ modules?: ModuleRow[] }>('/api/auditor/forms');
        setAllModules(response.data?.modules ?? []);
      } catch {
        setAllModules([]);
      } finally {
        setModulesLoading(false);
      }
    })();
  }, []);
  const submissions = useList<SubmissionRow>({
    endpoint: '/api/auditor/submissions',
    initialFilters: { module_type: family.type },
    initialLimit: 10,
  });

  const familyModules = useMemo(
    () => allModules.filter((row) => String(row.module_type ?? '').toUpperCase() === family.type),
    [allModules, family.type]
  );

  const moduleColumns: Column<ModuleRow>[] = [
    {
      key: 'module',
      header: family.singular,
      render: (row) => (
        <div className="min-w-0">
          <span className="block font-medium text-ink">{truncate(row.name, 48)}</span>
          <span className="block text-xs text-ink-muted">{row.slug}{row.category ? ` · ${row.category}` : ''}</span>
        </div>
      ),
    },
    { key: 'forms', header: 'Forms', align: 'right', render: (row) => formatNumber(Number(row.forms_count ?? 0)) },
    {
      key: 'tat',
      header: 'Turnaround',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (row.default_tat_days ? `${formatNumber(Number(row.default_tat_days))} days` : '—'),
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      render: (row) => (
        canStart ? (
          <Link href={"/auditor/modules"} className="text-sm font-medium text-brand-600 hover:underline">
            Open forms
          </Link>
        ) : <Badge tone="slate">Read only</Badge>
      ),
    },
  ];

  const submissionColumns: Column<SubmissionRow>[] = [
    {
      key: 'submission',
      header: family.singular,
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/auditor/submissions/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.title || row.module_name, 44)}
          </Link>
          <span className="block text-xs text-ink-muted">{row.submission_number} · {row.form_name}</span>
        </div>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      render: (row) => (row.score_percentage === null || row.score_percentage === undefined
        ? '—'
        : `${formatNumber(Math.round(Number(row.score_percentage)))}%`),
    },
    { key: 'updated', header: 'Last worked on', hideOnMobile: true, render: (row) => formatDate(row.updated_at) },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={`${family.label} available`} value={formatNumber(familyModules.length)} tone="brand" />
        <StatCard label="You have started" value={formatNumber(submissions.pagination.total)} tone="amber" />
        <StatCard
          label="Filed or approved"
          value={formatNumber(submissions.data.filter((row) => ['Submitted', 'Approved'].includes(row.status)).length)}
          tone="emerald"
        />
      </div>

      <Card padded={false}>
        <CardHeader
          title={family.label}
          description={family.description}
          action={<LinkButton href="/auditor/modules" variant="outline" size="sm">All my modules</LinkButton>}
        />
        {modulesLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : familyModules.length === 0 ? (
          <EmptyState
            title={`No ${family.label.toLowerCase()} are assigned to you`}
            subtitle="An administrator assigns modules to your role; they appear here once they are published to you."
          />
        ) : (
          <DataTable columns={moduleColumns} data={familyModules} rowKey={(row) => row.id} />
        )}
      </Card>

      <Card padded={false}>
        <CardHeader title={`Your ${family.label.toLowerCase()}`} description="Drafts save as you go; filed work waits for a verifier." />
        <DataTable
          columns={submissionColumns}
          data={submissions.data}
          rowKey={(row) => row.id}
          loading={submissions.loading}
          emptyTitle={`You have not started any ${family.singular.toLowerCase()} yet`}
          emptySubtitle={`Open one of the ${family.label.toLowerCase()} above to begin — drafts save as you go.`}
        />
        {submissions.data.length > 0 && (
          <Pagination pagination={submissions.pagination} onPageChange={submissions.setPage} onLimitChange={submissions.setLimit} />
        )}
      </Card>
    </div>
  );
}
