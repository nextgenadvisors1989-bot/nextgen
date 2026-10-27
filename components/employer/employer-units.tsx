'use client';

/** An establishment's units: add, correct and remove its own premises. */
import { useState } from 'react';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Filters } from '@/components/ui/filters';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { INDIAN_STATES } from '@/types/employer';

interface UnitRow {
  id: number;
  unit_name: string;
  unit_code: string | null;
  location: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  contact_person_name: string | null;
  contact_person_mobile: string | null;
  employee_count?: number | null;
  status: string;
}

const EMPTY = {
  unit_name: '', unit_code: '', location: '', city: '', state: 'Tamil Nadu', pincode: '',
  contact_person_name: '', contact_person_mobile: '', status: 'active',
};

export function EmployerUnits({ canCreate, canUpdate, canRemove }: {
  canCreate: boolean; canUpdate: boolean; canRemove: boolean;
}) {
  const toast = useToast();
  const list = useList<UnitRow>({ endpoint: '/api/employer/units', initialFilters: { search: '', status: 'all' } });
  const [form, setForm] = useState<Record<string, string>>(EMPTY);
  const [editing, setEditing] = useState<UnitRow | null>(null);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UnitRow | null>(null);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setErrors({});
    setOpen(true);
  }

  function openEdit(row: UnitRow) {
    setEditing(row);
    setForm({
      unit_name: row.unit_name ?? '', unit_code: row.unit_code ?? '', location: row.location ?? '',
      city: row.city ?? '', state: row.state ?? '', pincode: row.pincode ?? '',
      contact_person_name: row.contact_person_name ?? '', contact_person_mobile: row.contact_person_mobile ?? '',
      status: row.status ?? 'active',
    });
    setErrors({});
    setOpen(true);
  }

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const response = editing
        ? await api.patch<{ updated: boolean }>(`/api/employer/units/${editing.id}`, form)
        : await api.post<{ unitId: number }>('/api/employer/units', form);
      if (!response.ok) {
        setErrors(fieldErrors(response.raw as never));
        toast.error(response.message);
        return;
      }
      toast.success(editing ? 'Unit updated' : 'Unit added');
      setOpen(false);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That could not be saved');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const response = await api.delete<{ removed: boolean }>(`/api/employer/units/${pendingDelete.id}`);
      if (!response.ok) {
        toast.error(response.message);
        return;
      }
      toast.success('Unit removed');
      setPendingDelete(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That could not be removed');
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<UnitRow>[] = [
    {
      key: 'unit',
      header: 'Unit',
      render: (row) => (
        <div className="min-w-0">
          <span className="block font-medium text-ink">{row.unit_name}</span>
          <span className="block text-xs text-ink-muted">{row.unit_code ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'where',
      header: 'Where',
      hideOnMobile: true,
      render: (row) => [row.location, row.city, row.state, row.pincode].filter(Boolean).join(', ') || '—',
    },
    {
      key: 'contact',
      header: 'Contact',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{row.contact_person_name ?? '—'}</span>
          <span className="block text-xs text-ink-muted">{row.contact_person_mobile ?? ''}</span>
        </div>
      ),
    },
    {
      key: 'staff',
      header: 'Staff',
      align: 'right',
      hideOnMobile: true,
      render: (row) => (row.employee_count === null || row.employee_count === undefined ? '—' : String(row.employee_count)),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          {canUpdate ? <Button variant="outline" size="sm" onClick={() => openEdit(row)}>Edit</Button> : null}
          {canRemove ? <Button variant="outline" size="sm" onClick={() => setPendingDelete(row)}>Remove</Button> : null}
        </div>
      ),
    },
  ];

  const rows = list.data;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Units" value={rows.length} tone="brand" />
        <StatCard label="Active" value={rows.filter((row) => row.status === 'active').length} tone="emerald" />
        <StatCard label="Inactive" value={rows.filter((row) => row.status !== 'active').length} tone="slate" />
      </div>

      <Card padded={false}>
        <div className="px-4 pt-4">
          <CardHeader
            title="Units"
            description="Every place your establishment operates from. Staff are posted to a unit, so a unit that still holds employees cannot be removed."
            action={canCreate ? <Button size="sm" onClick={openCreate}>Add unit</Button> : undefined}
          />
        </div>

        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search units…' },
            {
              key: 'status', type: 'select', label: 'Status',
              options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }],
            },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
        />

        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          loading={list.loading}
          emptyTitle="No units yet"
          emptySubtitle="Add the first unit so staff can be posted to it."
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.unit_name}` : 'Add a unit'}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add unit'}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Unit name" required value={form.unit_name} error={errors.unit_name}
                 onChange={(event) => setForm((current) => ({ ...current, unit_name: event.target.value }))} />
          <Input label="Unit code" value={form.unit_code} error={errors.unit_code}
                 onChange={(event) => setForm((current) => ({ ...current, unit_code: event.target.value }))} />
          <Input label="Location" value={form.location}
                 onChange={(event) => setForm((current) => ({ ...current, location: event.target.value }))} />
          <Input label="City" value={form.city}
                 onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} />
          <Input label="State" value={form.state} list="unit-states" error={errors.state}
                 onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))} />
          <datalist id="unit-states">{INDIAN_STATES.map((state) => <option key={state} value={state} />)}</datalist>
          <Input label="PIN code" value={form.pincode} error={errors.pincode}
                 onChange={(event) => setForm((current) => ({ ...current, pincode: event.target.value }))} />
          <Input label="Contact person" value={form.contact_person_name}
                 onChange={(event) => setForm((current) => ({ ...current, contact_person_name: event.target.value }))} />
          <Input label="Contact mobile" value={form.contact_person_mobile}
                 onChange={(event) => setForm((current) => ({ ...current, contact_person_mobile: event.target.value }))} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={remove}
        loading={busy}
        title="Remove this unit?"
        message={`${pendingDelete?.unit_name ?? 'The unit'} will be taken off your register. A unit that still holds staff is refused.`}
        confirmLabel="Remove"
      />
    </div>
  );
}
