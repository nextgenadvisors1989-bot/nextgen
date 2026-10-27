'use client';

/**
 * An establishment's departments. A department hangs off one of its own units —
 * attaching it to another company's unit is refused by the API, and the picker
 * here only ever offers the establishment's own units.
 */
import { useEffect, useState } from 'react';
import { Card, CardHeader, StatCard } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Filters } from '@/components/ui/filters';
import { StatusBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api, fieldErrors } from '@/lib/utils/api-client';

interface DepartmentRow {
  id: number;
  department_name: string;
  department_code: string | null;
  unit_id: number | null;
  unit_name: string | null;
  head_of_department: string | null;
  employee_count?: number | null;
  status: string;
}

export function EmployerDepartments({ canCreate, canUpdate, canRemove }: {
  canCreate: boolean; canUpdate: boolean; canRemove: boolean;
}) {
  const toast = useToast();
  const list = useList<DepartmentRow>({ endpoint: '/api/employer/departments', initialFilters: { search: '', status: 'all' } });
  const [units, setUnits] = useState<{ value: string; label: string }[]>([]);
  const [form, setForm] = useState<Record<string, string>>({
    department_name: '', department_code: '', unit_id: '', head_of_department: '', status: 'active',
  });
  const [editing, setEditing] = useState<DepartmentRow | null>(null);
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DepartmentRow | null>(null);

  useEffect(() => {
    (async () => {
      const response = await api.get<{ id: number; unit_name: string }[]>('/api/employer/units');
      setUnits((response.data ?? []).map((unit) => ({ value: String(unit.id), label: unit.unit_name })));
    })();
  }, []);

  async function save() {
    setBusy(true);
    setErrors({});
    try {
      const payload = { ...form, unit_id: form.unit_id || null };
      const response = editing
        ? await api.patch<{ updated: boolean }>(`/api/employer/departments/${editing.id}`, payload)
        : await api.post<{ departmentId: number }>('/api/employer/departments', payload);
      if (!response.ok) {
        setErrors(fieldErrors(response.raw as never));
        toast.error(response.message);
        return;
      }
      toast.success(editing ? 'Department updated' : 'Department added');
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
      const response = await api.delete<{ removed: boolean }>(`/api/employer/departments/${pendingDelete.id}`);
      if (!response.ok) { toast.error(response.message); return; }
      toast.success('Department removed');
      setPendingDelete(null);
      list.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'That could not be removed');
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<DepartmentRow>[] = [
    {
      key: 'department',
      header: 'Department',
      render: (row) => (
        <div className="min-w-0">
          <span className="block font-medium text-ink">{row.department_name}</span>
          <span className="block text-xs text-ink-muted">{row.department_code ?? '—'}</span>
        </div>
      ),
    },
    { key: 'unit', header: 'Unit', hideOnMobile: true, render: (row) => row.unit_name ?? '—' },
    { key: 'head', header: 'Head', hideOnMobile: true, render: (row) => row.head_of_department ?? '—' },
    {
      key: 'staff', header: 'Staff', align: 'right', hideOnMobile: true,
      render: (row) => (row.employee_count === null || row.employee_count === undefined ? '—' : String(row.employee_count)),
    },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-2">
          {canUpdate ? (
            <Button
              variant="outline" size="sm"
              onClick={() => {
                setEditing(row);
                setForm({
                  department_name: row.department_name ?? '', department_code: row.department_code ?? '',
                  unit_id: row.unit_id ? String(row.unit_id) : '', head_of_department: row.head_of_department ?? '',
                  status: row.status ?? 'active',
                });
                setErrors({});
                setOpen(true);
              }}
            >
              Edit
            </Button>
          ) : null}
          {canRemove ? <Button variant="outline" size="sm" onClick={() => setPendingDelete(row)}>Remove</Button> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Departments" value={list.data.length} tone="brand" />
        <StatCard label="Units covered" value={new Set(list.data.map((row) => row.unit_id).filter(Boolean)).size} tone="slate" />
        <StatCard label="Active" value={list.data.filter((row) => row.status === 'active').length} tone="emerald" />
      </div>

      <Card padded={false}>
        <div className="px-4 pt-4">
          <CardHeader
            title="Departments"
            description="Departments belong to one of your units. A department that still holds employees cannot be removed."
            action={canCreate ? (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setForm({ department_name: '', department_code: '', unit_id: '', head_of_department: '', status: 'active' });
                  setErrors({});
                  setOpen(true);
                }}
              >
                Add department
              </Button>
            ) : undefined}
          />
        </div>

        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search departments…' },
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
          data={list.data}
          rowKey={(row) => row.id}
          loading={list.loading}
          emptyTitle="No departments yet"
          emptySubtitle="Add your first department and attach it to a unit."
        />
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.department_name}` : 'Add a department'}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add department'}</Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Department name" required value={form.department_name} error={errors.department_name}
                 onChange={(event) => setForm((current) => ({ ...current, department_name: event.target.value }))} />
          <Input label="Department code" value={form.department_code} error={errors.department_code}
                 onChange={(event) => setForm((current) => ({ ...current, department_code: event.target.value }))} />
          <Select
            label="Unit"
            placeholder={units.length ? 'Choose a unit' : 'Add a unit first'}
            options={units}
            value={form.unit_id}
            error={errors.unit_id}
            searchable
            onChange={(value) => setForm((current) => ({ ...current, unit_id: value }))}
          />
          <Input label="Head of department" value={form.head_of_department}
                 onChange={(event) => setForm((current) => ({ ...current, head_of_department: event.target.value }))} />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={remove}
        loading={busy}
        title="Remove this department?"
        message={`${pendingDelete?.department_name ?? 'The department'} will be taken off your register. A department that still holds staff is refused.`}
        confirmLabel="Remove"
      />
    </div>
  );
}
