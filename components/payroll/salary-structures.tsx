'use client';

/**
 * Salary structures — the wage contract behind every payslip.
 *
 * A structure carries the eight contractual heads, the statutory switches the
 * engine reads (PF on or off with its ceiling, ESI, professional tax state and
 * amount, labour welfare fund) and a revision number. Setting a new one closes
 * the old revision the day before the new one starts, so payroll history is never
 * rewritten — the version of the structure that was live in a month is the one
 * that produced that month's payslip.
 */
import { useState } from 'react';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { SearchInput } from '@/components/ui/search-input';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatCurrency, formatNumber } from '@/lib/utils/formatting';
import { formatDate } from '@/lib/utils/dates';
import { SALARY_REVISION_REASONS } from '@/lib/validations/payroll.validation';

interface StructureRow {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_number: string;
  designation: string | null;
  company_name: string;
  structure_name: string | null;
  effective_from: string;
  effective_to: string | null;
  basic: number;
  da: number;
  hra: number;
  ta: number;
  pa: number;
  ea: number;
  npba: number;
  other_allowances: number;
  gross_salary: number;
  computed_gross: number;
  wage_type: string;
  daily_wage: number | null;
  pf_applicable: boolean;
  esi_applicable: boolean;
  lwf_applicable: boolean;
  pt_state: string | null;
  pt_amount: number | null;
  revision_number: number;
  revision_reason: string | null;
  is_active: boolean;
}

interface EmployeeOption { value: string; label: string; hint?: string }

const EMPTY_FORM = {
  employee_id: '',
  structure_name: '',
  effective_from: new Date().toISOString().slice(0, 10),
  effective_to: '',
  basic: '',
  da: '',
  hra: '',
  ta: '',
  pa: '',
  ea: '',
  npba: '',
  other_allowances: '',
  wage_type: 'Per Month',
  daily_wage: '',
  pf_applicable: true,
  pf_wage_ceiling: '15000',
  vpf_percent: '',
  esi_applicable: true,
  esi_wage_ceiling: '21000',
  pt_state: 'Tamil Nadu',
  pt_amount: '',
  lwf_applicable: true,
  lwf_amount: '',
  revision_reason: 'Initial structure',
};

const STATES = ['Tamil Nadu', 'Karnataka', 'Maharashtra', 'Andhra Pradesh', 'Telangana', 'Kerala'];

