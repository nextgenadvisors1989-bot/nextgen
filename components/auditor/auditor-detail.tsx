'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardBody, StatCard } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/ui/table';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button, LinkButton } from '@/components/ui/button';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Rating } from '@/components/ui/rating';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatBytes, formatCurrency, formatNumber, maskAadhaar, maskAccountNumber, truncate } from '@/lib/utils/formatting';
import { downloadCsv, downloadFromApi } from '@/lib/utils/export';
import type { Auditor } from '@/types/auditor';
import type { AuditorDetail } from '@/services/auditor.service';

type RecordRow = Record<string, unknown> & { id: number };

export interface AuditorDetailViewProps {
  detail: AuditorDetail;
  permissions: { update: boolean; remove: boolean; provisionLogin: boolean };
}

/** Auditor profile: workload, assignments, clients, vault documents and portal login. */
export function AuditorDetailView({ detail, permissions }: AuditorDetailViewProps) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const { auditor, stats, assignments, clients, documents, login } = detail;

  const [ratingOpen, setRatingOpen] = useState(false);
  const [rating, setRating] = useState(String(auditor.rating ?? ''));
  const [ratingSaving, setRatingSaving] = useState(false);
  const [ratingErrors, setRatingErrors] = useState<Record<string, string>>({});
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginSaving, setLoginSaving] = useState(false);
  const [credentials, setCredentials] = useState<{ username: string; temporaryPassword: string; email: string } | null>(null);
  const [pendingArchive, setPendingArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategory, setUploadCategory] = useState('Auditor certificate');
  const [uploadSaving, setUploadSaving] = useState(false);

  const completion = (() => {
    const checks = [
      auditor.email, auditor.mobile, auditor.auditor_type_id, auditor.specialization,
      auditor.qualification, auditor.address, auditor.city, auditor.state, auditor.pincode,
      auditor.pan_number, auditor.aadhaar_number, auditor.date_of_joining,
      auditor.bank_account_number, auditor.ifsc_code, auditor.photo,
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  })();

  async function saveRating() {
    setRatingSaving(true);
    setRatingErrors({});
    const result = await api.put(`/api/admin/auditors/${auditor.id}/rating`, { rating: Number(rating) });
    setRatingSaving(false);
    if (result.ok) {
      success('Rating saved', `${auditor.name} is now rated ${rating}/5.`);
      setRatingOpen(false);
      router.refresh();
    } else {
      setRatingErrors(fieldErrors(result));
      errorToast('Could not save rating', result.message);
    }
  }

  async function provisionLogin() {
    setLoginSaving(true);
    const result = await api.post<{ credentials: { username: string; temporaryPassword: string; email: string } }>(
      `/api/admin/auditors/${auditor.id}/login`, {}
    );
    setLoginSaving(false);
    if (result.ok) {
      const created = result.raw as { credentials: { username: string; temporaryPassword: string; email: string } };
      setCredentials(created.credentials);
      success('Portal login created', 'Hand the temporary password over securely — it is also emailed.');
      router.refresh();
    } else {
      errorToast('Could not create portal login', result.message);
    }
  }

  async function archive() {
    setArchiving(true);
    const result = await api.delete(`/api/admin/auditors/${auditor.id}`);
    setArchiving(false);
    if (result.ok) {
      success('Auditor archived', `${auditor.name} was archived.`);
      router.push('/admin/auditors');
    } else {
      errorToast('Could not archive auditor', result.message);
    }
  }

  async function uploadDocument() {
    if (!uploadFile) return;
    setUploadSaving(true);
    const body = new FormData();
    body.append('files', uploadFile);
    body.append('entityType', 'AUDITOR');
    body.append('entityId', String(auditor.id));
    body.append('category', uploadCategory);
    const response = await fetch('/api/files/upload', {
      method: 'POST',
      body,
      headers: { 'X-CSRF-Token': document.cookie.split('cos_csrf=')[1]?.split(';')[0] ?? '' },
    });
    const payload = await response.json();
    setUploadSaving(false);
    if (response.ok && payload.success) {
      success('Document uploaded', `${uploadFile.name} is now held against ${auditor.name}.`);
      setUploadOpen(false);
      setUploadFile(null);
      router.refresh();
    } else {
      errorToast('Could not upload document', payload.message ?? 'Upload failed');
    }
  }

  const assignmentColumns: Column<RecordRow>[] = [
    {
      key: 'assignment',
      header: 'Assignment',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/audit-assignments/${String(row.id)}`} className="font-medium text-brand-600 hover:underline">
            {truncate(String(row.audit_title), 38)}
          </Link>
          <span className="block text-xs text-ink-muted">
            {String(row.assignment_number)} · {String(row.assignment_type)}
          </span>
        </div>
      ),
    },
    { key: 'employer', header: 'Employer', hideOnMobile: true,
      render: (row) => (
        <div className="min-w-0">
          <span className="block text-ink-soft">{truncate(String(row.employer_name ?? '—'), 26)}</span>
          <span className="block text-xs text-ink-muted">{String(row.unit_name ?? 'All units')}</span>
        </div>
      ) },
    { key: 'priority', header: 'Priority', hideOnMobile: true, render: (row) => <Badge tone={priorityTone(String(row.priority))}>{String(row.priority)}</Badge> },
    { key: 'dates', header: 'Schedule', hideOnMobile: true,
      render: (row) => (
        <div className="text-xs text-ink-soft">
          <span className="block">Start {formatDate(row.start_date as string)}</span>
          <span className="block">Due {formatDate(row.due_date as string)}</span>
        </div>
      ) },
    { key: 'progress', header: 'Progress', align: 'center',
      render: (row) => <span className="text-ink-soft">{Number(row.progress_percent ?? 0)}%</span> },
    { key: 'status', header: 'Status', render: (row) => <StatusBadge status={String(row.status)} /> },
  ];

  const clientColumns: Column<RecordRow>[] = [
    { key: 'company', header: 'Employer',
      render: (row) => (
        <div className="min-w-0">
          <Link href={`/admin/employers/${String(row.id)}`} className="font-medium text-brand-600 hover:underline">
            {truncate(String(row.company_name), 34)}
          </Link>
          <span className="block text-xs text-ink-muted">{String(row.employer_code)}</span>
        </div>
      ) },
    { key: 'location', header: 'Location', hideOnMobile: true,
      render: (row) => <span className="text-ink-soft">{[row.city, row.state].filter(Boolean).join(', ') || '—'}</span> },
    { key: 'assignments', header: 'Assignments', align: 'center', render: (row) => <span className="text-ink-soft">{formatNumber(row.assignment_count)}</span> },
    { key: 'completed', header: 'Approved', align: 'center', render: (row) => <span className="text-ink-soft">{formatNumber(row.completed_count)}</span> },
    { key: 'last', header: 'Last assigned', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{formatDate(row.last_assigned_at as string)}</span> },
  ];

  const documentColumns: Column<RecordRow>[] = [
    { key: 'name', header: 'Document',
      render: (row) => (
        <div className="min-w-0">
          <span className="font-medium text-ink">{truncate(String(row.original_name), 40)}</span>
          <span className="block text-xs text-ink-muted">{String(row.category ?? 'Uncategorised')} · v{String(row.version)}</span>
        </div>
      ) },
    { key: 'size', header: 'Size', align: 'right', hideOnMobile: true, render: (row) => <span className="text-ink-soft">{formatBytes(Number(row.size_bytes))}</span> },
    { key: 'uploaded', header: 'Uploaded', hideOnMobile: true,
      render: (row) => (
        <div className="text-xs text-ink-soft">
          <span className="block">{formatDate(row.created_at as string)}</span>
          <span className="block text-ink-muted">{String(row.uploaded_by_name ?? '—')}</span>
        </div>
      ) },
    { key: 'actions', header: 'Actions', width: 120, align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-1">
          <a href={`/api/files/${String(row.id)}/download`} download className="link text-xs">Download</a>
          <a href={`/api/files/${String(row.id)}/download?inline=true`} target="_blank" rel="noreferrer" className="link text-xs">View</a>
        </span>
      ) },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardBody className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            {auditor.photo ? (
              <img src={auditor.photo} alt={auditor.name} className="h-20 w-16 rounded-lg border border-line object-cover" />
            ) : (
              <span className="flex h-20 w-16 items-center justify-center rounded-lg border border-line bg-slate-50 text-lg font-semibold text-ink-muted">
                {auditor.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-ink">{auditor.name}</h2>
                <StatusBadge status={auditor.status} />
                {auditor.rating !== null && auditor.rating !== undefined && (
                  <Badge tone="brand">{Number(auditor.rating).toFixed(1)}/5 rating</Badge>
                )}
                {auditor.user_id ? <Badge tone="success">portal login</Badge> : <Badge tone="slate">no login</Badge>}
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {auditor.auditor_code}
                {auditor.auditor_type_name ? ` · ${auditor.auditor_type_name}` : ''}
                {auditor.role_title ? ` · ${auditor.role_title}` : ''}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                {auditor.email}
                {auditor.mobile ? ` · ${auditor.mobile}` : ''}
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {[auditor.city, auditor.state, auditor.pincode].filter(Boolean).join(', ') || 'Address not recorded'}
                {auditor.specialization ? ` · Specialises in ${auditor.specialization}` : ''}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {permissions.update && (
              <Button variant="outline" size="sm" onClick={() => { setRating(String(auditor.rating ?? '')); setRatingOpen(true); }}>
                Set Rating
              </Button>
            )}
            {permissions.provisionLogin && !auditor.user_id && (
              <Button variant="outline" size="sm" onClick={() => setLoginOpen(true)}>Create Portal Login</Button>
            )}
            {permissions.update && <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>Upload Document</Button>}
            {permissions.update && <LinkButton href={`/admin/auditors/${auditor.id}/edit`} size="sm">Edit</LinkButton>}
            {permissions.remove && (
              <Button variant="danger" size="sm" onClick={() => setPendingArchive(true)}>Archive</Button>
            )}
          </div>
        </CardBody>
      </Card>

      {/* Statistics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Assignments" value={formatNumber(stats.assignments)}
          hint={`${formatNumber(stats.completed)} approved`} tone="brand" />
        <StatCard label="Open Workload" value={`${formatNumber(stats.pending)}/${formatNumber(auditor.max_concurrent_audits)}`}
          hint={stats.pending >= auditor.max_concurrent_audits ? 'At capacity — assign with care' : 'Capacity available'} tone="amber" />
        <StatCard label="Overdue" value={formatNumber(stats.overdue)} hint={stats.overdue ? 'Past the due date' : 'Nothing overdue'} tone={stats.overdue ? 'red' : 'emerald'} />
        <StatCard label="Profile Completeness" value={`${completion}%`}
          hint={`${formatNumber(documents.length)} document(s) · ${stats.reportsSubmitted} report(s) filed`} tone="violet" />
      </div>

      <Tabs
        items={[
          {
            key: 'overview',
            label: 'Overview',
            content: (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card padded={false} className="lg:col-span-2">
                  <CardHeader title="Accreditation & contact" description="Details printed on audit reports" />
                  <CardBody className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                    <Detail label="Auditor code" value={auditor.auditor_code} />
                    <Detail label="Auditor type" value={auditor.auditor_type_name} />
                    <Detail label="Specialisation" value={auditor.specialization} />
                    <Detail label="Role / designation" value={auditor.role_title} />
                    <Detail label="Qualification" value={auditor.qualification} />
                    <Detail label="Experience" value={auditor.experience_years ? `${Number(auditor.experience_years)} years` : null} />
                    <Detail label="Date of joining" value={formatDate(auditor.date_of_joining)} />
                    <Detail label="Preferred employer" value={auditor.employer_name} />
                    <Detail label="Email" value={auditor.email} />
                    <Detail label="Mobile" value={auditor.mobile} />
                    <Detail label="Alternate mobile" value={auditor.alternate_mobile} />
                    <Detail label="Max concurrent audits" value={String(auditor.max_concurrent_audits)} />
                  </CardBody>
                </Card>

                <Card padded={false}>
                  <CardHeader title="Statutory & banking" description="Masked — full values stay with the admin team" />
                  <CardBody className="grid grid-cols-1 gap-x-6 gap-y-4">
                    <Detail label="PAN" value={auditor.pan_number} />
                    <Detail label="Aadhaar" value={auditor.aadhaar_number ? maskAadhaar(auditor.aadhaar_number) : null} />
                    <Detail label="Bank" value={auditor.bank_name} />
                    <Detail label="Account number" value={auditor.bank_account_number ? maskAccountNumber(auditor.bank_account_number) : null} />
                    <Detail label="IFSC" value={auditor.ifsc_code} />
                    <Detail label="Rating" value={auditor.rating ? `${Number(auditor.rating).toFixed(2)} / 5` : 'Not rated'} />
                    <Detail label="Avg. turnaround" value={stats.averageTurnaroundDays ? `${stats.averageTurnaroundDays} days` : null} />
                    <Detail label="Address" value={[auditor.address, auditor.city, auditor.state, auditor.pincode].filter(Boolean).join(', ')} />
                  </CardBody>
                </Card>
              </div>
            ),
          },
          {
            key: 'assignments',
            label: 'Assignments',
            badge: assignments.length,
            content: (
              <Card padded={false}>
                <CardHeader
                  title="Audit assignments"
                  description="Every audit, assessment, risk study or work-permit inspection raised against this auditor."
                  action={
                    <Button variant="outline" size="sm" disabled={assignments.length === 0}
                      onClick={() => downloadCsv(
                        `auditor-${auditor.auditor_code}-assignments.csv`.replace(/[^a-zA-Z0-9._-]/g, '-'),
                        ['Assignment No.', 'Title', 'Type', 'Employer', 'Unit', 'Priority', 'Start', 'Due', 'Progress %', 'Status'],
                        assignments.map((row) => [
                          String(row.assignment_number), String(row.audit_title), String(row.assignment_type),
                          String(row.employer_name ?? ''), String(row.unit_name ?? ''), String(row.priority),
                          String(row.start_date ?? ''), String(row.due_date ?? ''), String(row.progress_percent ?? 0),
                          String(row.status),
                        ])
                      )}>
                      Export CSV
                    </Button>
                  }
                />
                <DataTable<RecordRow>
                  columns={assignmentColumns}
                  data={assignments as unknown as RecordRow[]}
                  rowKey={(row) => row.id}
                  emptyTitle="No assignments yet"
                  emptySubtitle={`${auditor.name} has not been assigned any audit work so far.`}
                />
              </Card>
            ),
          },
          {
            key: 'clients',
            label: 'Employers',
            badge: clients.length,
            content: (
              <Card padded={false}>
                <CardHeader title="Employers audited" description="Grouped from completed and in-flight assignments." />
                <DataTable<RecordRow>
                  columns={clientColumns}
                  data={clients as unknown as RecordRow[]}
                  rowKey={(row) => row.id}
                  emptyTitle="No employer history"
                  emptySubtitle="Once audits are assigned, the employers will be listed here."
                />
              </Card>
            ),
          },
          {
            key: 'documents',
            label: 'Documents',
            badge: documents.length,
            content: (
              <Card padded={false}>
                <CardHeader
                  title="Certificates & proofs"
                  description="Held in the encrypted document vault with version history."
                  action={permissions.update ? <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>Upload Document</Button> : undefined}
                />
                {documents.length === 0 ? (
                  <EmptyState
                    title="No documents on file"
                    subtitle="Upload the auditor's accreditation certificates, licences and identity proofs."
                    action={permissions.update ? <Button size="sm" onClick={() => setUploadOpen(true)}>Upload Document</Button> : undefined}
                  />
                ) : (
                  <DataTable<RecordRow>
                    columns={documentColumns}
                    data={documents as unknown as RecordRow[]}
                    rowKey={(row) => row.id}
                  />
                )}
              </Card>
            ),
          },
          {
            key: 'login',
            label: 'Portal Login',
            badge: login ? 1 : 0,
            content: (
              <Card padded={false}>
                <CardHeader title="Auditor portal login" description="Access to the auditor workspace, assignments and report submission" />
                <CardBody>
                  {login ? (
                    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                      <Detail label="Username" value={login.username} />
                      <Detail label="Email" value={login.email} />
                      <Detail label="Status" value={login.status} />
                      <Detail label="First login pending" value={Number(login.is_first_login) ? 'Yes — password change required' : 'No'} />
                      <Detail label="Last sign-in" value={login.last_login_at ? formatDateTime(login.last_login_at) : 'Never'} />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <p className="text-sm text-ink-soft">
                        {auditor.name} does not have an auditor-portal login yet. Creating one issues a temporary
                        password, emails it with an activation link, and forces a password change at first sign-in.
                      </p>
                      {permissions.provisionLogin && (
                        <Button size="sm" onClick={() => setLoginOpen(true)}>Create Portal Login</Button>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            ),
          },
        ]}
      />

      {/* Rating modal */}
      <Modal
        open={ratingOpen}
        onClose={() => setRatingOpen(false)}
        title={`Rate ${auditor.name}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setRatingOpen(false)}>Cancel</Button>
            <Button onClick={saveRating} loading={ratingSaving}>Save Rating</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Rating value={Number(rating || 0)} onChange={(value) => setRating(String(value))} />
          <Input label="Rating (0–5)" type="number" step="0.25" min={0} max={5} value={rating}
            onChange={(event) => setRating(event.target.value)} error={ratingErrors.rating} />
          <p className="text-xs text-ink-muted">
            Ratings feed assignment planning — auditors at capacity or below target show up in the workload column.
          </p>
        </div>
      </Modal>

      {/* Portal login modal */}
      <Modal
        open={loginOpen}
        onClose={() => { setLoginOpen(false); setCredentials(null); }}
        title={credentials ? 'Portal login created' : `Create portal login for ${auditor.name}`}
        size="md"
        footer={
          credentials
            ? <Button onClick={() => { setLoginOpen(false); setCredentials(null); }}>Done</Button>
            : (
              <>
                <Button variant="outline" onClick={() => setLoginOpen(false)}>Cancel</Button>
                <Button onClick={provisionLogin} loading={loginSaving}>Create Login</Button>
              </>
            )
        }
      >
        {credentials ? (
          <div className="space-y-4">
            <p className="text-sm text-ink-soft">
              The temporary password below is shown once. It has also been emailed to {credentials.email} with an
              activation link.
            </p>
            <div className="rounded-lg border border-line bg-slate-50 p-4">
              <Detail label="Username" value={credentials.username} />
              <Detail label="Temporary password" value={credentials.temporaryPassword} />
              <Detail label="Login URL" value="/login" />
            </div>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">
            A temporary password will be generated and emailed to <strong>{auditor.email}</strong>. The login is
            mapped to the <strong>Auditor</strong> role, so it can only reach the auditor workspace.
          </p>
        )}
      </Modal>

      {/* Document upload modal */}
      <Modal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        title={`Upload document for ${auditor.name}`}
        size="md"
        footer={
          <>
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button onClick={uploadDocument} loading={uploadSaving} disabled={!uploadFile}>Upload</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select label="Category" value={uploadCategory} onChange={setUploadCategory}
            options={['Auditor certificate', 'Licence', 'Identity proof', 'Insurance', 'Agreement', 'Other'].map((value) => ({ value, label: value }))} />
          <div>
            <label className="label" htmlFor="auditor-doc">File</label>
            <input id="auditor-doc" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="block w-full text-sm text-ink-soft file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-ink"
              onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
            <p className="mt-2 text-xs text-ink-muted">PDF, image or Word up to 25 MB. Stored with a SHA-256 checksum.</p>
          </div>
          <Textarea label="Notes" rows={2} value="" onChange={() => undefined} disabled placeholder="Optional description (recorded on the file)" />
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingArchive}
        onClose={() => setPendingArchive(false)}
        onConfirm={archive}
        loading={archiving}
        title="Archive this auditor?"
        message={`${auditor.name} (${auditor.auditor_code}) will be archived and their portal login deactivated. Archive is refused while open assignments exist.`}
        confirmLabel="Archive Auditor"
        variant="danger"
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="block text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="block text-[13px] text-ink">{value && String(value).trim() ? String(value) : '—'}</span>
    </div>
  );
}

function priorityTone(priority: string): 'slate' | 'warning' | 'danger' | 'brand' {
  switch (priority) {
    case 'Urgent': return 'danger';
    case 'High': return 'warning';
    case 'Medium': return 'brand';
    default: return 'slate';
  }
}
