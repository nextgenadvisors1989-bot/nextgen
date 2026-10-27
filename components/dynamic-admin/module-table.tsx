'use client';

/**
 * Dynamic module register.
 *
 * The catalogue every audit / assessment / risk / study / permit form lives in.
 * Creating a module, publishing it, cloning it and assigning it to roles all
 * happen here; the forms themselves are built in the form builder.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Switch, Textarea } from '@/components/ui/input';
import { Select, MultiSelect } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { MODULE_TYPES } from '@/lib/validations/dynamic-module.validation';

export interface ModuleRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  version: string;
  module_type: string;
  default_tat_days: number | null;
  requires_verification: number | boolean;
  is_public: number | boolean;
  sort_order: number;
  status: string;
  form_count: number | string;
  submission_count: number | string;
  role_count: number | string;
  created_at: string;
  updated_at: string;
}

export interface ModuleStats {
  total: number;
  published: number;
  draft: number;
  archived: number;
  forms: number;
  submissions: number;
  awaitingReview: number;
}

interface Option {
  value: string;
  label: string;
}

const EMPTY_DRAFT = {
  name: '',
  module_type: 'AUDIT',
  description: '',
  category: '',
  default_tat_days: '15',
  requires_verification: true,
  is_public: false,
  create_default_form: true,
  roles: [] as string[],
};

export function ModuleTable({
  stats,
  roleOptions,
  permissions,
}: {
  stats: ModuleStats;
  roleOptions: Option[];
  permissions: { create: boolean; update: boolean; remove: boolean };
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<ModuleRow>({
    endpoint: '/api/admin/dynamic-modules',
    initialFilters: { search: '', status: 'all', module_type: 'all' },
    initialSortBy: 'sort_order',
    initialSortDir: 'asc',
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_DRAFT });
  const [creating, setCreating] = useState(false);
  const [pendingPublish, setPendingPublish] = useState<ModuleRow | null>(null);
  const [pendingClone, setPendingClone] = useState<ModuleRow | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<ModuleRow | null>(null);
  const [working, setWorking] = useState(false);

  async function create() {
    setCreating(true);
    try {
      const response = await api.post<{ moduleId: number; slug: string; formId: number | null }>('/api/admin/dynamic-modules', {
        name: draft.name,
        module_type: draft.module_type,
        description: draft.description || null,
        category: draft.category || null,
        default_tat_days: draft.default_tat_days ? Number(draft.default_tat_days) : null,
        requires_verification: draft.requires_verification,
        is_public: draft.is_public,
        create_default_form: draft.create_default_form,
        roles: draft.roles,
      });
      if (!response.ok) throw new Error(response.message);
      const created = response.data as { moduleId?: number; slug?: string } | undefined;
      success(`Module “${draft.name}” created`);
      setCreateOpen(false);
      setDraft({ ...EMPTY_DRAFT });
      if (created?.moduleId) router.push(`/admin/dynamic-modules/${created.moduleId}`);
      else list.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function publish(row: ModuleRow) {
    setWorking(true);
    try {
      const response = await api.post<{ version: string; forms: number; publishedForms: number; skipped?: { name: string; reason: string }[] }>(`/api/admin/dynamic-modules/${row.id}/publish`, {});
      if (!response.ok) throw new Error(response.message);
      const published = response.data as { version?: string; forms?: number; liveForms?: number; skipped?: { name: string; reason: string }[] } | undefined;
      const skipped = published?.skipped ?? [];
      success(`Module published as v${published?.version ?? ''} — ${published?.liveForms ?? 0} of ${published?.forms ?? 0} form(s) live`);
      if (skipped.length > 0) {
        errorToast(`${skipped.length} form(s) stayed in draft — ${skipped.map((entry) => `${entry.name}: ${entry.reason}`).join('; ')}`);
      }
      setPendingPublish(null);
      list.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function clone(row: ModuleRow) {
    setWorking(true);
    try {
      const response = await api.post<{ moduleId: number }>(`/api/admin/dynamic-modules/${row.id}/clone`, {
        name: cloneName, copy_assignments: true, copy_forms: true,
      });
      if (!response.ok) throw new Error(response.message);
      const cloned = response.data as { moduleId?: number } | undefined;
      success('Module duplicated');
      setPendingClone(null);
      if (cloned?.moduleId) router.push(`/admin/dynamic-modules/${cloned.moduleId}`);
      else list.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function remove(row: ModuleRow) {
    setWorking(true);
    try {
      const response = await api.delete(`/api/admin/dynamic-modules/${row.id}`);
      if (!response.ok) throw new Error(response.message);
      success(`${row.name} deleted`);
      setPendingDelete(null);
      list.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const columns: Column<ModuleRow>[] = [
    {
      key: 'name',
      header: 'Module',
      className: 'min-w-[260px]',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/dynamic-modules/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {row.name}
          </Link>
          <span className="block text-xs text-ink-muted">
            {row.slug} · v{row.version}
            {row.category ? ` · ${row.category}` : ''}
          </span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <div className="flex flex-col items-start gap-1">
          <Badge tone="violet">{row.module_type}</Badge>
          <span className="text-xs text-ink-muted">
            {Number(row.requires_verification) ? `Verification · TAT ${row.default_tat_days ?? '—'}d` : 'No verification'}
          </span>
        </div>
      ),
    },
    {
      key: 'contents',
      header: 'Forms & Submissions',
      hideOnMobile: true,
      render: (row) => (
        <div className="text-sm text-ink-soft">
          <span className="block">{formatNumber(Number(row.form_count))} form(s)</span>
          <span className="block text-xs text-ink-muted">{formatNumber(Number(row.submission_count))} submission(s)</span>
        </div>
      ),
    },
    {
      key: 'access',
      header: 'Access',
      hideOnMobile: true,
      render: (row) => (
        <div className="text-sm text-ink-soft">
          <span className="block">{Number(row.role_count)} role(s)</span>
          <span className="block text-xs text-ink-muted">{Number(row.is_public) ? 'Public' : 'Restricted'}</span>
        </div>
      ),
    },
    {
      key: 'updated',
      header: 'Updated',
      hideOnMobile: true,
      render: (row) => <span className="text-xs text-ink-muted">{formatDate(row.updated_at)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'actions',
      header: 'Action',
      width: '210px',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-2">
          <Link href={`/admin/dynamic-modules/${row.id}`} className="text-xs font-medium text-brand-600 hover:underline">Open</Link>
          {permissions.update && row.status !== 'published' && (
            <Button size="sm" variant="ghost" onClick={() => setPendingPublish(row)}>Publish</Button>
          )}
          {permissions.create && (
            <Button size="sm" variant="ghost" onClick={() => { setCloneName(`${row.name} (Copy)`); setPendingClone(row); }}>Clone</Button>
          )}
          {permissions.remove && (
            <Button size="sm" variant="ghost" onClick={() => setPendingDelete(row)}>Delete</Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Modules" value={formatNumber(stats.total)} hint={`${formatNumber(stats.published)} published`} tone="brand" />
        <StatCard label="Forms" value={formatNumber(stats.forms)} hint="Across every module" tone="violet" />
        <StatCard label="Submissions" value={formatNumber(stats.submissions)} hint="All time" tone="slate" />
        <StatCard label="Awaiting Review" value={formatNumber(stats.awaitingReview)} hint="With a verifier" tone={stats.awaitingReview > 0 ? 'amber' : 'emerald'} />
        <StatCard label="Drafts & Archived" value={`${formatNumber(stats.draft)} / ${formatNumber(stats.archived)}`} hint="Not live" tone="slate" />
      </div>

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Filters
            definitions={[
              { key: 'search', type: 'search', placeholder: 'Search modules by name, slug or category…' },
              { key: 'status', type: 'select', label: 'Status', options: [{ value: 'all', label: 'All statuses' }, { value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }] },
              { key: 'module_type', type: 'select', label: 'Type', options: [{ value: 'all', label: 'All types' }, ...MODULE_TYPES.map((type) => ({ value: type, label: type }))] },
            ]}
            values={list.filters}
            onChange={list.setFilter}
            onClear={list.clearFilters}
          />
        </div>
        <div className="flex justify-end px-4 pb-3">
          {permissions.create && (
            <Button onClick={() => setCreateOpen(true)}>+ New module</Button>
          )}
        </div>
        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          serialNumber
          emptyTitle="No dynamic modules yet"
          emptySubtitle="Create a module (audit, assessment, risk, study, work permit or custom) and then build its forms field by field."
          emptyAction={permissions.create ? <Button onClick={() => setCreateOpen(true)}>+ New module</Button> : undefined}
          footer={list.data.length > 0 ? <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} /> : null}
        />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New dynamic module"
        description="A module groups the forms that belong together and decides who may use them and whether submissions need verification."
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={create} loading={creating} disabled={draft.name.trim().length < 3}>Create module</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Module name"
            value={draft.name}
            onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
            placeholder="e.g. Fire Safety Compliance Audit"
            required
          />
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Module type"
              value={draft.module_type}
              onChange={(value) => setDraft((current) => ({ ...current, module_type: value }))}
              options={MODULE_TYPES.map((type) => ({ value: type, label: type }))}
            />
            <Input
              label="Default TAT (days)"
              type="number"
              min={1}
              max={365}
              value={draft.default_tat_days}
              onChange={(event) => setDraft((current) => ({ ...current, default_tat_days: event.target.value }))}
              helper="Turn-around time used when an auditor starts an assignment."
            />
          </div>
          <Input
            label="Category"
            value={draft.category}
            onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))}
            placeholder="e.g. Fire & Safety"
          />
          <Textarea
            label="Description"
            rows={3}
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            helper="Shown on the module card and in the auditor's assigned-modules list."
          />
          <MultiSelect
            label="Roles allowed to use this module"
            options={roleOptions}
            values={draft.roles}
            onChange={(values) => setDraft((current) => ({ ...current, roles: values }))}
          />
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-muted p-3">
            <Switch
              label="Submissions need verification"
              checked={draft.requires_verification}
              onChange={(checked) => setDraft((current) => ({ ...current, requires_verification: checked }))}
            />
            <Switch
              label="Module is publicly visible on the website"
              checked={draft.is_public}
              onChange={(checked) => setDraft((current) => ({ ...current, is_public: checked }))}
            />
            <Checkbox
              label="Create a standard form with one starter section"
              checked={draft.create_default_form}
              onChange={(event) => setDraft((current) => ({ ...current, create_default_form: event.target.checked }))}
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingPublish)}
        title="Publish this module?"
        message="Publishing bumps the module version, publishes every form that is structurally valid and makes the module available to the roles it is assigned to."
        confirmLabel="Publish"
        loading={working}
        onConfirm={() => { if (pendingPublish) void publish(pendingPublish); }}
        onClose={() => setPendingPublish(null)}
      />

      <Modal
        open={Boolean(pendingClone)}
        onClose={() => setPendingClone(null)}
        title="Clone module"
        description="Forms, fields, tables and role assignments are copied. Submissions are never copied."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingClone(null)}>Cancel</Button>
            <Button loading={working} disabled={cloneName.trim().length < 3} onClick={() => { if (pendingClone) void clone(pendingClone); }}>Clone module</Button>
          </div>
        }
      >
        <Input label="Name of the copy" value={cloneName} onChange={(event) => setCloneName(event.target.value)} required />
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this module?"
        message={`${pendingDelete?.name ?? ''} and all of its forms will be removed. Modules that already hold submissions can only be archived.`}
        confirmLabel="Delete"
        variant="danger"
        loading={working}
        onConfirm={() => { if (pendingDelete) void remove(pendingDelete); }}
        onClose={() => setPendingDelete(null)}
      />

      {list.error && (
        <Card>
          <div className="p-6">
            <EmptyState title="The module list could not be loaded" subtitle={list.error} />
          </div>
        </Card>
      )}
    </div>
  );
}
