'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/ui/table';
import { StatusBadge, Badge, PriorityBadge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatDate } from '@/lib/utils/dates';
import { formatNumber, formatCurrency, truncate } from '@/lib/utils/formatting';
import { downloadCsv } from '@/lib/utils/export';
import type { EmployerDetail } from '@/services/employer.service';

interface UnitRow {
  id: number; employer_id: number; unit_name: string; unit_code: string | null; location: string | null;
  address: string | null; contact_person_name: string | null; contact_person_email: string | null;
  contact_person_phone: string | null; employee_count: number | null; status: string;
}
interface DepartmentRow {
  id: number; department_name: string; department_code: string | null; unit_id: number | null;
  unit_name?: string | null; head_of_department: string | null; contact_email: string | null;
  contact_phone: string | null; employee_count: number | null; status: string;
}

export interface EmployerPermissions {
  updateEmployer: boolean;
  createUnit: boolean; updateUnit: boolean; deleteUnit: boolean;
  createDepartment: boolean; updateDepartment: boolean; deleteDepartment: boolean;
}

export function EmployerDetailView({
  detail, permissions,
}: { detail: EmployerDetail; permissions: EmployerPermissions }) {
  const canUpdateEmployer = permissions.updateEmployer;
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const { employer, stats } = detail;

  const [unitModal, setUnitModal] = useState<{ open: boolean; row?: UnitRow }>({ open: false });
  const [departmentModal, setDepartmentModal] = useState<{ open: boolean; row?: DepartmentRow }>({ open: false });
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'unit' | 'department'; id: number; label: string } | null>(null);
  const [working, setWorking] = useState(false);

  const unitColumns: Column<UnitRow>[] = [
    { key: 'unit_name', header: 'Unit', render: (row) => (
      <div><span className="font-medium text-ink">{row.unit_name}</span>
        {row.unit_code && <span className="block text-xs text-ink-muted">{row.unit_code}</span>}</div>
    ) },
    { key: 'location', header: 'Location', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{row.location ?? row.address ?? '—'}</span> },
    { key: 'contact', header: 'Contact', hideOnMobile: true, render: (row) => (
      <div><span className="block text-ink-soft">{row.contact_person_name ?? '—'}</span>
        <span className="block text-xs text-ink-muted">{row.contact_person_phone ?? row.contact_person_email ?? ''}</span></div>
    ) },
    { key: 'employee_count', header: 'Employees', align: 'center', render: (row) => <span className="text-ink-soft">{formatNumber(row.employee_count ?? 0)}</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'actions', header: 'Actions', width: 120, align: 'right', render: (row) => (
      <span className="flex items-center justify-end gap-1">
        {permissions.updateUnit && (
          <button type="button" className="btn-icon" title="Edit unit" aria-label={`Edit ${row.unit_name}`}
            onClick={() => setUnitModal({ open: true, row })}>
            <Icon path="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </button>
        )}
        {permissions.deleteUnit && (
          <button type="button" className="btn-icon btn-icon-danger" title="Remove unit" aria-label={`Remove ${row.unit_name}`}
            onClick={() => setDeleteTarget({ kind: 'unit', id: row.id, label: row.unit_name })}>
            <Icon path="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </button>
        )}
      </span>
    ) },
  ];

  const departmentColumns: Column<DepartmentRow>[] = [
    { key: 'department_name', header: 'Department', render: (row) => (
      <div><span className="font-medium text-ink">{row.department_name}</span>
        {row.department_code && <span className="block text-xs text-ink-muted">{row.department_code}</span>}</div>
    ) },
    { key: 'unit', header: 'Unit', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{row.unit_name ?? 'All units'}</span> },
    { key: 'head', header: 'Head of Department', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{row.head_of_department ?? '—'}</span> },
    { key: 'employee_count', header: 'Employees', align: 'center', render: (row) => <span className="text-ink-soft">{formatNumber(row.employee_count ?? 0)}</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    { key: 'actions', header: 'Actions', width: 120, align: 'right', render: (row) => (
      <span className="flex items-center justify-end gap-1">
        {permissions.updateDepartment && (
          <button type="button" className="btn-icon" title="Edit department" aria-label={`Edit ${row.department_name}`}
            onClick={() => setDepartmentModal({ open: true, row })}>
            <Icon path="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </button>
        )}
        {permissions.deleteDepartment && (
          <button type="button" className="btn-icon btn-icon-danger" title="Remove department" aria-label={`Remove ${row.department_name}`}
            onClick={() => setDeleteTarget({ kind: 'department', id: row.id, label: row.department_name })}>
            <Icon path="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          </button>
        )}
      </span>
    ) },
  ];

  async function runDelete() {
    if (!deleteTarget) return;
    setWorking(true);
    const url = deleteTarget.kind === 'unit' ? `/api/admin/units/${deleteTarget.id}` : `/api/admin/departments/${deleteTarget.id}`;
    const result = await api.delete(url);
    setWorking(false);
    if (result.ok) {
      success(`${deleteTarget.kind === 'unit' ? 'Unit' : 'Department'} removed`, `${deleteTarget.label} was removed.`);
      setDeleteTarget(null);
      router.refresh();
    } else {
      errorToast('Could not remove', result.message);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="page-title">{employer.company_name}</h1>
            <StatusBadge status={employer.status} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {employer.employer_code}
            {employer.industry_type ? ` · ${employer.industry_type}` : ''}
            {employer.city ? ` · ${employer.city}` : ''}
            {employer.state ? `, ${employer.state}` : ''}
            {` · added ${formatDate(employer.created_at)}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm"
            onClick={() => downloadCsv(
              `employer-${employer.employer_code}-summary.csv`,
              ['Section', 'Field', 'Value'],
              buildSummaryRows(detail)
            )}>
            Export Summary
          </Button>
          <LinkButton href={`/admin/employers/${employer.id}/factory-profile`} size="sm" variant="outline">Factory Profile</LinkButton>
          <LinkButton href={`/admin/employers/${employer.id}/audit-documents`} size="sm" variant="outline">Audit Documents</LinkButton>
          {canUpdateEmployer && <LinkButton href={`/admin/employers/${employer.id}/edit`} size="sm" variant="outline">Edit</LinkButton>}
          <LinkButton href="/admin/employers" size="sm" variant="ghost">Back to list</LinkButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Employees" value={formatNumber(stats.totalEmployees)} hint={`${formatNumber(stats.activeEmployees)} active`} tone="brand" />
        <StatCard label="Units" value={formatNumber(stats.totalUnits)} hint={`${formatNumber(stats.totalDepartments)} department(s)`} tone="violet" />
        <StatCard label="Audits" value={formatNumber(stats.totalAudits)} hint={`${formatNumber(stats.pendingAudits)} in progress`} tone={stats.pendingAudits ? 'amber' : 'slate'} />
        <StatCard
          label="Compliance Documents" value={formatNumber(stats.complianceDocuments)}
          hint={stats.expiredDocuments > 0 ? `${stats.expiredDocuments} expired` : `${stats.expiringSoonDocuments} expiring within 90 days`}
          tone={stats.expiredDocuments > 0 ? 'red' : 'emerald'}
        />
      </div>

      <Tabs
        items={[
          {
            key: 'overview',
            label: 'Overview',
            content: (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card padded={false}>
                  <CardHeader title="Company information" />
                  <CardBody className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Detail label="Legal Name" value={employer.company_name} />
                    <Detail label="Employer Code" value={employer.employer_code} />
                    <Detail label="Industry" value={employer.industry_type ?? '—'} />
                    <Detail label="Company Type" value={employer.company_type ?? '—'} />
                    <Detail label="Year of Establishment" value={employer.year_of_establishment ?? '—'} />
                    <Detail label="Website" value={employer.website_url
                      ? <a href={employer.website_url} target="_blank" rel="noreferrer" className="link">{employer.website_url}</a> : '—'} />
                    <Detail label="GST Number" value={employer.gst_number ?? '—'} />
                    <Detail label="PAN Number" value={employer.pan_number ?? '—'} />
                    <Detail label="CIN Number" value={employer.cin_number ?? '—'} />
                    <Detail label="Approx. Employees" value={employer.approximate_employee_count ? formatNumber(employer.approximate_employee_count) : '—'} />
                  </CardBody>
                </Card>

                <Card padded={false}>
                  <CardHeader title="Address & contacts" />
                  <CardBody className="space-y-4">
                    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                      <Detail label="Address" value={[employer.address_line_1, employer.address_line_2].filter(Boolean).join(', ') || '—'} />
                      <Detail label="City / State" value={[employer.city, employer.state].filter(Boolean).join(', ') || '—'} />
                      <Detail label="Pincode" value={employer.pincode ?? '—'} />
                      <Detail label="Country" value={employer.country ?? '—'} />
                      <Detail label="Company Email" value={employer.email ?? '—'} />
                      <Detail label="Company Phone" value={employer.phone ?? employer.mobile ?? '—'} />
                    </div>
                    <div className="border-t border-line pt-4">
                      <p className="mb-3 text-[13px] font-semibold text-ink">Primary contact</p>
                      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                        <Detail label="Name" value={employer.contact_person_name ?? '—'} />
                        <Detail label="Designation" value={employer.contact_person_designation ?? '—'} />
                        <Detail label="Email" value={employer.contact_person_email ?? '—'} />
                        <Detail label="Mobile" value={employer.contact_person_mobile ?? '—'} />
                      </div>
                    </div>
                    <div className="border-t border-line pt-4">
                      <p className="mb-3 text-[13px] font-semibold text-ink">Compliance & payroll</p>
                      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                        <Detail label="Compliance Contact" value={employer.compliance_contact_person ?? '—'} />
                        <Detail label="Compliance Email" value={employer.compliance_contact_email ?? '—'} />
                        <Detail label="Payroll Contact" value={employer.payroll_contact_person ?? '—'} />
                        <Detail label="Payroll Email" value={employer.payroll_contact_email ?? '—'} />
                      </div>
                    </div>
                    {employer.notes && (
                      <div className="border-t border-line pt-4">
                        <Detail label="Internal notes" value={<span className="whitespace-pre-line">{employer.notes}</span>} />
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>
            ),
          },
          {
            key: 'units',
            label: 'Units',
            badge: detail.units.length,
            content: (
              <Card padded={false}>
                <CardHeader
                  title="Company units"
                  description="Plants, branches and offices belonging to this employer"
                  action={permissions.createUnit ? (
                    <Button size="sm" onClick={() => setUnitModal({ open: true })}>Add Unit</Button>
                  ) : undefined}
                />
                <DataTable<UnitRow>
                  columns={unitColumns}
                  data={detail.units as unknown as UnitRow[]}
                  rowKey={(row) => row.id}
                  emptyTitle="No units yet"
                  emptySubtitle="Add the first plant, branch or office for this employer."
                  emptyAction={permissions.createUnit ? <Button size="sm" onClick={() => setUnitModal({ open: true })}>Add Unit</Button> : undefined}
                />
              </Card>
            ),
          },
          {
            key: 'departments',
            label: 'Departments',
            badge: detail.departments.length,
            content: (
              <Card padded={false}>
                <CardHeader
                  title="Departments"
                  description="Departments are used for headcount reporting and payroll grouping"
                  action={permissions.createDepartment ? (
                    <Button size="sm" onClick={() => setDepartmentModal({ open: true })}>Add Department</Button>
                  ) : undefined}
                />
                <DataTable<DepartmentRow>
                  columns={departmentColumns}
                  data={detail.departments as unknown as DepartmentRow[]}
                  rowKey={(row) => row.id}
                  emptyTitle="No departments yet"
                  emptySubtitle="Create departments to organise employees and reporting."
                  emptyAction={permissions.createDepartment ? <Button size="sm" onClick={() => setDepartmentModal({ open: true })}>Add Department</Button> : undefined}
                />
              </Card>
            ),
          },
          {
            key: 'employees',
            label: 'Employees',
            badge: detail.employees.length,
            content: (
              <Card padded={false}>
                <CardHeader
                  title="Employees"
                  description={`${formatNumber(stats.totalEmployees)} record(s) — ${formatNumber(stats.activeEmployees)} active`}
                  action={<LinkButton href={`/admin/employees?employerId=${employer.id}`} size="sm" variant="outline">Manage Employees</LinkButton>}
                />
                <DataTable
                  columns={[
                    { key: 'employee_number', header: 'Employee No.', render: (row: EmployerDetail['employees'][number]) => (
                      <Link href={`/admin/employees/${row.id}`} className="font-medium text-brand-600 hover:underline">{row.employee_number}</Link>
                    ) },
                    { key: 'name', header: 'Name', render: (row) => <span className="text-ink">{row.name}</span> },
                    { key: 'designation', header: 'Designation', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{row.designation ?? '—'}</span> },
                    { key: 'department', header: 'Department', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{row.department ?? '—'}</span> },
                    { key: 'doj', header: 'Joined', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{formatDate(row.date_of_joining)}</span> },
                    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                  ]}
                  data={detail.employees}
                  rowKey={(row) => row.id}
                  emptyTitle="No employees yet"
                  emptySubtitle="Employees added for this employer will be listed here."
                />
              </Card>
            ),
          },
          {
            key: 'audits',
            label: 'Audits',
            badge: detail.audits.length,
            content: (
              <Card padded={false}>
                <CardHeader
                  title="Audit history"
                  description="Every audit assignment raised for this employer"
                  action={<LinkButton href={`/admin/audit-assignments/create?employerId=${employer.id}`} size="sm">Create Assignment</LinkButton>}
                />
                <DataTable
                  columns={[
                    { key: 'assignment_number', header: 'Assignment', render: (row: EmployerDetail['audits'][number]) => (
                      <div><Link href={`/admin/audit-assignments/${row.id}`} className="font-medium text-brand-600 hover:underline">{row.assignment_number}</Link>
                        <span className="block text-xs text-ink-muted">{truncate(row.audit_title, 44)}</span></div>
                    ) },
                    { key: 'auditor', header: 'Auditor', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{row.auditor_name ?? 'Unassigned'}</span> },
                    { key: 'schedule', header: 'Schedule', hideOnMobile: true, render: (row) => (
                      <span className="text-ink-soft">{formatDate(row.start_date)} → {formatDate(row.due_date)}</span>
                    ) },
                    { key: 'status', header: 'Status', render: (row) => (
                      <span className="flex items-center gap-2"><StatusBadge status={row.status} />
                        {row.priority === 'Urgent' && <PriorityBadge priority="Urgent" />}</span>
                    ) },
                  ]}
                  data={detail.audits}
                  rowKey={(row) => row.id}
                  emptyTitle="No audits yet"
                  emptySubtitle="Audit assignments for this employer will appear here."
                />
              </Card>
            ),
          },
          {
            key: 'documents',
            label: 'Compliance',
            badge: detail.documents.length,
            content: (
              <Card padded={false}>
                <CardHeader
                  title="Compliance document register"
                  description="Licences, registrations and returns held for this employer"
                  action={<LinkButton href={`/admin/compliance/documents?employerId=${employer.id}`} size="sm">Open Register</LinkButton>}
                />
                <DataTable
                  columns={[
                    { key: 'document_name', header: 'Document', render: (row: EmployerDetail['documents'][number]) => (
                      <div><span className="font-medium text-ink">{truncate(row.document_name, 44)}</span>
                        <span className="block text-xs text-ink-muted">{row.document_type}</span></div>
                    ) },
                    { key: 'document_number', header: 'Number', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{row.document_number ?? '—'}</span> },
                    { key: 'authority', header: 'Issuing Authority', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{truncate(row.issuing_authority ?? '—', 30)}</span> },
                    { key: 'expiry', header: 'Expiry', render: (row) => <span className="text-ink-soft">{formatDate(row.expiry_date)}</span> },
                    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.compliance_status} /> },
                  ]}
                  data={detail.documents}
                  rowKey={(row) => row.id}
                  emptyTitle="Register is empty"
                  emptySubtitle="Compliance documents recorded for this employer will appear here."
                />
              </Card>
            ),
          },
          {
            key: 'users',
            label: 'Portal Users',
            badge: detail.portalUsers.length,
            content: (
              <Card padded={false}>
                <CardHeader title="Portal logins" description="Staff at this employer who can sign in to the employer panel" />
                {detail.portalUsers.length === 0 ? (
                  <CardBody>
                    <EmptyState
                      title="No portal users"
                      subtitle="Create a login for this employer's HR team from the edit screen, or invite them again."
                      action={<LinkButton href={`/admin/employers/${employer.id}/edit`} size="sm" variant="outline">Open Edit Screen</LinkButton>}
                    />
                  </CardBody>
                ) : (
                  <DataTable
                    columns={[
                      { key: 'full_name', header: 'Name', render: (row: EmployerDetail['portalUsers'][number]) => <span className="font-medium text-ink">{row.full_name}</span> },
                      { key: 'email', header: 'Email', render: (row) => <span className="text-ink-soft">{row.email}</span> },
                      { key: 'primary', header: 'Type', render: (row) => <Badge tone={row.is_primary ? 'brand' : 'default'}>{row.is_primary ? 'Primary contact' : 'Additional user'}</Badge> },
                      { key: 'actions', header: 'Actions', width: 120, align: 'right', render: (row) => (
                        <LinkButton href={`/admin/users/${row.user_id}`} size="sm" variant="ghost">Manage</LinkButton>
                      ) },
                    ]}
                    data={detail.portalUsers}
                    rowKey={(row) => row.id}
                  />
                )}
              </Card>
            ),
          },
        ]}
      />

      <UnitModal
        open={unitModal.open}
        row={unitModal.row}
        employerId={employer.id}
        onClose={() => setUnitModal({ open: false })}
        onSaved={() => { setUnitModal({ open: false }); router.refresh(); }}
      />

      <DepartmentModal
        open={departmentModal.open}
        row={departmentModal.row}
        employerId={employer.id}
        units={detail.units as unknown as UnitRow[]}
        onClose={() => setDepartmentModal({ open: false })}
        onSaved={() => { setDepartmentModal({ open: false }); router.refresh(); }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={runDelete}
        loading={working}
        title={`Remove this ${deleteTarget?.kind ?? 'record'}?`}
        message={deleteTarget?.kind === 'department'
          ? `${deleteTarget?.label} will be removed. Departments with employees cannot be deleted — reassign them first.`
          : `${deleteTarget?.label} will be removed from this employer. Its employees remain untouched.`}
        confirmLabel="Remove"
        variant="danger"
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="detail-label">{label}</dt>
      <dd className="detail-value">{value}</dd>
    </div>
  );
}

function Icon({ path }: { path: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

function buildSummaryRows(detail: EmployerDetail): string[][] {
  const { employer, stats } = detail;
  return [
    ['Company', 'Legal Name', employer.company_name],
    ['Company', 'Employer Code', employer.employer_code],
    ['Company', 'Status', employer.status],
    ['Company', 'Industry', employer.industry_type ?? ''],
    ['Company', 'GST Number', employer.gst_number ?? ''],
    ['Company', 'PAN Number', employer.pan_number ?? ''],
    ['Company', 'CIN Number', employer.cin_number ?? ''],
    ['Address', 'Line 1', employer.address_line_1 ?? ''],
    ['Address', 'Line 2', employer.address_line_2 ?? ''],
    ['Address', 'City', employer.city ?? ''],
    ['Address', 'State', employer.state ?? ''],
    ['Address', 'Pincode', employer.pincode ?? ''],
    ['Contact', 'Name', employer.contact_person_name ?? ''],
    ['Contact', 'Designation', employer.contact_person_designation ?? ''],
    ['Contact', 'Email', employer.contact_person_email ?? ''],
    ['Contact', 'Mobile', employer.contact_person_mobile ?? ''],
    ['Statistics', 'Total Employees', String(stats.totalEmployees)],
    ['Statistics', 'Active Employees', String(stats.activeEmployees)],
    ['Statistics', 'Units', String(stats.totalUnits)],
    ['Statistics', 'Departments', String(stats.totalDepartments)],
    ['Statistics', 'Total Audits', String(stats.totalAudits)],
    ['Statistics', 'Pending Audits', String(stats.pendingAudits)],
    ['Statistics', 'Compliance Documents', String(stats.complianceDocuments)],
    ['Statistics', 'Expired Documents', String(stats.expiredDocuments)],
    ['Statistics', 'Expiring Soon (90 days)', String(stats.expiringSoonDocuments)],
  ];
}

// ── Unit modal ───────────────────────────────────────────────────────────

function UnitModal({
  open, row, employerId, onClose, onSaved,
}: { open: boolean; row?: UnitRow; employerId: number; onClose: () => void; onSaved: () => void }) {
  const { success, error: errorToast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Seed the form whenever the modal opens for a different row.
  const [seededFor, setSeededFor] = useState<string>('');
  const key = `${open}-${row?.id ?? 'new'}`;
  if (open && seededFor !== key) {
    setSeededFor(key);
    setForm({
      unit_name: row?.unit_name ?? '', unit_code: row?.unit_code ?? '', location: row?.location ?? '',
      address: row?.address ?? '', contact_person_name: row?.contact_person_name ?? '',
      contact_person_email: row?.contact_person_email ?? '', contact_person_phone: row?.contact_person_phone ?? '',
      employee_count: row?.employee_count !== null && row?.employee_count !== undefined ? String(row.employee_count) : '',
      status: row?.status ?? 'active',
    });
    setErrors({});
  }

  const set = (field: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit() {
    setSaving(true);
    const payload = { ...form, employee_count: form.employee_count === '' ? null : Number(form.employee_count) };
    const result = row
      ? await api.put(`/api/admin/units/${row.id}`, payload)
      : await api.post(`/api/admin/employers/${employerId}/units`, payload);
    setSaving(false);

    if (result.ok) {
      success(row ? 'Unit updated' : 'Unit added', `${form.unit_name} saved successfully.`);
      onSaved();
    } else {
      setErrors(fieldErrors(result));
      errorToast('Could not save unit', result.message);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? 'Edit unit' : 'Add unit'}
      description="Units are the plants, branches and offices you audit and report on separately."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{row ? 'Save Changes' : 'Add Unit'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Unit Name" requiredMark value={form.unit_name ?? ''} onChange={set('unit_name')} error={errors.unit_name} placeholder="e.g. Unit II — Hosur Plant" />
        <Input label="Unit Code" value={form.unit_code ?? ''} onChange={set('unit_code')} error={errors.unit_code} placeholder="e.g. HSR-02" />
        <Input label="Location" value={form.location ?? ''} onChange={set('location')} error={errors.location} placeholder="e.g. Hosur, Krishnagiri" />
        <Input label="Employee Count" type="number" min={0} value={form.employee_count ?? ''} onChange={set('employee_count')} error={errors.employee_count} />
        <Input label="Contact Person" value={form.contact_person_name ?? ''} onChange={set('contact_person_name')} error={errors.contact_person_name} />
        <Input label="Contact Phone" value={form.contact_person_phone ?? ''} onChange={set('contact_person_phone')} error={errors.contact_person_phone} />
        <Input label="Contact Email" type="email" value={form.contact_person_email ?? ''} onChange={set('contact_person_email')} error={errors.contact_person_email} />
        <Select label="Status" value={form.status ?? 'active'} onChange={(value) => setForm((current) => ({ ...current, status: value }))}
          options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
        <div className="sm:col-span-2">
          <Textarea label="Address" rows={3} value={form.address ?? ''} onChange={set('address')} error={errors.address} />
        </div>
      </div>
    </Modal>
  );
}

// ── Department modal ─────────────────────────────────────────────────────

function DepartmentModal({
  open, row, employerId, units, onClose, onSaved,
}: {
  open: boolean; row?: DepartmentRow; employerId: number; units: UnitRow[]; onClose: () => void; onSaved: () => void;
}) {
  const { success, error: errorToast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [seededFor, setSeededFor] = useState<string>('');
  const key = `${open}-${row?.id ?? 'new'}`;
  if (open && seededFor !== key) {
    setSeededFor(key);
    setForm({
      department_name: row?.department_name ?? '', department_code: row?.department_code ?? '',
      unit_id: row?.unit_id ? String(row.unit_id) : '', head_of_department: row?.head_of_department ?? '',
      contact_email: row?.contact_email ?? '', contact_phone: row?.contact_phone ?? '',
      employee_count: row?.employee_count !== null && row?.employee_count !== undefined ? String(row.employee_count) : '',
      status: row?.status ?? 'active',
    });
    setErrors({});
  }

  const set = (field: string) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  async function submit() {
    setSaving(true);
    const payload = {
      ...form,
      unit_id: form.unit_id === '' ? null : Number(form.unit_id),
      employee_count: form.employee_count === '' ? null : Number(form.employee_count),
    };
    const result = row
      ? await api.put(`/api/admin/departments/${row.id}`, payload)
      : await api.post(`/api/admin/employers/${employerId}/departments`, payload);
    setSaving(false);

    if (result.ok) {
      success(row ? 'Department updated' : 'Department added', `${form.department_name} saved successfully.`);
      onSaved();
    } else {
      setErrors(fieldErrors(result));
      errorToast('Could not save department', result.message);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={row ? 'Edit department' : 'Add department'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>{row ? 'Save Changes' : 'Add Department'}</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Input label="Department Name" requiredMark value={form.department_name ?? ''} onChange={set('department_name')} error={errors.department_name} placeholder="e.g. Spinning" />
        <Input label="Department Code" value={form.department_code ?? ''} onChange={set('department_code')} error={errors.department_code} />
        <Select
          label="Unit" placeholder="All units" clearable
          value={form.unit_id ?? ''}
          onChange={(value) => setForm((current) => ({ ...current, unit_id: value }))}
          options={units.map((unit) => ({ value: String(unit.id), label: unit.unit_name }))}
        />
        <Input label="Head of Department" value={form.head_of_department ?? ''} onChange={set('head_of_department')} error={errors.head_of_department} />
        <Input label="Contact Email" type="email" value={form.contact_email ?? ''} onChange={set('contact_email')} error={errors.contact_email} />
        <Input label="Contact Phone" value={form.contact_phone ?? ''} onChange={set('contact_phone')} error={errors.contact_phone} />
        <Input label="Employee Count" type="number" min={0} value={form.employee_count ?? ''} onChange={set('employee_count')} error={errors.employee_count} />
        <Select label="Status" value={form.status ?? 'active'} onChange={(value) => setForm((current) => ({ ...current, status: value }))}
          options={[{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
      </div>
    </Modal>
  );
}