export function SalaryStructures({
  panel, canCreate, canUpdate, canDelete,
}: {
  panel: 'admin' | 'employer';
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  // The structure family is the one payroll resource whose employer path is not
  // nested under /api/employer/payroll — the employer screen has its own root.
  const base = panel === 'admin' ? '/api/admin/payroll/structures' : '/api/employer/salary-structures';
  const { success, error: errorToast } = useToast();
  const [editing, setEditing] = useState<StructureRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [pendingDelete, setPendingDelete] = useState<StructureRow | null>(null);

  const list = useList<StructureRow>({
    endpoint: panel === 'admin' ? '/api/admin/payroll/structures' : '/api/employer/salary-structures',
    initialFilters: { search: '', live: 'yes', pf: 'all', esi: 'all' },
    initialLimit: 10,
    initialSortBy: 'created_at',
    initialSortDir: 'desc',
  });

  const stats = (list.extra.stats ?? {}) as Record<string, number>;

  const openCreate = async () => {
    setForm({ ...EMPTY_FORM });
    setCreating(true);
    const result = await api.get<{ data?: EmployeeOption[] }>(
      panel === 'admin' ? '/api/admin/employees?limit=100&status=active' : '/api/employer/employees?limit=100&status=active'
    );
    const rows = (result.data ?? []) as { id: number; name: string; employee_number: string; designation?: string | null }[];
    setEmployees(rows.map((row) => ({
      value: String(row.id),
      label: `${row.employee_number} — ${row.name}`,
      hint: row.designation ?? undefined,
    })));
  };

  const openEdit = async (row: StructureRow) => {
    setEditing(row);
    setForm({
      ...EMPTY_FORM,
      employee_id: String(row.employee_id),
      structure_name: row.structure_name ?? '',
      effective_from: String(row.effective_from).slice(0, 10),
      effective_to: row.effective_to ? String(row.effective_to).slice(0, 10) : '',
      basic: String(row.basic),
      da: String(row.da),
      hra: String(row.hra),
      ta: String(row.ta),
      pa: String(row.pa),
      ea: String(row.ea),
      npba: String(row.npba),
      other_allowances: String(row.other_allowances),
      wage_type: row.wage_type,
      pf_applicable: row.pf_applicable,
      esi_applicable: row.esi_applicable,
      lwf_applicable: row.lwf_applicable,
      pt_state: row.pt_state ?? 'Tamil Nadu',
      pt_amount: row.pt_amount ? String(row.pt_amount) : '',
      revision_reason: row.revision_reason ?? 'Revision',
    });
  };

  const save = async () => {
    const payload = {
      employee_id: Number(form.employee_id),
      structure_name: form.structure_name || undefined,
      effective_from: form.effective_from,
      effective_to: form.effective_to || undefined,
      basic: Number(form.basic || 0),
      da: Number(form.da || 0),
      hra: Number(form.hra || 0),
      ta: Number(form.ta || 0),
      pa: Number(form.pa || 0),
      ea: Number(form.ea || 0),
      npba: Number(form.npba || 0),
      other_allowances: Number(form.other_allowances || 0),
      wage_type: form.wage_type,
      daily_wage: form.daily_wage ? Number(form.daily_wage) : undefined,
      pf_applicable: form.pf_applicable,
      pf_wage_ceiling: form.pf_wage_ceiling ? Number(form.pf_wage_ceiling) : undefined,
      vpf_percent: form.vpf_percent ? Number(form.vpf_percent) : undefined,
      esi_applicable: form.esi_applicable,
      esi_wage_ceiling: form.esi_wage_ceiling ? Number(form.esi_wage_ceiling) : undefined,
      pt_state: form.pt_state,
      pt_amount: form.pt_amount ? Number(form.pt_amount) : undefined,
      lwf_applicable: form.lwf_applicable,
      lwf_amount: form.lwf_amount ? Number(form.lwf_amount) : undefined,
      revision_reason: form.revision_reason || undefined,
    };
    try {
      const result = editing
        ? await api.patch(`${base}/${editing.id}`, payload)
        : await api.post(`${base}`, payload);
      success(result.message ?? 'Salary structure saved');
      setCreating(false);
      setEditing(null);
      list.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    }
  };

  const gross = ['basic', 'da', 'hra', 'ta', 'pa', 'ea', 'npba', 'other_allowances']
    .reduce((total, key) => total + Number((form as unknown as Record<string, string>)[key] || 0), 0);

  const columns: Column<StructureRow>[] = [
    {
      key: 'employee_name',
      header: 'Employee',
      render: (row) => (
        <div className="min-w-[180px]">
          <div className="font-medium text-ink">{row.employee_name}</div>
          <div className="text-xs text-ink-muted">{row.employee_number}{row.designation ? ` · ${row.designation}` : ''}</div>
        </div>
      ),
    },
    ...(panel === 'admin' ? [{ key: 'company_name', header: 'Company', render: (row: StructureRow) => <span className="text-ink-muted">{row.company_name}</span> }] : []),
    { key: 'basic', header: 'Basic', align: 'right', render: (row) => formatCurrency(row.basic) },
    { key: 'da', header: 'DA', align: 'right', render: (row) => formatCurrency(row.da) },
    { key: 'hra', header: 'HRA', align: 'right', render: (row) => formatCurrency(row.hra) },
    { key: 'gross_salary', header: 'Gross', align: 'right', render: (row) => <span className="font-medium text-ink">{formatCurrency(row.gross_salary)}</span> },
    { key: 'wage_type', header: 'Wage type', align: 'center', render: (row) => <span className="text-ink-muted">{row.wage_type}{row.daily_wage ? ` · ₹${formatNumber(row.daily_wage)}/day` : ''}</span> },
    {
      key: 'statutory',
      header: 'Statutory',
      align: 'center',
      render: (row) => (
        <div className="flex flex-wrap items-center justify-center gap-1">
          <Badge tone={row.pf_applicable ? 'info' : 'default'}>PF {row.pf_applicable ? 'on' : 'off'}</Badge>
          <Badge tone={row.esi_applicable ? 'info' : 'default'}>ESI {row.esi_applicable ? 'on' : 'off'}</Badge>
          <Badge tone={row.lwf_applicable ? 'info' : 'default'}>LWF {row.lwf_applicable ? 'on' : 'off'}</Badge>
        </div>
      ),
    },
    {
      key: 'revision',
      header: 'Revision',
      align: 'center',
      render: (row) => (
        <div className="min-w-[130px]">
          <div className="text-ink">R{row.revision_number}</div>
          <div className="text-xs text-ink-muted">from {formatDate(row.effective_from)}</div>
        </div>
      ),
    },
    { key: 'is_active', header: 'Status', align: 'center', render: (row) => <Badge tone={row.is_active ? 'success' : 'default'}>{row.is_active ? 'In force' : 'Superseded'}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: 120,
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {canUpdate ? <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>Revise</Button> : null}
          {canDelete ? <Button size="sm" variant="ghost" onClick={() => setPendingDelete(row)}>Remove</Button> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Structures" value={formatNumber(stats.total ?? 0)} />
        <StatCard label="In force" value={formatNumber(stats.live ?? 0)} hint={`${formatNumber((stats.total ?? 0) - (stats.live ?? 0))} superseded revision(s)`} />
        <StatCard label="Covered by PF" value={formatNumber(stats.pf ?? 0)} hint={`${formatNumber(stats.esi ?? 0)} covered by ESI`} />
        <StatCard label="Average gross" value={formatCurrency(stats.averageGross ?? 0)} hint={`Total contractual wages ${formatCurrency(stats.totalGross ?? 0)}`} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Salary structures</h2>
          {canCreate ? <Button size="sm" onClick={openCreate}>Set a structure</Button> : null}
        </div>

        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search employee or structure' },
            { key: 'live', type: 'select', label: 'In force or superseded', options: [{ value: 'yes', label: 'In force' }, { value: 'no', label: 'Superseded' }] },
            { key: 'pf', type: 'select', label: 'PF', options: [{ value: 'yes', label: 'PF applies' }, { value: 'no', label: 'PF does not apply' }] },
            { key: 'esi', type: 'select', label: 'ESI', options: [{ value: 'yes', label: 'ESI applies' }, { value: 'no', label: 'ESI does not apply' }] },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
        />

        <DataTable
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No salary structure set"
          emptySubtitle="Set one before running payroll — the engine cannot compute a payslip without a structure in force for the month."
        />
        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {creating || editing ? (
        <Modal
          open
          onClose={() => { setCreating(false); setEditing(null); }}
          title={editing ? `Revise structure for ${editing.employee_name}` : 'Set a salary structure'}
          description={editing
            ? 'Editing a live structure changes what future payroll computes; past payslips keep the figures they were issued with.'
            : 'The previous structure is closed the day before the new one begins, and the revision number climbs.'}
          size="xl"
          footer={
            <div className="flex items-center justify-between gap-2">
              <div className="text-[13px] text-ink-muted">Gross from these heads: <span className="font-medium text-ink">{formatCurrency(gross)}</span></div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => { setCreating(false); setEditing(null); }}>Cancel</Button>
                <Button onClick={save}>{editing ? 'Save revision' : 'Set structure'}</Button>
              </div>
            </div>
          }
        >
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {!editing ? (
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-[13px] font-medium text-ink">Employee</label>
                  <SearchInput
                    value={employees.find((option) => option.value === form.employee_id)?.label ?? ''}
                    onChange={(value) => {
                      const match = employees.find((option) => option.label === value) ?? employees.find((option) => option.label.toLowerCase().includes(value.toLowerCase()));
                      setForm({ ...form, employee_id: match?.value ?? '' });
                    }}
                    placeholder="Search the employee by name or code"
                  />
                  {form.employee_id ? null : (
                    <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
                      {employees.slice(0, 6).map((option) => (
                        <li key={option.value}>
                          <button
                            type="button"
                            className="w-full rounded-md px-2 py-1 text-left text-[13px] text-ink-soft hover:bg-surface-muted"
                            onClick={() => setForm({ ...form, employee_id: option.value })}
                          >
                            {option.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : null}
              <Input label="Structure name" value={form.structure_name} onChange={(event) => setForm({ ...form, structure_name: event.target.value })} placeholder="e.g. 2026 revision after minimum wage order" />
              <Select
                label="Reason for revision"
                value={form.revision_reason}
                onChange={(value) => setForm({ ...form, revision_reason: value })}
                options={SALARY_REVISION_REASONS.map((value) => ({ value, label: value }))}
              />
              <Input label="Effective from" type="date" value={form.effective_from} onChange={(event) => setForm({ ...form, effective_from: event.target.value })} />
              <Input label="Effective to" type="date" value={form.effective_to} onChange={(event) => setForm({ ...form, effective_to: event.target.value })} helper="Leave blank for an open-ended structure" />
            </div>

            <div className="grid gap-4 sm:grid-cols-4">
              {([
                ['basic', 'Basic'],
                ['da', 'Dearness allowance'],
                ['hra', 'House rent allowance'],
                ['ta', 'Travel allowance'],
                ['pa', 'Personal allowance'],
                ['ea', 'Education allowance'],
                ['npba', 'Non-practising allowance'],
                ['other_allowances', 'Other allowances'],
              ] as const).map(([key, label]) => (
                <Input
                  key={key}
                  label={label}
                  type="number"
                  value={(form as unknown as Record<string, string>)[key]}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                />
              ))}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Wage type"
                value={form.wage_type}
                onChange={(value) => setForm({ ...form, wage_type: value })}
                options={[{ value: 'Per Month', label: 'Per month (prorated by paid days)' }, { value: 'Per Day', label: 'Per day (paid days × daily wage)' }]}
              />
              <Input label="Daily wage" type="number" value={form.daily_wage} onChange={(event) => setForm({ ...form, daily_wage: event.target.value })} helper="Used when the wage type is per day" />
              <Input label="VPF percentage" type="number" value={form.vpf_percent} onChange={(event) => setForm({ ...form, vpf_percent: event.target.value })} helper="Voluntary PF over and above the statutory 12%" />
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Provident fund"
                value={form.pf_applicable ? 'yes' : 'no'}
                onChange={(value) => setForm({ ...form, pf_applicable: value === 'yes' })}
                options={[{ value: 'yes', label: 'PF applies (12% employee / 12% employer)' }, { value: 'no', label: 'PF does not apply' }]}
              />
              <Input label="PF wage ceiling" type="number" value={form.pf_wage_ceiling} onChange={(event) => setForm({ ...form, pf_wage_ceiling: event.target.value })} helper="Statutory ceiling is ₹15,000" />
              <Select
                label="ESI"
                value={form.esi_applicable ? 'yes' : 'no'}
                onChange={(value) => setForm({ ...form, esi_applicable: value === 'yes' })}
                options={[{ value: 'yes', label: 'ESI applies (0.75% / 3.25% on wages up to the ceiling)' }, { value: 'no', label: 'ESI does not apply' }]}
              />
              <Input label="ESI wage ceiling" type="number" value={form.esi_wage_ceiling} onChange={(event) => setForm({ ...form, esi_wage_ceiling: event.target.value })} helper="Statutory ceiling is ₹21,000" />
              <Select
                label="Professional tax state"
                value={form.pt_state}
                onChange={(value) => setForm({ ...form, pt_state: value })}
                options={STATES.map((value) => ({ value, label: value }))}
              />
              <Input label="Professional tax amount" type="number" value={form.pt_amount} onChange={(event) => setForm({ ...form, pt_amount: event.target.value })} helper="Leave blank to use the state slab" />
              <Select
                label="Labour welfare fund"
                value={form.lwf_applicable ? 'yes' : 'no'}
                onChange={(value) => setForm({ ...form, lwf_applicable: value === 'yes' })}
                options={[{ value: 'yes', label: 'LWF applies in the collection months' }, { value: 'no', label: 'LWF does not apply' }]}
              />
              <Input label="LWF amount" type="number" value={form.lwf_amount} onChange={(event) => setForm({ ...form, lwf_amount: event.target.value })} helper="Leave blank for the state default" />
            </div>

            <Textarea
              label="Notes"
              rows={2}
              value={form.structure_name}
              onChange={(event) => setForm({ ...form, structure_name: event.target.value })}
            />
          </div>
        </Modal>
      ) : null}

      {pendingDelete ? (
        <ConfirmDialog
          open
          title={`Remove the structure for ${pendingDelete.employee_name}?`}
          message="A structure that has never produced a payslip can be removed. Once a payslip exists the history stands and a fresh revision is the correct route."
          confirmLabel="Remove structure"
          onClose={() => setPendingDelete(null)}
          onConfirm={async () => {
            const row = pendingDelete;
            setPendingDelete(null);
            try {
              await api.delete(`${base}/${row.id}`);
              success('Salary structure removed');
              list.refresh();
            } catch (failure) {
              errorToast((failure as Error).message);
            }
          }}
        />
      ) : null}
    </div>
  );
}
