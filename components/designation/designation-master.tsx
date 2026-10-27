'use client';

/** The Designation Master register: search and filter, add, edit, delete. Administrators manage the shared master; an employer manages its own rows. */
import { useEffect, useMemo, useState } from 'react';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/table';
import { Filters } from '@/components/ui/filters';
import { Pagination } from '@/components/ui/pagination';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { DesignationFormModal, type DesignationLookups, type DesignationRow } from '@/components/designation/designation-form-modal';

const money = (v: number | null) => (v === null ? '-' : v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const LEVEL_TONE: Record<string, 'slate' | 'info' | 'success' | 'warning' | 'violet' | 'brand'> = { Unskilled: 'slate', 'Semi-skilled': 'info', Skilled: 'success', Supervisory: 'warning', 'Junior Executive': 'violet', 'Senior Executive': 'violet', 'Chief Executive': 'brand' };

export function DesignationMaster({ panel }: { panel: 'admin' | 'employer' }) {
  const toast = useToast();
  const list = useList<DesignationRow>({ endpoint: `/api/${panel}/designations`, initialFilters: { search: '', industry: '', level: '', status: '', scope: '' }, initialLimit: 25 });
  const [lookups, setLookups] = useState<DesignationLookups | null>(null);
  const [editing, setEditing] = useState<DesignationRow | null | undefined>(undefined); // undefined = closed, null = new
  const [removing, setRemoving] = useState<DesignationRow | null>(null);

  useEffect(() => { api.get<DesignationLookups>(`/api/${panel}/designations/lookups`).then((r) => { if (r.ok && r.data) setLookups(r.data); }); }, [panel]);

  const canEdit = (row: DesignationRow) => panel === 'admin' || row.employer_id !== null;
  const industryOptions = useMemo(() => (lookups?.industries ?? []).map((i) => ({ value: i.code, label: `${i.code}. ${i.name} (${i.count})` })), [lookups]);

  async function confirmRemove() {
    if (!removing) return;
    const response = await api.delete(`/api/${panel}/designations/${removing.id}`);
    if (response.ok) { toast.success(response.message); setRemoving(null); list.refresh(); } else { toast.error(response.message); setRemoving(null); }
  }

  const columns: Column<DesignationRow>[] = [
    { key: 'name', header: 'Designation', render: (r) => (
      <div className="min-w-[180px]">
        <div className="font-medium text-ink">{r.designation_name}</div>
        <div className="text-xs text-ink-muted">{r.industry_code ? `${r.industry_code}. ${r.industry_name}` : 'No industry'}{r.group_name ? ` · ${r.group_name}` : ''}</div>
      </div>
    ) },
    { key: 'department', header: 'Department', hideOnMobile: true, render: (r) => <span className="text-ink-soft">{r.department ?? '-'}</span> },
    { key: 'level', header: 'Level', render: (r) => (r.skill_level ? <span title={r.level_inferred ? 'Worked out from the name; please confirm' : undefined}><Badge tone={LEVEL_TONE[r.skill_level] ?? 'default'}>{r.skill_level}{r.level_inferred ? ' *' : ''}</Badge></span> : <span className="text-ink-muted">-</span>) },
    { key: 'nature', header: 'Nature of work', hideOnMobile: true, render: (r) => <span className="text-ink-soft">{r.nature_of_work ?? '-'}</span> },
    { key: 'gross', header: 'Gross wage', align: 'right', hideOnMobile: true, render: (r) => <span className="tabular-nums text-ink-soft">{money(r.wage_gross)}</span> },
    { key: 'owner', header: 'List', hideOnMobile: true, render: (r) => (r.employer_id === null ? <Badge tone="default">Shared master</Badge> : <Badge tone="brand">{panel === 'admin' ? (r.employer_name ?? 'Company') : 'Your company'}</Badge>) },
    { key: 'used', header: 'Employees', align: 'right', hideOnMobile: true, render: (r) => <span className="tabular-nums text-ink-soft">{r.employees_count}</span> },
    { key: 'status', header: 'Status', align: 'center', render: (r) => <Badge tone={r.status === 'active' ? 'success' : 'slate'}>{r.status === 'active' ? 'Active' : 'Inactive'}</Badge> },
    { key: 'actions', header: '', align: 'right', render: (r) => (
      <span className="flex items-center justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>{canEdit(r) ? 'Edit' : 'View'}</Button>
        {canEdit(r) && <Button size="sm" variant="ghost" onClick={() => setRemoving(r)}>Delete</Button>}
      </span>
    ) },
  ];

  const total = list.pagination.total;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Designations" value={String(lookups ? lookups.industries.reduce((s, i) => s + i.count, 0) : '-')} hint="Across all industries" tone="brand" />
        <StatCard label="Industries" value={String(lookups?.industries.length ?? '-')} hint="Sections of the master" tone="violet" />
        <StatCard label="Matching the filters" value={String(total)} hint="In the list below" tone="emerald" />
        <StatCard label="Skill levels" value={String(lookups?.levels.length ?? '-')} hint="Unskilled to chief executive" tone="amber" />
      </div>

      <Card padded={false}>
        <CardHeader title="Designation Master" description={panel === 'admin'
          ? 'The shared list every company picks from when it adds an employee, with each designation\'s department, skill level, nature of work and wage mapping.'
          : 'Pick from the shared list when you add an employee, and add your own designations here. The shared master is read-only.'}
          action={<Button size="sm" onClick={() => setEditing(null)}>Add designation</Button>} />
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search designation, department or work' },
            { key: 'industry', type: 'select', label: 'Every industry', options: industryOptions },
            { key: 'level', type: 'select', label: 'Every level', options: (lookups?.levels ?? []).map((l) => ({ value: l, label: l })) },
            { key: 'status', type: 'select', label: 'Any status', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
            ...(panel === 'admin' ? [{ key: 'scope', type: 'select' as const, label: 'All lists', options: [{ value: 'master', label: 'Shared master' }, { value: 'company', label: 'Company-specific' }] }] : []),
          ]}
          values={list.filters} onChange={list.setFilter} onClear={list.clearFilters} />
        <DataTable<DesignationRow> columns={columns} data={list.data} loading={list.loading} rowKey={(r) => r.id} emptyTitle="No designations match" emptySubtitle="Change the filters, or add a designation."
          footer={<Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />} />
        <p className="px-4 pb-3 text-xs text-ink-muted">* The level was worked out from the designation's name when the list was imported (the source gave none): confirm it when you edit the row.</p>
      </Card>

      <DesignationFormModal open={editing !== undefined} onClose={() => setEditing(undefined)} panel={panel} row={editing ?? null} lookups={lookups} onSaved={() => { list.refresh(); api.get<DesignationLookups>(`/api/${panel}/designations/lookups`).then((r) => r.ok && r.data && setLookups(r.data)); }} />
      <ConfirmDialog open={Boolean(removing)} onClose={() => setRemoving(null)} onConfirm={confirmRemove} title="Delete this designation?"
        message={removing ? `"${removing.designation_name}" is removed from the list. A designation that employees use cannot be deleted: mark it inactive instead.` : ''} confirmLabel="Delete" />
    </div>
  );
}
