'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHeader } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Input, Textarea } from '@/components/ui/input';
import { SearchInput } from '@/components/ui/search-input';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { truncate } from '@/lib/utils/formatting';
import { AUDITOR_SPECIALIZATIONS, type AuditorType } from '@/types/auditor';

type TypeRow = AuditorType & { auditor_count?: number; module_count?: number; id: number };

interface ModuleOption {
  id: number; name: string; module_type: string; category: string | null; status: string; published_forms: number | string;
}

const EMPTY = { name: '', code: '', description: '', specialization: '', status: 'active' };

/**
 * Auditor-type register (Safety, Water, Food Safety, Environmental, Electrical,
 * Social Compliance, Quality, Fire Safety …). Types drive the auditor dropdown on
 * the assignment wizard and the default audit checklist selection.
 */
export function AuditorTypesPanel({ permissions }: { permissions: { create: boolean; update: boolean; remove: boolean } }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [rows, setRows] = useState<TypeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [editing, setEditing] = useState<TypeRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<TypeRow | null>(null);
  const [formsFor, setFormsFor] = useState<TypeRow | null>(null);
  const [moduleOptions, setModuleOptions] = useState<ModuleOption[]>([]);
  const [selectedModules, setSelectedModules] = useState<Set<number>>(new Set());
  const [formsLoading, setFormsLoading] = useState(false);
  const [formsSaving, setFormsSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    const response = await fetch(`/api/admin/auditor-types?${params.toString()}`, { cache: 'no-store' });
    const payload = await response.json();
    setLoading(false);
    if (payload.success) setRows(payload.data as TypeRow[]);
    else errorToast('Could not load auditor types', payload.message);
  }, [search, statusFilter, errorToast]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY });
    setErrors({});
    setFormOpen(true);
  }

  function openEdit(row: TypeRow) {
    setEditing(row);
    setForm({
      name: row.name,
      code: row.code,
      description: row.description ?? '',
      specialization: row.specialization ?? '',
      status: row.status,
    });
    setErrors({});
    setFormOpen(true);
  }

  async function submit() {
    setSaving(true);
    setErrors({});
    const result = editing
      ? await api.put(`/api/admin/auditor-types/${editing.id}`, form)
      : await api.post('/api/admin/auditor-types', form);
    setSaving(false);

    if (result.ok) {
      success(editing ? 'Auditor type updated' : 'Auditor type created', `${form.name} (${form.code})`);
      setFormOpen(false);
      load();
      router.refresh();
    } else {
      setErrors(fieldErrors(result));
      errorToast('Could not save auditor type', result.message);
    }
  }

  async function openForms(row: TypeRow) {
    setFormsFor(row);
    setFormsLoading(true);
    const result = await api.get<{ assigned: ModuleOption[]; available: ModuleOption[] }>(`/api/admin/auditor-types/${row.id}/modules`);
    setFormsLoading(false);
    if (!result.ok || !result.data) {
      errorToast('Could not load forms', result.message);
      setFormsFor(null);
      return;
    }
    setModuleOptions(result.data.available);
    setSelectedModules(new Set(result.data.assigned.map((module) => Number(module.id))));
  }

  async function saveForms() {
    if (!formsFor) return;
    setFormsSaving(true);
    const result = await api.put(`/api/admin/auditor-types/${formsFor.id}/modules`, { module_ids: [...selectedModules] });
    setFormsSaving(false);
    if (!result.ok) return errorToast('Could not save forms', result.message);
    success('Forms assigned', result.message);
    setFormsFor(null);
    load();
  }

  function toggleModule(id: number) {
    setSelectedModules((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await api.delete(`/api/admin/auditor-types/${pendingDelete.id}`);
    setDeleting(false);
    if (result.ok) {
      success('Auditor type archived', `${pendingDelete.name} is no longer offered on new auditors.`);
      setPendingDelete(null);
      load();
      router.refresh();
    } else {
      errorToast('Could not archive auditor type', result.message);
    }
  }

  const columns: Column<TypeRow>[] = [
    {
      key: 'name',
      header: 'Auditor Type',
      render: (row) => (
        <div className="min-w-0">
          <span className="font-medium text-ink">{row.name}</span>
          <span className="block text-xs text-ink-muted">{row.code}</span>
        </div>
      ),
    },
    {
      key: 'specialization',
      header: 'Specialisation',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{row.specialization ?? '—'}</span>,
    },
    {
      key: 'description',
      header: 'Description',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{truncate(row.description ?? '', 70) || '—'}</span>,
    },
    {
      key: 'auditors',
      header: 'Auditors',
      align: 'center',
      render: (row) => <Badge tone={Number(row.auditor_count) > 0 ? 'brand' : 'slate'}>{Number(row.auditor_count ?? 0)}</Badge>,
    },
    {
      key: 'forms',
      header: 'Audit forms',
      align: 'center',
      render: (row) => (
        <button type="button" onClick={() => openForms(row)} disabled={!permissions.update && Number(row.module_count ?? 0) === 0}
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50">
          {Number(row.module_count ?? 0)} form module{Number(row.module_count ?? 0) === 1 ? '' : 's'}
          {permissions.update && <span aria-hidden>·&nbsp;Manage</span>}
        </button>
      ),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: 'Actions',
      width: 120,
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          {permissions.update && (
            <button type="button" className="btn-icon" title="Edit type" aria-label={`Edit ${row.name}`} onClick={() => openEdit(row)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
          {permissions.remove && (
            <button type="button" className="btn-icon btn-icon-danger" title="Archive type"
              aria-label={`Archive ${row.name}`} onClick={() => setPendingDelete(row)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6" />
              </svg>
            </button>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <Card padded={false}>
        <CardHeader
          title="Auditor types"
          description="Categories applied to auditors; they drive assignment planning and the default checklist per audit."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Search types…" />
              <select
                className="input h-9 w-auto py-0 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {permissions.create && <Button size="sm" onClick={openCreate}>Add Type</Button>}
            </div>
          }
        />
        <DataTable<TypeRow>
          columns={columns}
          data={rows}
          loading={loading}
          rowKey={(row) => row.id}
          emptyTitle="No auditor types found"
          emptySubtitle="Auditor types classify the work an auditor is accredited for."
          emptyAction={permissions.create ? <Button size="sm" onClick={openCreate}>Add Type</Button> : undefined}
        />
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Add auditor type'}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submit} loading={saving}>{editing ? 'Save Changes' : 'Create Type'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Type Name" requiredMark value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} error={errors.name}
            placeholder="e.g. Boiler Safety Auditor" />
          <Input label="Code" requiredMark value={form.code}
            onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))}
            error={errors.code} placeholder="BOILER" helper="Short unique code used in filters and reports." />
          <div>
            <label className="label" htmlFor="type-specialization">Specialisation</label>
            <select
              id="type-specialization"
              className="input"
              value={form.specialization}
              onChange={(event) => setForm((current) => ({ ...current, specialization: event.target.value }))}
            >
              <option value="">Not specified</option>
              {AUDITOR_SPECIALIZATIONS.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            {errors.specialization && <p className="error-text">{errors.specialization}</p>}
          </div>
          <div>
            <label className="label" htmlFor="type-status">Status</label>
            <select
              id="type-status"
              className="input"
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            {errors.status && <p className="error-text">{errors.status}</p>}
          </div>
          <div className="sm:col-span-2">
            <Textarea label="Description" rows={3} value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              error={errors.description}
              placeholder="What this auditor type covers — statutes, equipment and inspection scope." />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(formsFor)}
        onClose={() => setFormsFor(null)}
        title={formsFor ? `Audit forms for ${formsFor.name}` : 'Audit forms'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormsFor(null)}>Close</Button>
            {permissions.update && <Button onClick={saveForms} loading={formsSaving}>Save forms</Button>}
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-muted">
          Tick the form modules this kind of auditor works with. An auditor sees only the forms of their own type. Build or edit the
          forms themselves under Dynamic Modules.
        </p>
        {formsLoading ? (
          <div className="skeleton h-32 rounded" />
        ) : moduleOptions.length === 0 ? (
          <p className="text-sm text-ink-muted">No form modules exist yet — create one under Dynamic Modules first.</p>
        ) : (
          <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
            {moduleOptions.map((module) => (
              <label key={module.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2 hover:bg-surface-muted">
                <input type="checkbox" className="mt-1" checked={selectedModules.has(Number(module.id))}
                  disabled={!permissions.update} onChange={() => toggleModule(Number(module.id))} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">{module.name}</span>
                  <span className="block text-xs text-ink-muted">
                    {[module.category, module.module_type].filter(Boolean).join(' · ')} · {Number(module.published_forms)} published form(s)
                    {module.status !== 'published' ? ` · ${module.status}` : ''}
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Archive this auditor type?"
        message={pendingDelete
          ? `${pendingDelete.name} (${pendingDelete.code}) will no longer be offered when registering auditors. Archiving is refused while auditors are still registered under it.`
          : ''}
        confirmLabel="Archive Type"
        variant="danger"
      />
    </>
  );
}
