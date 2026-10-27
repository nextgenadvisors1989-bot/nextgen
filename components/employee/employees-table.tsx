'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Pagination } from '@/components/ui/pagination';
import { Filters } from '@/components/ui/filters';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatCurrency, formatNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import { EMPLOYEE_CATEGORIES } from '@/lib/utils/constants';
import { INDIAN_STATES } from '@/types/employer';
import type { EmployeeListRow } from '@/repositories/employee.repository';

const STATUSES = ['active', 'inactive', 'resigned', 'terminated', 'retired', 'absconding'];

export function EmployeesTable({
  employers, units, departments, permissions,
  basePath = '/api/admin', linkBase = '/admin/employees', hideEmployerColumn = false,
}: {
  employers: { value: string; label: string; hint?: string }[];
  units: { value: string; label: string }[];
  departments: { value: string; label: string }[];
  permissions: { create: boolean; update: boolean; remove: boolean };
  /** `/api/admin` in the platform's register, `/api/employer` in an establishment's. */
  basePath?: string;
  /** Where a row links — an establishment's own register uses `/employer/employees`. */
  linkBase?: string;
  /** An establishment only ever sees its own staff, so the column would repeat one value. */
  hideEmployerColumn?: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const list = useList<EmployeeListRow>({
    endpoint: `${basePath}/employees`,
    initialFilters: {
      search: '', employerId: 'all', unitId: 'all', departmentId: 'all',
      status: 'all', category: 'all', state: 'all', dateFrom: '', dateTo: '',
    },
    initialSortBy: 'created_at',
  });
  const [pendingDelete, setPendingDelete] = useState<EmployeeListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const columns: Column<EmployeeListRow>[] = [
    {
      key: 'employee',
      header: 'Employee',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`${linkBase}/${row.id}`} className="font-medium text-brand-600 hover:underline">
            {truncate(row.name, 32)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {row.employee_number}
            {row.designation ? ` · ${row.designation}` : ''}
          </span>
        </div>
      ),
    },
    ...(hideEmployerColumn ? [] : [{
      key: 'employer',
      header: 'Employer',
      hideOnMobile: true,
      render: (row: EmployeeListRow) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{truncate(row.employer_name, 26)}</span>
          <span className="block text-xs text-ink-muted">
            {[row.unit_name, row.department_name ?? row.department].filter(Boolean).join(' · ') || row.employer_code}
          </span>
        </div>
      ),
    }]),
    {
      key: 'contact',
      header: 'Contact',
      hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{row.mobile ?? '—'}</span>
          <span className="block text-xs text-ink-muted">{truncate(row.email ?? '', 26) || '—'}</span>
        </div>
      ),
    },
    {
      key: 'joining',
      header: 'Joined',
      hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{formatDate(row.date_of_joining)}</span>,
    },
    {
      key: 'gross',
      header: 'Gross / Month',
      align: 'right',
      render: (row) => (
        <span className="font-medium text-ink">{formatCurrency(row.gross_salary ?? 0, { decimals: 0 })}</span>
      ),
    },
    {
      key: 'file',
      header: 'Personal File',
      align: 'center',
      hideOnMobile: true,
      render: (row) => (
        <span className="flex items-center justify-center gap-1.5">
          <Badge tone={row.checklist_done >= 16 ? 'success' : row.checklist_done > 0 ? 'warning' : 'slate'}>
            {row.checklist_done}/16
          </Badge>
          {Number(row.documents_count) > 0 && <Badge tone="default">{row.documents_count} docs</Badge>}
          {Boolean(row.has_login) && <Badge tone="brand">login</Badge>}
        </span>
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
          <Link href={`${linkBase}/${row.id}`} className="btn-icon" title="View employee" aria-label={`View ${row.name}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
            </svg>
          </Link>
          {permissions.update && (
            <Link href={`/admin/employees/${row.id}/edit`} className="btn-icon" title="Edit employee" aria-label={`Edit ${row.name}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </Link>
          )}
          {permissions.remove && (
            <button type="button" className="btn-icon btn-icon-danger" title="Archive employee"
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

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    const result = await api.delete(`${basePath}/employees/${pendingDelete.id}`);
    setDeleting(false);
    if (result.ok) {
      success('Employee archived', `${pendingDelete.name} was archived and their login deactivated.`);
      setPendingDelete(null);
      list.refresh();
      router.refresh();
    } else {
      errorToast('Could not archive employee', result.message);
    }
  }

  return (
    <>
      <Card padded={false}>
        <Filters
          definitions={[
            { key: 'search', type: 'search', placeholder: 'Search by name, employee no., mobile, Aadhaar, PF or ESI…' },
            { key: 'employerId', type: 'select', label: 'Employer',
              options: [{ value: 'all', label: 'All employers' }, ...employers.map((e) => ({ value: e.value, label: e.label }))] },
            { key: 'unitId', type: 'select', label: 'Unit',
              options: [{ value: 'all', label: 'All units' }, ...units] },
            { key: 'departmentId', type: 'select', label: 'Department',
              options: [{ value: 'all', label: 'All departments' }, ...departments] },
            { key: 'status', type: 'select', label: 'Status',
              options: [{ value: 'all', label: 'All statuses' }, ...STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))] },
            { key: 'category', type: 'select', label: 'Category',
              options: [{ value: 'all', label: 'Worker & Staff' }, ...EMPLOYEE_CATEGORIES.map((c) => ({ value: c, label: c }))] },
            { key: 'state', type: 'select', label: 'State',
              options: [{ value: 'all', label: 'All states' }, ...INDIAN_STATES.map((s) => ({ value: s, label: s }))] },
            { key: 'dateFrom', type: 'date', label: 'Joined from' },
            { key: 'dateTo', type: 'date', label: 'Joined to' },
          ]}
          values={list.filters}
          onChange={list.setFilter}
          onClear={list.clearFilters}
          extra={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={list.data.length === 0}
                onClick={() => downloadCsv(
                  `employees-${new Date().toISOString().slice(0, 10)}.csv`,
                  ['Employee No.', 'Name', 'Employer', 'Designation', 'Department', 'Mobile', 'Joined', 'Gross/Month', 'Status'],
                  list.data.map((row) => [
                    row.employee_number, row.name, row.employer_name, row.designation, row.department_name ?? row.department,
                    row.mobile, row.date_of_joining, Number(row.gross_salary ?? 0), row.status,
                  ])
                )}>
                Export CSV
              </Button>
              {permissions.create && <LinkButton href="/admin/employees/create" size="sm">Add Employee</LinkButton>}
            </div>
          }
        />

        <DataTable<EmployeeListRow>
          columns={columns}
          data={list.data}
          loading={list.loading}
          rowKey={(row) => row.id}
          emptyTitle="No employees found"
          emptySubtitle="Adjust the filters above, or register your first employee with the onboarding wizard."
          emptyAction={permissions.create ? <LinkButton href="/admin/employees/create" size="sm">Add Employee</LinkButton> : undefined}
        />

        <Pagination pagination={list.pagination} onPageChange={list.setPage} onLimitChange={list.setLimit} />
      </Card>

      {list.error && <p className="px-4 pb-3 text-sm text-red-600">{list.error}</p>}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Archive this employee?"
        message={pendingDelete
          ? `${pendingDelete.name} (${pendingDelete.employee_number}) will be archived. Attendance, leave, payroll and statutory history are retained, and any self-service login is deactivated.`
          : ''}
        confirmLabel="Archive Employee"
        variant="danger"
      />
    </>
  );
}
