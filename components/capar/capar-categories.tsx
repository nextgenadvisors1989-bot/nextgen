'use client';

/**
 * Admin screen for the headings CAPAR findings are grouped under (Business Practices, Fire Safety ...). Add, rename, reorder
 * or switch them off here; a heading that findings already use is switched off rather than deleted, so approved reports keep
 * their wording.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import type { CaparCategory } from '@/types/capar';

const EMPTY = { name: '', description: '', status: 'active' };

export function CaparCategories() {
  const { success, error: errorToast } = useToast();
  const [rows, setRows] = useState<CaparCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CaparCategory | 'new' | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<CaparCategory | null>(null);

  const load = useCallback(async () => {
    const result = await api.get<CaparCategory[]>('/api/capar/categories?all=1');
    if (result.ok && Array.isArray(result.data)) setRows(result.data);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  function open(target: CaparCategory | 'new') {
    setEditing(target);
    setErrors({});
    setForm(target === 'new' ? { ...EMPTY } : { name: target.name, description: target.description ?? '', status: target.status });
  }

  async function save() {
    setSaving(true);
    setErrors({});
    const result = editing === 'new'
      ? await api.post('/api/capar/categories', form)
      : await api.patch(`/api/capar/categories/${(editing as CaparCategory).id}`, form);
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrors(result));
      errorToast('Could not save the category', result.message);
      return;
    }
    success(editing === 'new' ? 'Category added' : 'Category saved');
    setEditing(null);
    await load();
  }

  async function move(index: number, direction: -1 | 1) {
    const a = rows[index];
    const b = rows[index + direction];
    if (!a || !b) return;
    // Swapping the two sort values; if they are equal, nudge so the order actually changes.
    const first = a.sort_order === b.sort_order ? b.sort_order + direction : b.sort_order;
    const results = await Promise.all([
      api.patch(`/api/capar/categories/${a.id}`, { sort_order: first }),
      api.patch(`/api/capar/categories/${b.id}`, { sort_order: a.sort_order }),
    ]);
    if (results.some((result) => !result.ok)) errorToast('Could not reorder', results.find((result) => !result.ok)?.message);
    await load();
  }

  async function remove() {
    if (!removing) return;
    setSaving(true);
    const result = await api.delete(`/api/capar/categories/${removing.id}`);
    setSaving(false);
    setRemoving(null);
    if (result.ok) { success(result.message); await load(); } else errorToast('Could not remove it', result.message);
  }

  const columns: Column<CaparCategory>[] = [
    {
      key: 'name',
      header: 'Heading',
      className: 'min-w-[220px]',
      render: (row) => (
        <div>
          <span className="font-medium text-ink">{row.name}</span>
          {row.description && <span className="block text-xs text-ink-muted">{row.description}</span>}
        </div>
      ),
    },
    { key: 'findings', header: 'Findings using it', align: 'center', render: (row) => <span className="text-ink-soft">{row.finding_count ?? 0}</span> },
    { key: 'status', header: 'Status', render: (row) => <Badge tone={row.status === 'active' ? 'success' : 'slate'}>{row.status === 'active' ? 'In use' : 'Switched off'}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (row) => {
        const index = rows.findIndex((item) => item.id === row.id);
        return (
          <span className="flex items-center justify-end gap-1">
            <button type="button" className="btn-icon" aria-label={`Move ${row.name} up`} disabled={index === 0} onClick={() => move(index, -1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 15 6-6 6 6" /></svg>
            </button>
            <button type="button" className="btn-icon" aria-label={`Move ${row.name} down`} disabled={index === rows.length - 1} onClick={() => move(index, 1)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
            </button>
            <Button size="sm" variant="outline" onClick={() => open(row)}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={() => setRemoving(row)}>Remove</Button>
          </span>
        );
      },
    },
  ];

  return (
    <>
      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <p className="text-sm text-ink-muted">{rows.length} heading{rows.length === 1 ? '' : 's'}. Findings appear in this order in every report and PDF.</p>
          <Button size="sm" onClick={() => open('new')}>+ Add category</Button>
        </div>
        <DataTable<CaparCategory>
          columns={columns}
          data={rows}
          loading={loading}
          rowKey={(row) => row.id}
          serialNumber={false}
          emptyTitle="No categories"
          emptySubtitle="Add the headings the auditors group their findings under."
        />
      </Card>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add category' : 'Edit category'}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={form.name.trim().length < 2}>Save</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Heading" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} error={errors.name} placeholder="e.g. Fire Safety" />
          <Textarea label="Description (optional)" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} error={errors.description} />
          <Select
            label="Status"
            options={[{ value: 'active', label: 'In use' }, { value: 'inactive', label: 'Switched off' }]}
            value={form.status}
            onChange={(value) => setForm({ ...form, status: value })}
            helper="A switched-off heading cannot be chosen for new findings, but old reports keep it."
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove "${removing?.name ?? ''}"?`}
        message={removing && (removing.finding_count ?? 0) > 0
          ? `${removing.finding_count} finding(s) already use this heading, so it is switched off instead of deleted.`
          : 'No finding uses this heading, so it is deleted.'}
        confirmLabel="Remove"
        loading={saving}
        onConfirm={remove}
      />
    </>
  );
}
