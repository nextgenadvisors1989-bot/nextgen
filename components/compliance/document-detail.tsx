'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/modal';
import { Button, LinkButton } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input, Textarea, Checkbox } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { FileUpload, type UploadedFileMeta } from '@/components/ui/file-upload';
import { useToast } from '@/components/ui/toast';
import { api, fieldErrors } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatCurrency } from '@/lib/utils/formatting';
import { ComplianceActivity, ComplianceBadge, DaysBadge, DetailRow, Prose } from '@/components/compliance/shared';

export interface DocumentDetailRecord {
  id: number;
  uuid: string;
  document_name: string;
  document_type: string;
  employer_id: number;
  company_name?: string;
  unit_id: number | null;
  unit_name?: string | null;
  act_id: number | null;
  act_name?: string | null;
  rule_id: number | null;
  rule_title?: string | null;
  document_number: string | null;
  issuing_authority: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  validity_period_days: number | null;
  remind_days_before: number;
  reminder_sent_at: string | null;
  renewal_responsibility: string | null;
  fee_amount: string | number | null;
  compliance_status: string;
  effective_status?: string;
  days_to_expiry?: number | null;
  file_id: number | null;
  notes: string | null;
  is_verified: boolean | number;
  verified_by: number | null;
  verified_by_name?: string | null;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
  created_by_name?: string | null;
}

/**
 * A compliance document with its whole lifecycle on one page: renewal (new
 * validity, status recomputed, reminders re-armed), verification against the
 * original, the manual expiry reminder, the attached certificate and its history.
 */
