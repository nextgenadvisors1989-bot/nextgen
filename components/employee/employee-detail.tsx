'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { FileUpload } from '@/components/ui/file-upload';
import { DataTable, type Column } from '@/components/ui/table';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { ProgressBar } from '@/components/ui/progress-bar';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatDate, ageFromDob } from '@/lib/utils/dates';
import { formatCurrency, formatNumber, maskAadhaar, maskAccountNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv, downloadFromApi } from '@/lib/utils/export';
import { PersonalFileDocuments } from '@/components/employee/personal-file-documents';
import { DOCUMENT_TYPES } from '@/types/employee';
import type { EmployeeDetail } from '@/services/employee.service';

interface RecordRow extends Record<string, unknown> { id: number }

/** Every employee-facing tab in one component, driven by /api/admin/employees/:id/:resource. */
export function EmployeeDetailView({
  detail, permissions, basePath = '/api/admin',
}: {
  detail: EmployeeDetail;
  permissions: { update: boolean; create: boolean; remove: boolean };
  /** `/api/admin` in the platform's register, `/api/employer` in an establishment's. */
  basePath?: string;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const { employee, stats } = detail;
  const [modal, setModal] = useState<{ resource: string; label: string; row?: RecordRow } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ resource: string; label: string; id: number; name: string } | null>(null);
  const [working, setWorking] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const checklistPercent = stats.checklistTotal > 0 ? (stats.checklistDone / stats.checklistTotal) * 100 : 0;

  async function confirmDelete() {
    if (!deleteTarget) return;
    setWorking(true);
    const result = await api.delete(`${basePath}/employees/${employee.id}/${deleteTarget.resource}/${deleteTarget.id}`);
    setWorking(false);
    if (result.ok) {
      success(`${deleteTarget.label} removed`, `${deleteTarget.name} has been removed.`);
      setDeleteTarget(null);
      router.refresh();
    } else {
      errorToast('Could not remove record', result.message);
    }
  }

  async function downloadEmployeePdf() {
    setDownloading(true);
    const result = await downloadFromApi(
      `/api/pdf/employee/${employee.id}`,
      `employee-${employee.employee_number}.pdf`
    );
    setDownloading(false);
    if (!result.ok) errorToast('Download failed', result.message ?? 'The employee PDF could not be generated');
  }

  function rowActions(resource: string, label: string, nameOf: (row: RecordRow) => string) {
    if (!permissions.update && !permissions.remove) return undefined;
    return (row: RecordRow) => (
      <span className="flex items-center justify-end gap-1">
        {permissions.update && (
          <button type="button" className="btn-icon" title={`Edit ${label.toLowerCase()}`}
            aria-label={`Edit ${nameOf(row)}`} onClick={() => setModal({ resource, label, row })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        )}
        {permissions.remove && (
          <button type="button" className="btn-icon btn-icon-danger" title={`Remove ${label.toLowerCase()}`}
            aria-label={`Remove ${nameOf(row)}`}
            onClick={() => setDeleteTarget({ resource, label, id: row.id, name: nameOf(row) })}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
          </button>
        )}
      </span>
    );
  }

  const addButton = (resource: string, label: string) =>
    permissions.create ? <Button size="sm" onClick={() => setModal({ resource, label })}>Add {label}</Button> : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-lg font-semibold text-brand-700">
            {employee.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="page-title">{employee.name}</h1>
              <StatusBadge status={employee.status} />
              {employee.category && <Badge tone="default">{employee.category}</Badge>}
              {employee.workforce_origin && <Badge tone="slate">{employee.workforce_origin}</Badge>}
              {employee.employment_type && <Badge tone="info">{employee.employment_type}</Badge>}
              {employee.has_login ? <Badge tone="brand">Portal login active</Badge> : <Badge tone="slate">No login</Badge>}
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {employee.employee_number} · {employee.designation ?? 'Designation not set'} ·{' '}
              <Link href={`/admin/employers/${employee.employer_id}`} className="link">{employee.employer_name}</Link>
              {employee.unit_name ? ` · ${employee.unit_name}` : ''}
              {employee.department_name ? ` · ${employee.department_name}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-ink-muted">
              Joined {formatDate(employee.date_of_joining)}
              {employee.date_of_birth ? ` · age ${ageFromDob(employee.date_of_birth) ?? '—'}` : ''}
              {employee.mobile ? ` · ${employee.mobile}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" loading={downloading} onClick={downloadEmployeePdf}>Download PDF</Button>
          <Button variant="outline" size="sm" disabled={detail.documents.length === 0}
            onClick={() => downloadCsv(
              `employee-${employee.employee_number}-documents.csv`,
              ['Type', 'Document', 'Number', 'Issued', 'Expiry', 'Verified'],
              detail.documents.map((row) => [
                String(row.document_type), String(row.document_name), String(row.document_number ?? ''),
                formatDate(row.issue_date as string | null), formatDate(row.expiry_date as string | null),
                Number(row.is_verified) ? 'Yes' : 'No',
              ])
            )}>
            Export Documents
          </Button>
          {permissions.update && <LinkButton href={`/admin/employees/${employee.id}/edit`} size="sm">Edit</LinkButton>}
          <LinkButton href="/admin/employees" size="sm" variant="ghost">Back to list</LinkButton>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gross Salary" value={formatCurrency(employee.gross_salary ?? 0, { decimals: 0 })} hint={employee.wage_type ?? 'Per Month'} tone="brand" />
        <StatCard
          label="Personal File" value={`${stats.checklistDone} / ${stats.checklistTotal}`}
          hint={checklistPercent === 100 ? 'Complete' : 'Items pending'} tone={checklistPercent === 100 ? 'emerald' : 'amber'}
        />
        <StatCard label="Documents on File" value={formatNumber(stats.documents)} hint={`${stats.qualifications} qualification(s)`} tone="violet" />
        <StatCard
          label="Payslips Published" value={formatNumber(stats.payslips)}
          hint={`Lifetime net ${formatCurrency(stats.lifetimeNetPay, { decimals: 0 })}`} tone="emerald"
        />
      </div>

      <Tabs
        items={[
          {
            key: 'overview', label: 'Overview',
            content: (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <Card padded={false}>
                  <CardHeader title="Personal details" action={<LinkButton href={`/admin/employees/${employee.id}/edit`} size="sm" variant="ghost">Edit</LinkButton>} />
                  <CardBody className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Detail label="Full Name" value={employee.name} />
                    <Detail label="Father / Husband" value={employee.father_name ?? '—'} />
                    <Detail label="Mother" value={employee.mother_name ?? '—'} />
                    <Detail label="Spouse" value={employee.spouse_name ?? '—'} />
                    <Detail label="Sex" value={employee.sex ?? '—'} />
                    <Detail label="Marital Status" value={employee.marital_status ?? '—'} />
                    <Detail label="Date of Birth" value={formatDate(employee.date_of_birth)} />
                    <Detail label="Blood Group" value={employee.blood_group ?? '—'} />
                    <Detail label="Religion" value={employee.religion ?? '—'} />
                    <Detail label="Mother Tongue" value={employee.mother_tongue ?? '—'} />
                    <Detail label="Languages Known" value={employee.languages_known ?? '—'} />
                    <Detail label="Aadhaar" value={employee.aadhaar_number ? maskAadhaar(employee.aadhaar_number) : '—'} />
                    <Detail label="PAN" value={employee.pan_number ?? '—'} />
                  </CardBody>
                </Card>

                <Card padded={false}>
                  <CardHeader title="Contact & address" />
                  <CardBody className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Detail label="Mobile" value={employee.mobile ?? '—'} />
                    <Detail label="Telephone" value={employee.telephone ?? '—'} />
                    <Detail label="Email" value={employee.email ?? '—'} />
                    <Detail label="Native Place" value={employee.native_place ?? '—'} />
                    <Detail label="Staying In" value={employee.staying_in ?? '—'} />
                    <Detail label="State / Pincode" value={[employee.state, employee.pincode].filter(Boolean).join(' — ') || '—'} />
                    <div className="sm:col-span-2">
                      <Detail label="Present Address" value={<span className="whitespace-pre-line">{employee.present_address ?? '—'}</span>} />
                    </div>
                    <div className="sm:col-span-2">
                      <Detail label="Permanent Address" value={<span className="whitespace-pre-line">
                        {employee.is_permanent_same_as_present ? 'Same as present address' : employee.permanent_address ?? '—'}
                      </span>} />
                    </div>
                    <Detail label="Family Income / Annum" value={employee.family_income_per_annum ? formatCurrency(employee.family_income_per_annum, { decimals: 0 }) : '—'} />
                  </CardBody>
                </Card>

                <Card padded={false}>
                  <CardHeader title="Employment" />
                  <CardBody className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Detail label="Employer" value={employee.employer_name} />
                    <Detail label="Unit" value={employee.unit_name ?? '—'} />
                    <Detail label="Department" value={employee.department_name ?? employee.department ?? '—'} />
                    <Detail label="Designation" value={employee.designation ?? '—'} />
                    <Detail label="Post Applied For" value={employee.post_applied_for ?? '—'} />
                    <Detail label="Nature of Work" value={employee.nature_of_work ?? '—'} />
                    <Detail label="Date of Joining" value={formatDate(employee.date_of_joining)} />
                    <Detail label="Date of Confirmation" value={formatDate(employee.date_of_confirmation)} />
                    <Detail label="Probation" value={employee.probation_months ? `${employee.probation_months} month(s)` : '—'} />
                    <Detail label="Grade / Skill Grade" value={[employee.grade, employee.skill_grade].filter(Boolean).join(' / ') || '—'} />
                    <Detail label="Shift / Relay" value={employee.shift_relay ?? '—'} />
                    <Detail label="Weekly Off" value={employee.weekly_off ?? '—'} />
                    <Detail label="Working Hours" value={[employee.working_hours_from, employee.working_hours_to].filter(Boolean).join(' – ') || '—'} />
                    <Detail label="Lunch / Tea" value={[employee.interval_lunch_time, employee.tea_break].filter(Boolean).join(' · ') || '—'} />
                    <Detail label="Place of Work" value={employee.place_of_work ?? '—'} />
                  </CardBody>
                </Card>

                <Card padded={false}>
                  <CardHeader title="Statutory, bank & passport" />
                  <CardBody className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Detail label="PF Number" value={employee.pf_number ?? '—'} />
                    <Detail label="UAN" value={employee.uan ?? '—'} />
                    <Detail label="PF Effective Date" value={formatDate(employee.pf_effective_date)} />
                    <Detail label="ESI Number" value={employee.esi_number ?? '—'} />
                    <Detail label="ESI Dispensary" value={employee.esi_dispensary ?? '—'} />
                    <Detail label="Mediclaim Number" value={employee.mediclaim_number ?? '—'} />
                    <Detail label="Previous PF Account" value={employee.previous_pf_account_number ?? '—'} />
                    <Detail label="Previous Exit Date" value={formatDate(employee.previous_employer_exit_date)} />
                    <Detail label="Scheme Certificate" value={employee.scheme_certificate_number ?? '—'} />
                    <Detail label="Pension Payment Order" value={employee.pension_payment_order_number ?? '—'} />
                    <Detail label="International Worker" value={employee.is_international_worker ? `Yes${employee.country ? ` (${employee.country})` : ''}` : 'No'} />
                    <Detail label="Bank" value={employee.bank_name ?? '—'} />
                    <Detail label="Account Number" value={employee.bank_account_number ? maskAccountNumber(employee.bank_account_number) : '—'} />
                    <Detail label="IFSC" value={employee.ifsc_code ?? '—'} />
                    <Detail label="Passport" value={employee.passport_number ?? '—'} />
                    <Detail label="Passport Validity" value={formatDate(employee.passport_validity)} />
                  </CardBody>
                </Card>

                <Card padded={false} className="lg:col-span-2">
                  <CardHeader title="Wage structure" description={detail.salaryStructure ? 'Active salary structure on record' : 'Wage heads recorded on the employee master'} />
                  <CardBody>
                    {detail.salaryStructure ? (
                      <div className="overflow-x-auto">
                        <table className="table-base">
                          <thead>
                            <tr>
                              <th className="table-head">Component</th>
                              <th className="table-head text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(['basic', 'da', 'hra', 'ta', 'pa', 'ea', 'npba', 'other_allowances'] as const).map((field) => (
                              <tr key={field}>
                                <td className="table-cell uppercase text-ink-soft">{field.replace(/_/g, ' ')}</td>
                                <td className="table-cell text-right text-ink">{formatCurrency(detail.salaryStructure?.[field] ?? 0)}</td>
                              </tr>
                            ))}
                            <tr className="bg-surface-muted">
                              <td className="table-cell font-semibold text-ink">Gross Salary</td>
                              <td className="table-cell text-right font-semibold text-ink">{formatCurrency(detail.salaryStructure?.gross_salary ?? 0)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <Detail label="Basic" value={formatCurrency(employee.basic_salary ?? 0)} />
                        <Detail label="DA" value={formatCurrency(employee.da ?? 0)} />
                        <Detail label="HRA" value={formatCurrency(employee.hra ?? 0)} />
                        <Detail label="TA" value={formatCurrency(employee.ta ?? 0)} />
                        <Detail label="PA" value={formatCurrency(employee.pa ?? 0)} />
                        <Detail label="EA" value={formatCurrency(employee.ea ?? 0)} />
                        <Detail label="NPBA" value={formatCurrency(employee.npba ?? 0)} />
                        <Detail label="Other Allowances" value={formatCurrency(employee.other_allowances ?? 0)} />
                        <Detail label="Gross" value={<span className="font-semibold">{formatCurrency(employee.gross_salary ?? 0)}</span>} />
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>
            ),
          },
          {
            key: 'qualifications', label: 'Qualifications', badge: detail.qualifications.length,
            content: (
              <Card padded={false}>
                <CardHeader title="Educational qualifications" action={addButton('qualifications', 'Qualification')} />
                <DataTable<RecordRow>
                  columns={[
                    { key: 'qualification', header: 'Qualification', render: (row) => <span className="font-medium text-ink">{String(row.qualification)}</span> },
                    { key: 'specialization', header: 'Specialization', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{String(row.specialization ?? '—')}</span> },
                    { key: 'institution', header: 'Institution', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{truncate(String(row.institution ?? '—'), 30)}</span> },
                    { key: 'board', header: 'Board / University', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{truncate(String(row.board_university ?? '—'), 26)}</span> },
                    { key: 'year', header: 'Year', align: 'center', render: (row) => <span className="text-ink-soft">{String(row.year_of_passing ?? '—')}</span> },
                    { key: 'marks', header: 'Marks', align: 'center', render: (row) => (
                      <span className="text-ink-soft">{row.percentage ? `${Number(row.percentage).toFixed(2)}%` : String(row.grade ?? '—')}</span>
                    ) },
                    { key: 'actions', header: 'Actions', width: 120, align: 'right', render: rowActions('qualifications', 'Qualification', (row) => String(row.qualification)) },
                  ]}
                  data={detail.qualifications as unknown as RecordRow[]}
                  rowKey={(row) => row.id}
                  emptyTitle="No qualifications recorded"
                  emptySubtitle="Add SSLC, HSC, ITI, diploma or degree qualifications with institution and year of passing."
                  emptyAction={addButton('qualifications', 'Qualification')}
                />
              </Card>
            ),
          },
          {
            key: 'experience', label: 'Experience', badge: detail.experience.length,
            content: (
              <Card padded={false}>
                <CardHeader title="Previous employment" action={addButton('experience', 'Experience')} />
                <DataTable<RecordRow>
                  columns={[
                    { key: 'company_name', header: 'Company', render: (row) => <span className="font-medium text-ink">{String(row.company_name)}</span> },
                    { key: 'designation', header: 'Designation', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{String(row.designation ?? '—')}</span> },
                    { key: 'department', header: 'Department', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{String(row.department ?? '—')}</span> },
                    { key: 'period', header: 'Period', render: (row) => (
                      <span className="text-ink-soft">{formatDate(row.date_from as string)} → {formatDate(row.date_to as string)}</span>
                    ) },
                    { key: 'total', header: 'Total', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{String(row.total_period ?? '—')}</span> },
                    { key: 'last_salary', header: 'Last Salary', align: 'right', render: (row) => (
                      <span className="text-ink-soft">{row.last_salary ? formatCurrency(row.last_salary, { decimals: 0 }) : '—'}</span>
                    ) },
                    { key: 'actions', header: 'Actions', width: 120, align: 'right', render: rowActions('experience', 'Experience', (row) => String(row.company_name)) },
                  ]}
                  data={detail.experience as unknown as RecordRow[]}
                  rowKey={(row) => row.id}
                  emptyTitle="No previous employment recorded"
                  emptySubtitle="Add earlier employers for experience verification and gratuity continuity."
                  emptyAction={addButton('experience', 'Experience')}
                />
              </Card>
            ),
          },
          {
            key: 'dependents', label: 'Dependents', badge: detail.dependents.length,
            content: (
              <Card padded={false}>
                <CardHeader title="Dependents" action={addButton('dependents', 'Dependent')} />
                <DataTable<RecordRow>
                  columns={[
                    { key: 'dependent_name', header: 'Name', render: (row) => <span className="font-medium text-ink">{String(row.dependent_name)}</span> },
                    { key: 'relationship', header: 'Relationship', render: (row) => <span className="text-ink-soft">{String(row.relationship ?? '—')}</span> },
                    { key: 'dob', header: 'Date of Birth', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{formatDate(row.date_of_birth as string)}</span> },
                    { key: 'age', header: 'Age', align: 'center', render: (row) => {
                      const computed = ageFromDob(row.date_of_birth as string);
                      const stored = row.age === null || row.age === undefined ? null : Number(row.age);
                      return <span className="text-ink-soft">{computed ?? stored ?? '—'}</span>;
                    } },
                    { key: 'sex', header: 'Sex', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{String(row.sex ?? '—')}</span> },
                    { key: 'occupation', header: 'Occupation', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{String(row.occupation ?? '—')}</span> },
                    { key: 'nominee', header: 'Nominee', align: 'center', render: (row) => (
                      row.is_nominee ? <Badge tone="success">Yes</Badge> : <span className="text-ink-muted">No</span>
                    ) },
                    { key: 'actions', header: 'Actions', width: 120, align: 'right', render: rowActions('dependents', 'Dependent', (row) => String(row.dependent_name)) },
                  ]}
                  data={detail.dependents as unknown as RecordRow[]}
                  rowKey={(row) => row.id}
                  emptyTitle="No dependents recorded"
                  emptySubtitle="Dependents are required for ESI, mediclaim and nomination records."
                  emptyAction={addButton('dependents', 'Dependent')}
                />
              </Card>
            ),
          },
          {
            key: 'references', label: 'References', badge: detail.references.length,
            content: (
              <Card padded={false}>
                <CardHeader title="References" action={addButton('references', 'Reference')} />
                <DataTable<RecordRow>
                  columns={[
                    { key: 'reference_name', header: 'Name', render: (row) => <span className="font-medium text-ink">{String(row.reference_name)}</span> },
                    { key: 'designation', header: 'Designation', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{String(row.designation ?? '—')}</span> },
                    { key: 'organization', header: 'Organisation', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{truncate(String(row.organization ?? '—'), 28)}</span> },
                    { key: 'mobile', header: 'Mobile', render: (row) => <span className="text-ink-soft">{String(row.mobile ?? '—')}</span> },
                    { key: 'email', header: 'Email', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{String(row.email ?? '—')}</span> },
                    { key: 'relationship', header: 'Relationship', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{String(row.relationship ?? '—')}</span> },
                    { key: 'actions', header: 'Actions', width: 120, align: 'right', render: rowActions('references', 'Reference', (row) => String(row.reference_name)) },
                  ]}
                  data={detail.references as unknown as RecordRow[]}
                  rowKey={(row) => row.id}
                  emptyTitle="No references recorded"
                  emptySubtitle="Record two references for background verification."
                  emptyAction={addButton('references', 'Reference')}
                />
              </Card>
            ),
          },
          {
            key: 'nominees', label: 'Nominees', badge: detail.nominees.length,
            content: (
              <Card padded={false}>
                <CardHeader
                  title="EPF Form 2 and Gratuity Form F nominees"
                  description="Nominee shares per form should total 100%."
                  action={addButton('nominees', 'Nominee')}
                />
                <DataTable<RecordRow>
                  columns={[
                    { key: 'form_type', header: 'Form', render: (row) => (
                      <Badge tone={String(row.form_type) === 'EPF_FORM_2' ? 'brand' : 'violet'}>
                        {String(row.form_type) === 'EPF_FORM_2' ? 'EPF Form 2' : 'Gratuity Form F'}
                      </Badge>
                    ) },
                    { key: 'nominee_name', header: 'Nominee', render: (row) => <span className="font-medium text-ink">{String(row.nominee_name)}</span> },
                    { key: 'relationship', header: 'Relationship', render: (row) => <span className="text-ink-soft">{String(row.relationship ?? '—')}</span> },
                    { key: 'dob', header: 'Date of Birth', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{formatDate(row.date_of_birth as string)}</span> },
                    { key: 'share', header: 'Share', align: 'center', render: (row) => (
                      <span className="text-ink-soft">{Number(row.share_percentage ?? 0).toFixed(0)}%</span>
                    ) },
                    { key: 'guardian', header: 'Guardian', hideOnMobile: true, render: (row) => (
                      <span className="text-ink-soft">{row.is_minor ? String(row.guardian_name ?? '—') : '—'}</span>
                    ) },
                    { key: 'actions', header: 'Actions', width: 120, align: 'right', render: rowActions('nominees', 'Nominee', (row) => String(row.nominee_name)) },
                  ]}
                  data={detail.nominees as unknown as RecordRow[]}
                  rowKey={(row) => row.id}
                  emptyTitle="No nominees recorded"
                  emptySubtitle="EPF and gratuity nominations protect the employee's family in the event of death in service."
                  emptyAction={addButton('nominees', 'Nominee')}
                />
              </Card>
            ),
          },
          {
            key: 'documents', label: 'Documents', badge: detail.documents.length,
            content: (
              <Card padded={false}>
                <CardHeader
                  title="Employee documents"
                  description="Certificates, identity proofs and statutory forms held against this employee."
                  action={addButton('documents', 'Document')}
                />
                <DataTable<RecordRow>
                  columns={[
                    { key: 'document_name', header: 'Document', render: (row) => (
                      <div>
                        <span className="font-medium text-ink">{truncate(String(row.document_name), 40)}</span>
                        <span className="block text-xs text-ink-muted">{String(row.document_type)}</span>
                      </div>
                    ) },
                    { key: 'document_number', header: 'Number', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{String(row.document_number ?? '—')}</span> },
                    { key: 'issue', header: 'Issued', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{formatDate(row.issue_date as string)}</span> },
                    { key: 'expiry', header: 'Expiry', render: (row) => <span className="text-ink-soft">{formatDate(row.expiry_date as string)}</span> },
                    { key: 'file', header: 'File', align: 'center', render: (row) => (
                      row.file_id ? (
                        <a href={`/api/files/${String(row.file_id)}/download`} download className="link text-xs">Download</a>
                      ) : <span className="text-xs text-ink-muted">Not uploaded</span>
                    ) },
                    { key: 'verified', header: 'Verified', align: 'center', render: (row) => (
                      Number(row.is_verified) ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Pending</Badge>
                    ) },
                    { key: 'actions', header: 'Actions', width: 120, align: 'right', render: rowActions('documents', 'Document', (row) => String(row.document_name)) },
                  ]}
                  data={detail.documents as unknown as RecordRow[]}
                  rowKey={(row) => row.id}
                  emptyTitle="No documents on file"
                  emptySubtitle="Upload Aadhaar, PAN, education certificates, appointment and relieving letters."
                  emptyAction={addButton('documents', 'Document')}
                />
              </Card>
            ),
          },
          {
            key: 'checklist', label: 'Personal File', badge: `${stats.checklistDone}/${stats.checklistTotal}`,
            content: (
              <div className="space-y-6">
              <Card padded={false}>
                <CardHeader
                  title="Personal file checklist"
                  description="The 16 items an establishment must hold on every employee's personnel file."
                />
                <CardBody className="space-y-4">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="text-ink-soft">Completion</span>
                      <span className="font-medium text-ink">{stats.checklistDone} of {stats.checklistTotal}</span>
                    </div>
                    <ProgressBar value={checklistPercent} tone={checklistPercent === 100 ? 'emerald' : 'brand'} />
                  </div>
                  <div className="divide-y divide-line rounded-lg border border-line">
                    {detail.checklist.map((item) => (
                      <label key={String(item.item_id)} className="flex cursor-pointer items-start gap-3 px-4 py-3">
                        <Checkbox
                          label=""
                          checked={Boolean(item.is_checked)}
                          disabled={!permissions.update}
                          onChange={async (event) => {
                            const checked = (event.target as HTMLInputElement).checked;
                            const result = await api.post(`${basePath}/employees/${employee.id}/checklist`, {
                              item_id: Number(item.item_id),
                              is_checked: checked,
                              remarks: (item.remarks as string | null) ?? '',
                            });
                            if (result.ok) {
                              router.refresh();
                            } else {
                              errorToast('Could not update checklist', result.message);
                            }
                          }}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] text-ink">
                            {String(item.item_label)}
                            {Number(item.is_mandatory) ? <span className="ml-1 text-xs text-red-500">*</span> : null}
                          </span>
                          <span className="block text-xs text-ink-muted">
                            {String(item.item_code)}
                            {item.checked_at ? ` · checked ${formatDate(item.checked_at as string)}` : ''}
                            {item.remarks ? ` · ${String(item.remarks)}` : ''}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </CardBody>
              </Card>
              {basePath !== '/api/employee' && <PersonalFileDocuments employeeId={employee.id} employeeNumber={employee.employee_number} />}
              </div>
            ),
          },
          {
            key: 'service', label: 'Service Records', badge: detail.serviceRecords.length,
            content: (
              <Card padded={false}>
                <CardHeader
                  title="Service records"
                  description="Employment history across establishments, used for gratuity continuity and full & final settlement."
                  action={addButton('service-records', 'Service Record')}
                />
                <DataTable<RecordRow>
                  columns={[
                    { key: 'employer_name', header: 'Employer', render: (row) => <span className="font-medium text-ink">{String(row.employer_name)}</span> },
                    { key: 'designation', header: 'Designation', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{String(row.designation ?? '—')}</span> },
                    { key: 'period', header: 'Period', render: (row) => (
                      <span className="text-ink-soft">{formatDate(row.date_from as string)} → {formatDate(row.date_to as string)}</span>
                    ) },
                    { key: 'salary', header: 'Last Drawn', align: 'right', render: (row) => (
                      <span className="text-ink-soft">{row.last_drawn_salary ? formatCurrency(row.last_drawn_salary, { decimals: 0 }) : '—'}</span>
                    ) },
                    { key: 'reason', header: 'Reason for Leaving', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{truncate(String(row.reason_for_leaving ?? '—'), 30)}</span> },
                    { key: 'actions', header: 'Actions', width: 120, align: 'right', render: rowActions('service-records', 'Service Record', (row) => String(row.employer_name)) },
                  ]}
                  data={detail.serviceRecords as unknown as RecordRow[]}
                  rowKey={(row) => row.id}
                  emptyTitle="No service records"
                  emptySubtitle="Add previous service so continuous-service benefits can be computed correctly."
                  emptyAction={addButton('service-records', 'Service Record')}
                />
              </Card>
            ),
          },
          {
            key: 'interview', label: 'Interview',
            content: (
              <Card padded={false}>
                <CardHeader
                  title="Interview assessment"
                  description="Ratings recorded by the interview panel at the time of selection."
                  action={permissions.update ? (
                    <Button size="sm" variant="outline" onClick={() => setModal({ resource: 'interview', label: 'Interview' })}>
                      {detail.interview ? 'Update Assessment' : 'Record Assessment'}
                    </Button>
                  ) : undefined}
                />
                <CardBody>
                  {!detail.interview ? (
                    <EmptyState
                      title="No interview assessment recorded"
                      subtitle="Record the panel's ratings and recommendation for this employee's selection."
                      action={permissions.update ? <Button size="sm" onClick={() => setModal({ resource: 'interview', label: 'Interview' })}>Record Assessment</Button> : undefined}
                    />
                  ) : (
                    <div className="space-y-5">
                      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                        <Detail label="Interview Date" value={formatDate(detail.interview.interview_date as string)} />
                        <Detail label="Interviewer" value={String(detail.interview.interviewer_name ?? '—')} />
                        <Detail label="Position Applied For" value={String(detail.interview.position_applied ?? '—')} />
                        <Detail label="Recommendation" value={
                          detail.interview.recommendation ? <Badge tone="brand">{String(detail.interview.recommendation)}</Badge> : '—'
                        } />
                      </div>
                      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
                        {([
                          ['qualification_rating', 'Qualification'],
                          ['experience_rating', 'Experience'],
                          ['communication_rating', 'Communication'],
                          ['technical_rating', 'Technical'],
                          ['attitude_rating', 'Attitude'],
                          ['overall_rating', 'Overall'],
                        ] as const).map(([key, label]) => (
                          <div key={key} className="rounded-lg border border-line px-3 py-2 text-center">
                            <p className="text-xs text-ink-muted">{label}</p>
                            <p className="text-xl font-semibold text-ink">
                              {detail.interview?.[key] ?? '—'}<span className="text-xs text-ink-muted">/5</span>
                            </p>
                          </div>
                        ))}
                      </div>
                      {detail.interview.remarks && (
                        <div>
                          <p className="detail-label">Remarks</p>
                          <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{String(detail.interview.remarks)}</p>
                        </div>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            ),
          },
          {
            key: 'login', label: 'Login Account',
            content: (
              <Card padded={false}>
                <CardHeader title="Self-service login" description="The employee's own portal account" />
                <CardBody>
                  {!detail.login ? (
                    <EmptyState
                      title="No self-service login"
                      subtitle="Create a login from the edit screen so this employee can view payslips, attendance, leave and documents."
                      action={<LinkButton href={`/admin/employees/${employee.id}/edit`} size="sm" variant="outline">Open Edit Screen</LinkButton>}
                    />
                  ) : (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
                      <Detail label="Username" value={detail.login.username} />
                      <Detail label="Email" value={detail.login.email} />
                      <Detail label="Status" value={<StatusBadge status={detail.login.status} />} />
                      <Detail label="Password State" value={
                        detail.login.is_first_login
                          ? <Badge tone="warning">Temporary password — change required</Badge>
                          : <Badge tone="success">Password set by user</Badge>
                      } />
                      <Detail label="Last Sign-In" value={formatDate(detail.login.last_login_at)} />
                      <Detail label="Actions" value={<LinkButton href={`/admin/users/${detail.login.id}`} size="sm" variant="outline">Manage Account</LinkButton>} />
                    </div>
                  )}
                </CardBody>
              </Card>
            ),
          },
        ]}
      />

      <EmployeeRecordModal
        employeeId={employee.id}
        basePath={basePath}
        modal={modal}
        onClose={() => setModal(null)}
        onSaved={(label) => { setModal(null); success(`${label} saved`, 'The employee record has been updated.'); router.refresh(); }}
        checklistItems={detail.checklist.map((item) => ({
          id: Number(item.item_id), item_label: String(item.item_label), item_code: String(item.item_code),
        }))}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={working}
        title={`Remove this ${deleteTarget?.label.toLowerCase() ?? 'record'}?`}
        message={`${deleteTarget?.name ?? ''} will be soft-deleted and hidden from the employee's record. Nothing is permanently erased.`}
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

// ── Add / edit modal for every child collection ──────────────────────────

/** Matches the employee_interviews.recommendation enum exactly. */
const RECOMMENDATION_OPTIONS = ['Recommended', 'On Hold', 'Not Recommended'].map((value) => ({ value, label: value }));

const FIELDS: Record<string, { key: string; label: string; type?: string; options?: { value: string; label: string }[]; required?: boolean; span?: boolean }[]> = {
  qualifications: [
    { key: 'qualification', label: 'Qualification', required: true },
    { key: 'specialization', label: 'Specialization' },
    { key: 'institution', label: 'Institution' },
    { key: 'board_university', label: 'Board / University' },
    { key: 'year_of_passing', label: 'Year of Passing', type: 'number' },
    { key: 'percentage', label: 'Percentage', type: 'number' },
    { key: 'grade', label: 'Grade' },
    { key: 'remarks', label: 'Remarks', span: true },
  ],
  experience: [
    { key: 'company_name', label: 'Company', required: true },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'date_from', label: 'From', type: 'date' },
    { key: 'date_to', label: 'To', type: 'date' },
    { key: 'total_period', label: 'Total Period' },
    { key: 'last_salary', label: 'Last Salary', type: 'number' },
    { key: 'reason_for_leaving', label: 'Reason for Leaving', span: true },
  ],
  dependents: [
    { key: 'dependent_name', label: 'Name', required: true },
    { key: 'relationship', label: 'Relationship' },
    { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'sex', label: 'Sex', options: ['Male', 'Female', 'Other'].map((v) => ({ value: v, label: v })) },
    { key: 'occupation', label: 'Occupation' },
    { key: 'aadhaar_number', label: 'Aadhaar' },
  ],
  references: [
    { key: 'reference_name', label: 'Name', required: true },
    { key: 'designation', label: 'Designation' },
    { key: 'organization', label: 'Organisation' },
    { key: 'mobile', label: 'Mobile' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'relationship', label: 'Relationship' },
    { key: 'address', label: 'Address', span: true },
  ],
  nominees: [
    { key: 'form_type', label: 'Form', options: [
      { value: 'EPF_FORM_2', label: 'EPF Form 2' }, { value: 'GRATUITY_FORM_F', label: 'Gratuity Form F' },
    ] },
    { key: 'nominee_name', label: 'Nominee Name', required: true },
    { key: 'relationship', label: 'Relationship' },
    { key: 'date_of_birth', label: 'Date of Birth', type: 'date' },
    { key: 'share_percentage', label: 'Share %', type: 'number' },
    { key: 'guardian_name', label: 'Guardian (if minor)' },
    { key: 'address', label: 'Address', span: true },
  ],
  'service-records': [
    { key: 'employer_name', label: 'Employer', required: true },
    { key: 'designation', label: 'Designation' },
    { key: 'department', label: 'Department' },
    { key: 'date_from', label: 'From', type: 'date' },
    { key: 'date_to', label: 'To', type: 'date' },
    { key: 'total_period', label: 'Total Period' },
    { key: 'last_drawn_salary', label: 'Last Drawn Salary', type: 'number' },
    { key: 'reason_for_leaving', label: 'Reason for Leaving' },
    { key: 'remarks', label: 'Remarks', span: true },
  ],
  documents: [
    { key: 'document_type', label: 'Document Type', required: true, options: DOCUMENT_TYPES.map((value) => ({ value, label: value })) },
    { key: 'document_name', label: 'Document Name', required: true },
    { key: 'document_number', label: 'Document Number' },
    { key: 'issue_date', label: 'Issue Date', type: 'date' },
    { key: 'expiry_date', label: 'Expiry Date', type: 'date' },
    { key: 'remarks', label: 'Remarks', span: true },
  ],
};

function EmployeeRecordModal({
  employeeId, modal, onClose, onSaved, checklistItems, basePath = '/api/admin',
}: {
  employeeId: number;
  modal: { resource: string; label: string; row?: RecordRow } | null;
  onClose: () => void;
  onSaved: (label: string) => void;
  checklistItems: { id: number; item_label: string; item_code: string }[];
  basePath?: string;
}) {
  const { error: errorToast } = useToast();
  const [form, setForm] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [seeded, setSeeded] = useState('');

  const key = `${modal?.resource ?? ''}-${modal?.row?.id ?? 'new'}`;
  if (modal && seeded !== key) {
    setSeeded(key);
    if (modal.resource === 'interview') {
      setForm({});
    } else if (modal.row) {
      setForm(Object.fromEntries(
        Object.entries(modal.row)
          .filter(([, value]) => value !== null && value !== undefined && typeof value !== 'object')
          .map(([field, value]) => [field, String(value)])
      ));
    } else {
      const defaults: Record<string, string> = {};
      for (const field of FIELDS[modal.resource] ?? []) {
        if (field.key === 'form_type') defaults.form_type = 'EPF_FORM_2';
        if (field.key === 'share_percentage') defaults.share_percentage = '100';
      }
      setForm(defaults);
    }
    setErrors({});
  }

  if (!modal) return null;

  const activeModal = modal;
  const isInterview = activeModal.resource === 'interview';
  const fields = FIELDS[activeModal.resource] ?? [];

  async function submit() {
    setSaving(true);
    const payload: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(form)) {
      if (field === 'id' || field === 'employee_id' || field === 'created_at' || field === 'updated_at') continue;
      payload[field] = value === '' ? null : value;
    }

    const url = isInterview
      ? `${basePath}/employees/${employeeId}`
      : activeModal.row
        ? `${basePath}/employees/${employeeId}/${activeModal.resource}/${activeModal.row.id}`
        : `${basePath}/employees/${employeeId}/${activeModal.resource}`;

    const result = isInterview
      ? await api.put(url, { interview: payload })
      : activeModal.row
        ? await api.put(url, payload)
        : await api.post(url, payload);

    setSaving(false);

    if (result.ok) {
      onSaved(activeModal.label ?? 'Record');
    } else {
      setErrors(fieldErrors(result));
      errorToast('Could not save', result.message);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${activeModal.row || isInterview ? 'Edit' : 'Add'} ${activeModal.label.toLowerCase()}`}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={saving}>Save</Button>
        </>
      }
    >
      {isInterview ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Interview Date" type="date" value={form.interview_date ?? ''} onChange={(e) => setForm((c) => ({ ...c, interview_date: e.target.value }))} />
          <Input label="Interviewer Name" value={form.interviewer_name ?? ''} onChange={(e) => setForm((c) => ({ ...c, interviewer_name: e.target.value }))} />
          <Input label="Position Applied For" value={form.position_applied ?? ''} onChange={(e) => setForm((c) => ({ ...c, position_applied: e.target.value }))} />
          <Select label="Recommendation" value={form.recommendation ?? ''} placeholder="Select"
            onChange={(value) => setForm((c) => ({ ...c, recommendation: value }))}
            options={RECOMMENDATION_OPTIONS} />
          {(['qualification_rating', 'experience_rating', 'communication_rating', 'technical_rating', 'attitude_rating', 'overall_rating'] as const).map((field) => (
            <Select key={field} label={field.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())}
              value={form[field] ?? ''} placeholder="Rate 1–5" clearable
              onChange={(value) => setForm((c) => ({ ...c, [field]: value }))}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))} />
          ))}
          <div className="sm:col-span-2">
            <Textarea label="Remarks" rows={3} value={form.remarks ?? ''} onChange={(e) => setForm((c) => ({ ...c, remarks: e.target.value }))} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key} className={field.span ? 'sm:col-span-2' : undefined}>
              {field.options ? (
                <Select
                  label={field.label} required={field.required} options={field.options}
                  value={form[field.key] ?? ''} searchable={field.options.length > 8}
                  onChange={(value) => setForm((current) => ({ ...current, [field.key]: value }))}
                  error={errors[field.key]}
                />
              ) : (
                <Input
                  label={field.label} requiredMark={field.required} type={field.type ?? 'text'}
                  value={form[field.key] ?? ''} error={errors[field.key]}
                  onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              )}
            </div>
          ))}

          {activeModal.resource === 'documents' && (
            <div className="sm:col-span-2">
              <FileUpload
                label="Scanned copy"
                entityType="EMPLOYEE"
                entityId={employeeId}
                category={form.document_type || 'DOCUMENT'}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                helper="PDF, JPG, PNG or Word up to 25 MB. The file is stored in the encrypted document vault."
                onUploaded={(uploaded) => {
                  const file = uploaded[0];
                  if (!file) return;
                  setForm((current) => ({ ...current, file_id: String(file.id) }));
                }}
              />
              {form.file_id && (
                <p className="mt-2 text-xs text-emerald-600">
                  Scanned copy attached to the record (vault file #{form.file_id}).
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
