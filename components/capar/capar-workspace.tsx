'use client';

/**
 * One CAPAR report, for every role.
 *   auditor   writes the facility details and the findings, then submits it
 *   verifier  marks each finding Eligible / Not Eligible and approves the report or returns it
 *   admin     sees everything, can reopen an approved report
 *   employer  reads the approved report and its action plan
 * What each person may do comes from `detail.can`, which the API computes; this screen only shows or hides controls.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { useToast } from '@/components/ui/toast';
import { api, apiFetch, fieldErrors } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { FindingModal } from '@/components/capar/finding-modal';
import { CaparChecklist } from '@/components/capar/capar-checklist';
import { FindingResponse } from '@/components/capar/finding-response';
import { CaparConversation } from '@/components/capar/capar-conversation';
import { SignatureDialog, type SignaturePayload } from '@/components/capar/signature-dialog';
import { CAPAR_STATUS_LABEL, CAPAR_STATUS_TONE, type CaparCategory, type CaparDetail, type CaparFinding, type CaparPanel } from '@/types/capar';

type Draft = Record<string, string>;

const HEADER_FIELDS = [
  'title', 'facility_name', 'facility_address', 'representative_name', 'representative_title', 'audit_date', 'audit_firm',
  'auditor_print_name', 'standard_reference', 'audit_purpose', 'buyer_standards', 'summary_notes', 'closing_meeting_date', 'closing_statement',
  'facility_signatory', 'facility_signed_date',
] as const;

function draftOf(report: CaparDetail['report']): Draft {
  const record = report as unknown as Record<string, unknown>;
  return Object.fromEntries(HEADER_FIELDS.map((key) => [key, record[key] === null || record[key] === undefined ? '' : String(record[key])]));
}

export function CaparWorkspace({ reportId, panel }: { reportId: number; panel: CaparPanel }) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [detail, setDetail] = useState<CaparDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [findingModal, setFindingModal] = useState<{ open: boolean; finding: CaparFinding | null; categoryId: number | null }>({ open: false, finding: null, categoryId: null });
  const [removing, setRemoving] = useState<CaparFinding | null>(null);
  const [confirm, setConfirm] = useState<null | 'submit' | 'delete' | 'reopen' | 'approve'>(null);
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnComments, setReturnComments] = useState('');
  const [othersNote, setOthersNote] = useState('');
  const [chatOpen, setChatOpen] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(async () => {
    const result = await api.get<CaparDetail>(`/api/capar/${reportId}`);
    if (!result.ok || !result.data || !('report' in result.data)) {
      setLoadError(result.message || 'The report could not be opened');
      return;
    }
    setLoadError(null);
    setDetail(result.data);
    setDraft(draftOf(result.data.report));
    setOthersNote(result.data.report.others_note ?? '');
  }, [reportId]);

  useEffect(() => { void load(); }, [load]);
  // The list links here with ?chat=1 to open the conversation straight away.
  useEffect(() => { if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('chat') === '1') setChatOpen(true); }, []);

  const canEdit = detail?.can.edit ?? false;

  const original = useMemo(() => (detail ? draftOf(detail.report) : {}), [detail]);
  const dirtyKeys = useMemo(() => HEADER_FIELDS.filter((key) => (draft[key] ?? '') !== (original[key] ?? '')), [draft, original]);

  const groups = useMemo(() => {
    if (!detail) return [] as { category: CaparCategory | null; findings: CaparFinding[] }[];
    // Rows tied to a checklist document are shown in the checklist; these are the rows typed in under a category.
    const free = detail.findings.filter((finding) => !finding.evidence_item_id);
    const known = new Map(detail.categories.map((category) => [category.id, category]));
    const result: { category: CaparCategory | null; findings: CaparFinding[] }[] = detail.categories.map((category) => ({
      category,
      findings: free.filter((finding) => finding.category_id === category.id),
    }));
    // A finding filed under a heading the admin has since switched off keeps showing, under its old name.
    const orphanNames = new Map<number, string>();
    free.forEach((finding) => {
      if (finding.category_id && !known.has(finding.category_id)) orphanNames.set(finding.category_id, finding.category_name ?? 'Other');
    });
    orphanNames.forEach((name, id) => {
      result.push({ category: { id, name, description: null, sort_order: 9999, status: 'inactive' }, findings: free.filter((finding) => finding.category_id === id) });
    });
    const loose = free.filter((finding) => !finding.category_id);
    if (loose.length) result.push({ category: null, findings: loose });
    return result;
  }, [detail]);

  if (loadError) {
    return <Card><CardBody><EmptyState title="This report cannot be opened" subtitle={loadError} /></CardBody></Card>;
  }
  if (!detail) {
    return <Card><CardBody><p className="py-10 text-center text-sm text-ink-muted">Opening the report...</p></CardBody></Card>;
  }

  const { report, can, events, branding } = detail;
  // Details that come from the administrator records are shown, not typed (see lockedFields in the service).
  const locked = new Set(detail.locked ?? []);
  const set = (key: string) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));
  const violations = detail.findings.filter((finding) => finding.outcome === 'Violation');
  const verifiedCount = detail.findings.filter((finding) => finding.verification_status !== 'Pending').length;
  const isAuditorView = panel === 'auditor' || panel === 'admin';
  const reportGroups = detail.groups ?? [];
  const pickedIds = reportGroups.filter((group) => group.selected).map((group) => group.id);

  async function toggleGroup(id: number) {
    const next = pickedIds.includes(id) ? pickedIds.filter((entry) => entry !== id) : [...pickedIds, id];
    setDetail((current) => (current ? { ...current, groups: current.groups.map((group) => (group.id === id ? { ...group, selected: next.includes(id) } : group)) } : current));
    const result = await api.patch(`/api/capar/${reportId}`, { group_ids: next });
    if (!result.ok) errorToast('Could not save the categories', result.message);
    await load();
  }

  const othersOn = Boolean(Number(report.others_selected));
  // What needs this person: the employer's issues still to answer, or the answers waiting for the auditor.
  const waiting = detail.findings.filter((finding) => finding.outcome === 'Violation' && (panel === 'employer' ? ['Pending', 'Declined'].includes(finding.response_status) : finding.response_status === 'Employer Submitted')).length;

  async function toggleOthers() {
    const result = await api.patch(`/api/capar/${reportId}`, { others_selected: !othersOn });
    if (!result.ok) errorToast('Could not save', result.message);
    await load();
  }

  async function saveOthersNote() {
    if ((report.others_note ?? '') === othersNote.trim()) return;
    const result = await api.patch(`/api/capar/${reportId}`, { others_note: othersNote.trim() || null });
    if (!result.ok) errorToast('Could not save', result.message);
    await load();
  }

  async function submitSigned(signature: SignaturePayload) {
    setWorking(true);
    const result = await api.post(`/api/capar/${reportId}/submit`, signature);
    setWorking(false);
    setConfirm(null);
    if (result.ok) { success('Report signed and sent to the employer'); await load(); }
    else { setErrors(fieldErrors(result)); errorToast('Cannot submit yet', result.message); }
  }

  async function saveDetails() {
    setSaving(true);
    setErrors({});
    const body: Record<string, string | null> = {};
    dirtyKeys.forEach((key) => { body[key] = draft[key] === '' ? null : draft[key]; });
    const result = await api.patch(`/api/capar/${reportId}`, body);
    setSaving(false);
    if (!result.ok) {
      setErrors(fieldErrors(result));
      errorToast('Could not save', result.message);
      return;
    }
    success('Report saved');
    await load();
  }

  async function run(action: () => Promise<{ ok: boolean; message: string }>, done: string, after?: () => void): Promise<void> {
    setWorking(true);
    const result = await action();
    setWorking(false);
    setConfirm(null);
    if (!result.ok) {
      errorToast('Could not complete that', result.message);
      return;
    }
    success(done);
    if (after) after(); else await load();
  }

  async function uploadBranding(kind: 'logo' | 'letterhead', file: File | undefined) {
    if (!file) return;
    const body = new FormData();
    body.append('kind', kind);
    body.append('file', file);
    const result = await apiFetch(`/api/capar/${reportId}/branding`, { method: 'POST', body });
    if (result.ok) { success(kind === 'logo' ? 'Logo updated' : 'Letterhead updated'); await load(); } else errorToast('Could not upload', result.message);
  }

  async function clearBranding(kind: 'logo' | 'letterhead') {
    const result = await api.delete(`/api/capar/${reportId}/branding?kind=${kind}`);
    if (result.ok) { success('Back to the company default'); await load(); } else errorToast('Could not remove', result.message);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
      <aside className="rounded-xl border border-line bg-white p-4 lg:sticky lg:top-24 lg:z-10" aria-label="Categories">
        <h2 className="text-sm font-semibold text-ink">Categories audited</h2>
        <p className="mt-1 text-xs text-ink-muted">{canEdit ? 'Tick what you are auditing. Only ticked categories are in the report.' : 'The categories covered by this report.'}</p>
        <ul className="mt-3 space-y-1">
          {reportGroups.map((group) => (
            <li key={group.id}>
              <label className={`flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm ${canEdit ? 'cursor-pointer hover:bg-surface-muted' : ''}`}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-line" checked={group.selected} disabled={!canEdit} onChange={() => void toggleGroup(group.id)} />
                <span className={group.selected ? 'font-medium text-ink' : 'text-ink-soft'}>{group.name}</span>
              </label>
            </li>
          ))}
          <li>
            <label className={`flex items-start gap-2.5 rounded-lg px-2 py-2 text-sm ${canEdit ? 'cursor-pointer hover:bg-surface-muted' : ''}`}>
              <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-line" checked={othersOn} disabled={!canEdit} onChange={() => void toggleOthers()} />
              <span className={othersOn ? 'font-medium text-ink' : 'text-ink-soft'}>Others</span>
            </label>
            {othersOn && (canEdit ? (
              <input
                value={othersNote}
                onChange={(event) => setOthersNote(event.target.value)}
                onBlur={() => void saveOthersNote()}
                placeholder="Write what you are auditing"
                maxLength={255}
                aria-label="Others: what is being audited"
                className="focus-ring ml-6 mt-1 w-[calc(100%-1.5rem)] rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm text-ink placeholder:text-slate-400"
              />
            ) : report.others_note ? <p className="ml-6 mt-1 text-xs text-ink-muted">{report.others_note}</p> : null)}
          </li>
        </ul>
        {canEdit && <p className="mt-3 text-xs text-ink-muted">{pickedIds.length + (othersOn ? 1 : 0)} of {reportGroups.length + 1} ticked</p>}
      </aside>

      <div className="min-w-0 space-y-6">
      {/* ── header ── */}
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={CAPAR_STATUS_TONE[report.status] ?? 'slate'}>{CAPAR_STATUS_LABEL[report.status] ?? report.status}</Badge>
                <span className="font-mono text-xs text-ink-muted">{report.report_number}</span>
                {report.revision_count > 0 && <Badge tone="slate">Revision {report.revision_count}</Badge>}
              </div>
              <h2 className="mt-2 text-xl font-semibold text-ink">{report.title}</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {report.employer_name}{report.unit_name ? ` · ${report.unit_name}` : ''}
                {report.assignment_number ? ` · ${report.assignment_number}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {report.status !== 'Draft' && detail.findings.some((finding) => finding.outcome === 'Violation') && (
                <Button size="sm" onClick={() => setChatOpen(true)}>
                  Messages &amp; answers
                  {waiting > 0 && <span className="ml-2 rounded-full bg-white/25 px-1.5 text-xs font-semibold">{waiting}</span>}
                </Button>
              )}
              {can.download && (
                <a className="btn btn-outline btn-sm" href={`/api/pdf/capar/${report.id}`} target="_blank" rel="noreferrer">Generate &amp; download report</a>
              )}
              {can.delete && <Button size="sm" variant="outline" onClick={() => setConfirm('delete')}>Delete draft</Button>}
              {can.reopen && <Button size="sm" variant="outline" onClick={() => setConfirm('reopen')}>Reopen for correction</Button>}
              {can.submit && <Button size="sm" onClick={() => setConfirm('submit')}>Sign &amp; submit</Button>}
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-line pt-4 text-sm sm:grid-cols-4">
            <Meta label="Auditor" value={report.auditor_name} />
            <Meta label="Audit" value={report.audit_type_name ? report.audit_type_name.replace(/ - .*| \(.*/, '') : '-'} />
            <Meta label="Audit date" value={report.audit_date ? formatDate(report.audit_date) : '-'} />
            <Meta label="Findings" value={`${violations.length} violation${violations.length === 1 ? '' : 's'} of ${detail.findings.length} row${detail.findings.length === 1 ? '' : 's'}`} />
          </dl>
        </CardBody>
      </Card>

      {report.status === 'Returned' && report.review_comments && panel !== 'employer' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="status">
          <p className="text-sm font-semibold text-amber-900">Returned by the verifier</p>
          <p className="mt-1 whitespace-pre-line text-sm text-amber-900">{report.review_comments}</p>
        </div>
      )}

      {/* ── facility and audit details ── */}
      <Card padded={false}>
        <CardHeader
          title="Facility and audit details"
          description={canEdit ? 'Locked details come from the records the administrator keeps. You fill in the representative, standard and notes.' : undefined}
          action={canEdit && dirtyKeys.length > 0 ? <Button size="sm" onClick={saveDetails} loading={saving}>Save details</Button> : undefined}
        />
        <CardBody>
          {canEdit ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2"><Input label="Report title" value={draft.title} onChange={(e) => set('title')(e.target.value)} error={errors.title} /></div>
              {locked.has('facility_name') ? <Fixed label="Facility" value={report.facility_name} /> : <Input label="Facility" value={draft.facility_name} onChange={(e) => set('facility_name')(e.target.value)} error={errors.facility_name} />}
              {locked.has('audit_date') ? <Fixed label="Audit date" value={report.audit_date ? formatDate(report.audit_date) : '-'} /> : <DatePicker label="Audit date" value={draft.audit_date} onChange={set('audit_date')} error={errors.audit_date} />}
              <div className="md:col-span-2">
                {locked.has('facility_address') ? <Fixed label="Facility address" value={report.facility_address ?? '-'} /> : <Textarea label="Facility address" rows={2} value={draft.facility_address} onChange={(e) => set('facility_address')(e.target.value)} />}
              </div>
              <Input label="Facility representative" value={draft.representative_name} onChange={(e) => set('representative_name')(e.target.value)} />
              <Input label="Representative title" value={draft.representative_title} onChange={(e) => set('representative_title')(e.target.value)} />
              {locked.has('audit_firm') ? <Fixed label="Audit firm" value={report.audit_firm ?? '-'} /> : <Input label="Audit firm" value={draft.audit_firm} onChange={(e) => set('audit_firm')(e.target.value)} />}
              {locked.has('auditor_print_name') ? <Fixed label="Auditor name (as printed)" value={report.auditor_print_name ?? report.auditor_name} /> : <Input label="Auditor name (as printed)" value={draft.auditor_print_name} onChange={(e) => set('auditor_print_name')(e.target.value)} />}
              <Input label="Standard / reference" value={draft.standard_reference} onChange={(e) => set('standard_reference')(e.target.value)} placeholder="e.g. H&M MR Standards" />
              <div className="md:col-span-2"><Fixed label="Audit or assessment" value={report.audit_type_name ?? '-'} /></div>
              {(report.audit_type_name ?? '').startsWith('International Buyer') && <div className="md:col-span-2"><Input label="Buyer standards" value={draft.buyer_standards} onChange={(e) => set('buyer_standards')(e.target.value)} placeholder="e.g. BSCI, SEDEX, SA8000" /></div>}
              <div className="md:col-span-2"><Textarea label="Purpose of the audit" rows={2} value={draft.audit_purpose} onChange={(e) => set('audit_purpose')(e.target.value)} placeholder="Why is this audit being done?" error={errors.audit_purpose} /></div>
              <div className="md:col-span-2"><Textarea label="Summary notes (optional)" rows={2} value={draft.summary_notes} onChange={(e) => set('summary_notes')(e.target.value)} /></div>
            </div>
          ) : (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm md:grid-cols-2">
              <Meta label="Facility" value={report.facility_name} />
              <Meta label="Audit date" value={report.audit_date ? formatDate(report.audit_date) : '-'} />
              <Meta label="Facility address" value={report.facility_address ?? '-'} wide />
              <Meta label="Facility representative" value={[report.representative_name, report.representative_title].filter(Boolean).join(', ') || '-'} />
              <Meta label="Audit firm" value={report.audit_firm ?? '-'} />
              <Meta label="Auditor" value={report.auditor_print_name ?? report.auditor_name} />
              <Meta label="Audit or assessment" value={report.audit_type_name ?? '-'} />
              {report.buyer_standards && <Meta label="Buyer standards" value={report.buyer_standards} />}
              {report.audit_purpose && <Meta label="Purpose of the audit" value={report.audit_purpose} wide />}
              <Meta label="Standard / reference" value={report.standard_reference ?? '-'} />
              {report.summary_notes && <Meta label="Summary" value={report.summary_notes} wide />}
            </dl>
          )}

          {canEdit && panel === 'admin' && (
            <div className="mt-6 grid grid-cols-1 gap-4 border-t border-line pt-4 md:grid-cols-2">
              <BrandingControl label="Logo on this report" url={branding.logoUrl} onUpload={(file) => uploadBranding('logo', file)} onClear={() => clearBranding('logo')} />
              <BrandingControl label="Letterhead on this report" url={branding.letterheadUrl} onUpload={(file) => uploadBranding('letterhead', file)} onClear={() => clearBranding('letterhead')} />
              <p className="text-xs text-ink-muted md:col-span-2">Without an upload here, the report uses the logo and letterhead saved in Company Settings.</p>
            </div>
          )}
        </CardBody>
      </Card>

      {/* ── checklist: the sheet's section / document rows ── */}
      <CaparChecklist
        reportId={reportId}
        checklist={detail.checklist ?? []}
        pickedIds={pickedIds}
        findings={detail.findings}
        categories={detail.categories}
        canEdit={canEdit}
        sent={report.status !== 'Draft'}
        canReview={can.review}
        onChanged={load}
        onRemove={(finding) => setRemoving(finding)}
        renderRow={(finding) => (
          <FindingCard
            finding={finding}
            index={1}
            canEdit={false}
            canVerify={can.verify}
            reportId={reportId}
            onEdit={() => undefined}
            onRemove={() => undefined}
            onChanged={load}
            response={report.status !== 'Draft' ? { role: panel, can: { respond: can.respond, review: can.review, message: can.message }, employerName: undefined } : null}
          />
        )}
      />

      {/* ── findings typed in under a category ── */}
      {(othersOn || detail.findings.some((finding) => !finding.evidence_item_id)) && (
      <section className="space-y-4" aria-label="Other findings">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-ink">Other findings</h2>
            <p className="text-sm text-ink-muted">
              {can.verify ? 'Mark each finding Eligible or Not Eligible. Only eligible findings go into the final report.' : 'Rows that do not belong to a checklist document, grouped by category.'}
            </p>
          </div>
          {canEdit && <Button size="sm" variant="outline" onClick={() => setFindingModal({ open: true, finding: null, categoryId: null })}>+ Add other finding</Button>}
        </div>

        {errors.findings && <p className="text-sm text-red-600">{errors.findings}</p>}

        {groups.map(({ category, findings }) => {
          if (!findings.length) return null;
          return (
            <Card key={category?.id ?? 'loose'} padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-muted px-4 py-3">
                <h3 className="text-sm font-semibold text-ink">
                  {category?.name ?? 'Not categorised'}
                  <span className="ml-2 text-xs font-normal text-ink-muted">{findings.length ? `${findings.length} row${findings.length === 1 ? '' : 's'}` : 'No Violation'}</span>
                </h3>
                {canEdit && category && (
                  <button type="button" onClick={() => setFindingModal({ open: true, finding: null, categoryId: category.id })} className="text-xs font-semibold text-brand-600 hover:underline">
                    + Add finding
                  </button>
                )}
              </div>
              {findings.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-muted">Nothing recorded under this heading.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {findings.map((finding, index) => (
                    <FindingCard
                      key={finding.id}
                      finding={finding}
                      index={index + 1}
                      canEdit={canEdit}
                      canVerify={can.verify}
                      reportId={reportId}
                      onEdit={() => setFindingModal({ open: true, finding, categoryId: finding.category_id })}
                      onRemove={() => setRemoving(finding)}
                      onChanged={load}
                      response={report.status !== 'Draft' ? { role: panel, can: { respond: can.respond, review: can.review, message: can.message }, employerName: undefined } : null}
                    />
                  ))}
                </ul>
              )}
            </Card>
          );
        })}

        {detail.findings.length === 0 && !canEdit && (
          <Card><CardBody><EmptyState title="No findings recorded" subtitle="Every category printed as No Violation." /></CardBody></Card>
        )}
      </section>
      )}

      {/* ── closing meeting and sign-off ── */}
      {(canEdit || report.closing_statement || report.closing_meeting_date || report.facility_signatory) && (
        <Card padded={false}>
          <CardHeader
            title="Closing meeting and sign-off"
            action={canEdit && dirtyKeys.length > 0 ? <Button size="sm" onClick={saveDetails} loading={saving}>Save details</Button> : undefined}
          />
          <CardBody>
            {canEdit ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <DatePicker label="Closing meeting date" value={draft.closing_meeting_date} onChange={set('closing_meeting_date')} />
                <Input label="Facility signatory" value={draft.facility_signatory} onChange={(e) => set('facility_signatory')(e.target.value)} placeholder="Name of the person signing for the facility" />
                <div className="md:col-span-2">
                  <Textarea label="Closing statement" rows={2} value={draft.closing_statement} onChange={(e) => set('closing_statement')(e.target.value)} placeholder="A closing meeting has been performed, and the above findings were discussed and were agreed." />
                </div>
                <DatePicker label="Facility signed on" value={draft.facility_signed_date} onChange={set('facility_signed_date')} />
              </div>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm md:grid-cols-2">
                <Meta label="Closing meeting" value={report.closing_meeting_date ? formatDate(report.closing_meeting_date) : '-'} />
                <Meta label="Facility signatory" value={report.facility_signatory ?? '-'} />
                <Meta label="Closing statement" value={report.closing_statement ?? '-'} wide />
                <Meta label="Facility signed on" value={report.facility_signed_date ? formatDate(report.facility_signed_date) : '-'} />
              </dl>
            )}
          </CardBody>
        </Card>
      )}

      {/* ── review history ── */}
      {events.length > 0 && (
        <Card padded={false}>
          <CardHeader title="Review history" />
          <CardBody>
            <ol className="space-y-3">
              {events.map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                  <div>
                    <p className="text-ink">
                      <strong>{event.action}</strong> by {event.actor_name ?? 'the system'}
                      <span className="ml-2 text-xs text-ink-muted">{formatDateTime(event.created_at)}</span>
                    </p>
                    {event.comments && <p className="mt-0.5 whitespace-pre-line text-ink-soft">{event.comments}</p>}
                  </div>
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      )}

      {/* ── verifier decision bar ── */}
      {can.decide && (
        <div className="sticky bottom-0 z-20 -mx-4 border-t border-line bg-white/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">
              <strong>{verifiedCount}</strong> of {detail.findings.length} finding{detail.findings.length === 1 ? '' : 's'} verified
              {verifiedCount < detail.findings.length && <span className="text-amber-700"> · mark the rest before approving</span>}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setReturnComments(''); setReturnOpen(true); }}>Return to auditor</Button>
              <Button variant="success" onClick={() => setConfirm('approve')} disabled={verifiedCount < detail.findings.length}>Approve report</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── dialogs ── */}
      {canEdit && (
        <FindingModal
          open={findingModal.open}
          onClose={() => setFindingModal((current) => ({ ...current, open: false }))}
          reportId={reportId}
          categories={detail.categories}
          finding={findingModal.finding}
          defaultCategoryId={findingModal.categoryId}
          onSaved={load}
        />
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this finding?"
        message="The row, with its photos and evidence, is removed from the report."
        confirmLabel="Remove"
        loading={working}
        onConfirm={async () => {
          if (!removing) return;
          setWorking(true);
          const result = await api.delete(`/api/capar/${reportId}/findings/${removing.id}`);
          setWorking(false);
          setRemoving(null);
          if (result.ok) { success('Finding removed'); await load(); } else errorToast('Could not remove it', result.message);
        }}
      />
      <CaparConversation
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        reportId={reportId}
        reportNumber={report.report_number}
        role={panel}
        findings={detail.findings}
        can={{ respond: can.respond, review: can.review, message: can.message }}
        onChanged={load}
      />

      <SignatureDialog
        open={confirm === 'submit'}
        onClose={() => setConfirm(null)}
        title="Sign and submit the report"
        description="The employer is told straight away and can then answer each finding. Your signature goes at the end of the report."
        confirmLabel="Sign & submit"
        loading={working}
        defaultName={report.auditor_print_name ?? report.auditor_name}
        onSign={(signature) => void submitSigned(signature)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        onClose={() => setConfirm(null)}
        title="Delete this draft?"
        message="The draft and everything in it is deleted."
        confirmLabel="Delete"
        loading={working}
        onConfirm={() => run(() => api.delete(`/api/capar/${reportId}`), 'Draft deleted', () => router.push(`/${panel}/capar`))}
      />
      <ConfirmDialog
        open={confirm === 'reopen'}
        onClose={() => setConfirm(null)}
        variant="warning"
        title="Reopen this approved report?"
        message="It goes back to the auditor for correction and has to be verified again."
        confirmLabel="Reopen"
        loading={working}
        onConfirm={() => run(() => api.post(`/api/capar/${reportId}/reopen`, {}), 'Report reopened')}
      />
      <ConfirmDialog
        open={confirm === 'approve'}
        onClose={() => setConfirm(null)}
        variant="primary"
        title="Approve this report?"
        message="It becomes final and the employer can see it. Findings marked Not Eligible are left out."
        confirmLabel="Approve"
        loading={working}
        onConfirm={() => run(() => api.post(`/api/capar/${reportId}/decision`, { decision: 'approve' }), 'Report approved')}
      />
      <Modal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        title="Return to the auditor"
        description="Tell the auditor what to correct. The comments are shown at the top of the report."
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReturnOpen(false)}>Cancel</Button>
            <Button
              variant="warning"
              loading={working}
              disabled={returnComments.trim().length < 5}
              onClick={async () => {
                setWorking(true);
                const result = await api.post(`/api/capar/${reportId}/decision`, { decision: 'return', comments: returnComments });
                setWorking(false);
                if (result.ok) { setReturnOpen(false); success('Returned to the auditor'); await load(); } else errorToast('Could not return it', result.message);
              }}
            >
              Return report
            </Button>
          </div>
        }
      >
        <Textarea label="Comments" rows={5} value={returnComments} onChange={(event) => setReturnComments(event.target.value)} placeholder="e.g. Add the photo for finding 1 and re-check the exit count." />
      </Modal>

      {isAuditorView && panel === 'admin' && (
        <p className="text-xs text-ink-muted"><Link href="/admin/capar/management" className="text-brand-600 hover:underline">CAPAR Management</Link> places each document under a category.</p>
      )}
      </div>
    </div>
  );
}

/* ───────────────────────────── pieces ───────────────────────────── */

/** A detail that is shown but cannot be changed here. */
function Fixed({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <p className="flex min-h-[2.5rem] items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm text-ink">
        <svg className="h-3.5 w-3.5 shrink-0 text-ink-muted" viewBox="0 0 20 20" fill="currentColor" aria-label="Locked"><path fillRule="evenodd" d="M10 1a4 4 0 00-4 4v2H5a2 2 0 00-2 2v7a2 2 0 002 2h10a2 2 0 002-2V9a2 2 0 00-2-2h-1V5a4 4 0 00-4-4zm2 6V5a2 2 0 10-4 0v2h4z" clipRule="evenodd" /></svg>
        <span className="whitespace-pre-line">{value}</span>
      </p>
    </div>
  );
}

function Meta({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? 'md:col-span-2' : undefined}>
      <dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-ink">{value}</dd>
    </div>
  );
}

function BrandingControl({ label, url, onUpload, onClear }: { label: string; url: string | null; onUpload: (file: File | undefined) => void; onClear: () => void }) {
  const id = `brand-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-24 items-center justify-center overflow-hidden rounded-lg border border-line bg-surface-muted text-[11px] text-ink-muted">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
          ) : 'Company default'}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="btn btn-outline btn-sm cursor-pointer">{url ? 'Replace' : 'Upload'}</label>
          <input id={id} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(event) => { onUpload(event.target.files?.[0]); event.target.value = ''; }} />
          {url && <button type="button" onClick={onClear} className="text-xs font-semibold text-red-600 hover:underline">Use default</button>}
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding, index, canEdit, canVerify, reportId, onEdit, onRemove, onChanged, response }: {
  /** Set once the report has been sent: the employer's answer and the reply thread are shown under the finding. */
  response?: { role: string; can: { respond: boolean; review: boolean; message: boolean }; employerName?: string } | null;
  finding: CaparFinding;
  index: number;
  canEdit: boolean;
  canVerify: boolean;
  reportId: number;
  onEdit: () => void;
  onRemove: () => void;
  onChanged: () => void;
}) {
  const photos = finding.files.filter((file) => file.kind === 'Photo');
  const evidence = finding.files.filter((file) => file.kind === 'Evidence');
  const violation = finding.outcome === 'Violation';

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">
            <span className="mr-2 text-ink-muted">{index}.</span>
            {finding.act_rule || 'Act / Rule not stated'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge tone={finding.item_status === 'Verified' ? 'success' : finding.item_status === 'Not findings' ? 'info' : 'warning'}>{finding.item_status}</Badge>
            <Badge tone={violation ? 'danger' : 'success'}>{finding.outcome}</Badge>
            {finding.resource_id && (
              <a
                href={finding.resource_file_id ? `/api/files/${finding.resource_file_id}/download` : finding.resource_external_url ?? '#'}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                View Act PDF{finding.resource_title ? `: ${finding.resource_title}` : ''}
              </a>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={onEdit}>Edit</Button>
            <Button size="sm" variant="ghost" onClick={onRemove} aria-label={`Remove finding ${index}`}>Remove</Button>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
        <div className="space-y-3 text-sm">
          <Field label="Minimum requirement" value={finding.minimum_requirement} />
          {finding.local_law && (
            <details className="group">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-muted marker:content-none">
                Local law <span className="ml-1 text-brand-600 group-open:hidden">show</span><span className="ml-1 hidden text-brand-600 group-open:inline">hide</span>
              </summary>
              <p className="mt-1 whitespace-pre-line text-ink-soft">{finding.local_law}</p>
            </details>
          )}
          <Field label={violation ? 'Finding' : 'Remarks'} value={finding.finding} />
          {photos.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Non-compliance photo</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {photos.map((file) => (
                  <li key={file.link_id}>
                    <a href={file.url} target="_blank" rel="noreferrer" title={file.caption ?? file.original_name}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={file.url} alt={file.caption ?? file.original_name} className="h-20 w-28 rounded-lg border border-line object-cover" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {violation && (
          <div className="space-y-3 text-sm">
            <Field label="Root cause" value={finding.root_cause} />
            <Field label="Action plan" value={finding.action_plan} />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Timeline</p>
                <p className="text-ink">
                  {finding.timeline_date ? formatDate(finding.timeline_date) : 'Not set'}
                  {finding.timeline_note ? <span className="text-ink-muted"> · {finding.timeline_note}</span> : null}
                </p>
              </div>
              <Badge tone={finding.action_status === 'Closed' ? 'success' : finding.action_status === 'In Progress' ? 'info' : 'warning'}>
                {finding.action_status}{finding.action_status === 'Closed' && finding.closed_on ? ` ${formatDate(finding.closed_on)}` : ''}
              </Badge>
            </div>
            <Field label="Compliance" value={finding.compliance_note} />
            {evidence.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Compliance evidence</p>
                <ul className="mt-1 space-y-0.5">
                  {evidence.map((file) => (
                    <li key={file.link_id}><a href={file.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{file.original_name}</a></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {(finding.recommendation || finding.assessment || finding.signed_by) && (
        <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 text-sm lg:grid-cols-2">
          <Field label="Recommendations" value={finding.recommendation} />
          <Field label="Verification / Assessment" value={finding.assessment} />
          {finding.signed_by && (
            <p className="text-xs text-ink-muted lg:col-span-2">
              Signed off by <strong className="text-ink">{finding.signed_by}</strong>{finding.signed_at ? ` on ${formatDateTime(finding.signed_at)}` : ''}
            </p>
          )}
        </div>
      )}

      {(finding.verification_remark || canVerify) && (
        <div className="mt-4 rounded-lg bg-surface-muted p-3">
          {canVerify ? (
            <VerifyControl finding={finding} reportId={reportId} onChanged={onChanged} />
          ) : (
            <p className="text-sm text-ink-soft">
              <strong>{finding.verification_status}</strong>{finding.verified_by_name ? ` by ${finding.verified_by_name}` : ''}
              {finding.verification_remark ? `: ${finding.verification_remark}` : ''}
            </p>
          )}
        </div>
      )}
      {response && violation && (
        <FindingResponse reportId={reportId} finding={finding} role={response.role} can={response.can} employerName={response.employerName} onChanged={onChanged} />
      )}
    </li>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
      <p className="mt-0.5 whitespace-pre-line text-ink">{value}</p>
    </div>
  );
}

function VerifyControl({ finding, reportId, onChanged }: { finding: CaparFinding; reportId: number; onChanged: () => void }) {
  const { success, error: errorToast } = useToast();
  const [status, setStatus] = useState<CaparFinding['verification_status']>(finding.verification_status);
  const [remark, setRemark] = useState(finding.verification_remark ?? '');
  const [saving, setSaving] = useState(false);
  const changed = status !== finding.verification_status || remark.trim() !== (finding.verification_remark ?? '').trim();

  async function save() {
    setSaving(true);
    const result = await api.post(`/api/capar/${reportId}/findings/${finding.id}/verify`, { verification_status: status, verification_remark: remark });
    setSaving(false);
    if (result.ok) { success('Verification saved'); onChanged(); } else errorToast('Could not save', result.message);
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
      <div>
        <span className="label">Verification</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-line bg-white" role="radiogroup" aria-label="Verification">
          {(['Eligible', 'Not Eligible', 'Pending'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={status === value}
              onClick={() => setStatus(value)}
              className={`h-9 px-3 text-sm font-medium transition-colors ${
                status === value
                  ? value === 'Eligible' ? 'bg-emerald-600 text-white' : value === 'Not Eligible' ? 'bg-red-600 text-white' : 'bg-slate-600 text-white'
                  : 'text-ink-soft hover:bg-surface-muted'
              }`}
            >
              {value === 'Pending' ? 'Not yet' : value}
            </button>
          ))}
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <Input
          label={status === 'Not Eligible' ? 'Reason (required)' : 'Remark (optional)'}
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
          placeholder={status === 'Not Eligible' ? 'Why is this finding not valid?' : 'Anything the auditor should know'}
        />
      </div>
      <Button size="sm" onClick={save} loading={saving} disabled={!changed || (status === 'Not Eligible' && !remark.trim())}>Save</Button>
    </div>
  );
}