export function DocumentDetail({
  document, canUpdate, canDelete, canVerify, canRemind, base = '/api/admin/compliance/documents', employerView = false,
}: {
  document: DocumentDetailRecord;
  canUpdate: boolean;
  canDelete: boolean;
  canVerify: boolean;
  canRemind: boolean;
  /** Route base — the employer panel passes its own scoped endpoints. */
  base?: string;
  employerView?: boolean;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();

  const [renewOpen, setRenewOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [renew, setRenew] = useState({
    issue_date: document.issue_date ?? '',
    expiry_date: '',
    validity_period_days: document.validity_period_days ? String(document.validity_period_days) : '',
    document_number: document.document_number ?? '',
    fee_amount: document.fee_amount ? String(document.fee_amount) : '',
    notes: document.notes ?? '',
  });

  const status = document.effective_status ?? document.compliance_status;

  async function submitRenew() {
    setBusy(true);
    setErrors({});
    const result = await api.post<{ expiryDate: string; complianceStatus: string }>(`${base}/${document.id}/renew`, {
      issue_date: renew.issue_date || null,
      expiry_date: renew.expiry_date || null,
      validity_period_days: renew.validity_period_days ? Number(renew.validity_period_days) : null,
      document_number: renew.document_number.trim() || null,
      fee_amount: renew.fee_amount ? Number(renew.fee_amount) : null,
      notes: renew.notes.trim() || null,
    });
    setBusy(false);
    if (result.ok) {
      success('Renewal recorded', `Now valid to ${result.data?.expiryDate ?? ''} — ${result.data?.complianceStatus ?? ''}.`);
      setRenewOpen(false);
      router.refresh();
      return;
    }
    const mapped = fieldErrors(result);
    setErrors(Object.keys(mapped).length ? mapped : { expiry_date: result.message });
    errorToast('Could not record the renewal', result.message);
  }

  async function submitVerify(isVerified: boolean) {
    setBusy(true);
    const result = await api.post(`${base}/${document.id}/verify`, { is_verified: isVerified });
    setBusy(false);
    setVerifyOpen(false);
    if (result.ok) {
      success(isVerified ? 'Document verified' : 'Verification withdrawn', document.document_name);
      router.refresh();
    } else {
      errorToast('Could not update the verification', result.message);
    }
  }

  async function sendReminder() {
    setBusy(true);
    const result = await api.post<{ emailed: number; notified: number; daysToExpiry: number }>(`${base}/${document.id}/remind`, {});
    setBusy(false);
    if (result.ok) {
      success('Reminder sent', `Emailed ${result.data?.emailed ?? 0} contact(s), notified ${result.data?.notified ?? 0} administrator(s) — ${result.data?.daysToExpiry ?? 0} day(s) to expiry.`);
      router.refresh();
    } else {
      errorToast('Could not send the reminder', result.message);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    const result = await api.delete(`${base}/${document.id}`);
    setBusy(false);
    setDeleteOpen(false);
    if (result.ok) {
      success('Document removed', `${document.document_name} was removed from the legal register.`);
      router.push(employerView ? '/employer/compliance-documents' : '/admin/compliance/documents');
      router.refresh();
    } else {
      errorToast('Could not remove the document', result.message);
    }
  }

  async function onUploaded(files: UploadedFileMeta[]) {
    const file = files[0];
    if (!file) return;
    const result = await api.put(`${base}/${document.id}`, {
      document_name: document.document_name,
      document_type: document.document_type,
      employer_id: document.employer_id,
      unit_id: document.unit_id,
      act_id: document.act_id,
      rule_id: document.rule_id,
      document_number: document.document_number,
      issuing_authority: document.issuing_authority,
      issue_date: document.issue_date,
      expiry_date: document.expiry_date,
      validity_period_days: document.validity_period_days,
      remind_days_before: document.remind_days_before,
      renewal_responsibility: document.renewal_responsibility,
      fee_amount: document.fee_amount,
      notes: document.notes,
      is_verified: Boolean(document.is_verified),
      file_id: file.id,
    });
    if (result.ok) {
      success('Certificate attached', `${file.original_name} is now filed against this document.`);
      router.refresh();
    } else {
      errorToast('Uploaded, but the link could not be saved', result.message);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">{document.document_name}</h1>
              <ComplianceBadge value={status} />
              <Badge tone="default">{document.document_type}</Badge>
              {Boolean(document.is_verified) && <Badge tone="success" dot>Verified</Badge>}
              {document.reminder_sent_at && (
                <Badge tone="info">Reminded {formatDate(document.reminder_sent_at)}</Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              {[
                document.document_number,
                document.company_name,
                document.unit_name,
                document.issuing_authority,
              ].filter(Boolean).join(' · ') || 'No reference details recorded'}
            </p>
            <div className="mt-2 flex items-center gap-2 text-sm text-ink-soft">
              {document.expiry_date ? <>Expires {formatDate(document.expiry_date)}</> : 'No expiry date'}
              <DaysBadge days={document.days_to_expiry ?? null} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canRemind && (
              <Button variant="outline" size="sm" onClick={sendReminder} loading={busy}>Send Expiry Reminder</Button>
            )}
            {canVerify && (
              <Button variant="outline" size="sm" onClick={() => setVerifyOpen(true)}>
                {document.is_verified ? 'Withdraw Verification' : 'Mark Verified'}
              </Button>
            )}
            {canUpdate && (
              <Button size="sm" onClick={() => setRenewOpen(true)}>Record Renewal</Button>
            )}
            {canUpdate && (
              <LinkButton href={`/admin/compliance/documents/${document.id}/edit`} variant="outline" size="sm">Edit</LinkButton>
            )}
            {canDelete && (
              <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>Remove</Button>
            )}
          </div>
        </div>
      </Card>

      <Card padded={false}>
        <Tabs
          defaultTab="details"
          items={[
            {
              key: 'details',
              label: 'Details',
              content: (
                <div className="grid grid-cols-1 gap-6 p-5 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <dl className="divide-y divide-line rounded-lg border border-line px-4">
                      <DetailRow label="Employer">
                        {document.company_name ? (
                          employerView
                            ? document.company_name
                            : <Link href={`/admin/employers/${document.employer_id}`} className="text-brand-600 hover:underline">{document.company_name}</Link>
                        ) : null}
                      </DetailRow>
                      <DetailRow label="Unit">{document.unit_name}</DetailRow>
                      <DetailRow label="Act">
                        {document.act_name
                          ? (employerView
                            ? document.act_name
                            : <Link href={`/admin/compliance/acts/${document.act_id}`} className="text-brand-600 hover:underline">{document.act_name}</Link>)
                          : null}
                      </DetailRow>
                      <DetailRow label="Obligation">
                        {document.rule_title
                          ? (employerView
                            ? document.rule_title
                            : <Link href={`/admin/compliance/rules/${document.rule_id}`} className="text-brand-600 hover:underline">{document.rule_title}</Link>)
                          : null}
                      </DetailRow>
                      <DetailRow label="Document number">{document.document_number}</DetailRow>
                      <DetailRow label="Issuing authority">{document.issuing_authority}</DetailRow>
                      <DetailRow label="Issued on">{document.issue_date ? formatDate(document.issue_date) : null}</DetailRow>
                      <DetailRow label="Expires on">{document.expiry_date ? formatDate(document.expiry_date) : null}</DetailRow>
                      <DetailRow label="Validity period">
                        {document.validity_period_days ? `${document.validity_period_days} days` : null}
                      </DetailRow>
                      <DetailRow label="Reminder lead time">
                        {document.remind_days_before ? `${document.remind_days_before} days before expiry` : null}
                      </DetailRow>
                      <DetailRow label="Renewal responsibility">{document.renewal_responsibility}</DetailRow>
                      <DetailRow label="Fee paid">
                        {document.fee_amount !== null && document.fee_amount !== undefined && document.fee_amount !== ''
                          ? formatCurrency(Number(document.fee_amount))
                          : null}
                      </DetailRow>
                      <DetailRow label="Verification">
                        {document.is_verified
                          ? `Verified by ${document.verified_by_name ?? 'an administrator'}${document.verified_at ? ` on ${formatDateTime(document.verified_at)}` : ''}`
                          : 'Not verified yet'}
                      </DetailRow>
                      <DetailRow label="Last expiry reminder">
                        {document.reminder_sent_at ? formatDateTime(document.reminder_sent_at) : null}
                      </DetailRow>
                      <DetailRow label="Recorded">{formatDateTime(document.created_at)}</DetailRow>
                      <DetailRow label="Last updated">{formatDateTime(document.updated_at)}</DetailRow>
                    </dl>
                    {document.notes && (
                      <div className="mt-4">
                        <h3 className="mb-2 text-sm font-semibold text-ink">Notes</h3>
                        <Prose>{document.notes}</Prose>
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-ink">Certificate</h3>
                    {document.file_id ? (
                      <div className="rounded-lg border border-line p-4">
                        <p className="text-sm text-ink">A scan is filed against this document.</p>
                        <a
                          href={`/api/files/${document.file_id}/download`}
                          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:underline"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
                          </svg>
                          Download the certificate
                        </a>
                      </div>
                    ) : (
                      <p className="mb-3 text-sm text-ink-muted">No scan filed yet.</p>
                    )}
                    {canUpdate && (
                      <div className="mt-3">
                        <FileUpload
                          label={document.file_id ? 'Replace the certificate' : 'Attach the certificate'}
                          entityType="COMPLIANCE_DOCUMENT"
                          entityId={document.id}
                          category="compliance"
                          accept="application/pdf,image/*"
                          helper="PDF or image, up to 25 MB."
                          onUploaded={onUploaded}
                          onError={errorToast}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ),
            },
            {
              key: 'activity',
              label: 'Activity',
              content: (
                <div className="p-5">
                  <ComplianceActivity
                    entityType="compliance_document"
                    entityId={document.id}
                    title="Document history"
                  />
                </div>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
        title="Record a renewal"
        description={`${document.document_name} — the register recomputes the expiry status and re-arms the reminders.`}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setRenewOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={submitRenew} loading={busy}>Record Renewal</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DatePicker label="New issue date" value={renew.issue_date} error={errors.issue_date}
            onChange={(value) => setRenew((current) => ({ ...current, issue_date: value }))} />
          <DatePicker label="New expiry date" value={renew.expiry_date} error={errors.expiry_date}
            helper="Or give a validity period and an issue date"
            onChange={(value) => setRenew((current) => ({ ...current, expiry_date: value }))} />
          <Input label="Validity period (days)" type="number" min={1} max={36500}
            value={renew.validity_period_days} error={errors.validity_period_days}
            onChange={(event) => setRenew((current) => ({ ...current, validity_period_days: event.target.value }))} />
          <Input label="Renewed document number" value={renew.document_number} error={errors.document_number}
            onChange={(event) => setRenew((current) => ({ ...current, document_number: event.target.value }))} />
          <Input label="Renewal fee (₹)" type="number" min={0} step="0.01"
            value={renew.fee_amount} error={errors.fee_amount}
            onChange={(event) => setRenew((current) => ({ ...current, fee_amount: event.target.value }))} />
          <div className="sm:col-span-2">
            <Textarea label="Renewal notes" rows={3} value={renew.notes} error={errors.notes}
              onChange={(event) => setRenew((current) => ({ ...current, notes: event.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title={document.is_verified ? 'Withdraw the verification?' : 'Mark this document verified?'}
        description={document.is_verified
          ? 'The verification stamp is removed. The activity log keeps the record of who verified it and when.'
          : 'Confirms the certificate in the vault matches the original issued by the authority. Your name and the time are recorded.'}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setVerifyOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={() => submitVerify(!document.is_verified)} loading={busy}>
              {document.is_verified ? 'Withdraw Verification' : 'Mark Verified'}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-soft">
          Expiry status is derived from the dates and needs no action; verification records that a person checked the paperwork.
        </p>
      </Modal>

      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Remove this document?"
        description={`${document.document_name} will be removed from the legal register. The attached certificate and the audit trail are retained.`}
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="danger" onClick={confirmDelete} loading={busy}>Remove Document</Button>
          </div>
        }
      >
        <p className="text-sm text-ink-soft">
          Renewals, verification and reminders restart from scratch if the document is recorded again.
        </p>
      </Modal>
    </div>
  );
}
