'use client';

/**
 * Everything that happens on one finding after a report is sent: the Reply thread, the employer's fix (details, images, signature) and the
 * auditor's Approve / Decline. It sits under the finding in its popup. Each side sees only the buttons that are theirs:
 *   employer  Reply, "Submit the fix" (while the finding is Pending or Declined)
 *   auditor   Reply, Approve / Decline (while the employer's answer is waiting)
 */
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api, apiFetch, fieldErrors } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';
import { SignatureDialog, type SignaturePayload } from '@/components/capar/signature-dialog';
import type { CaparFinding } from '@/types/capar';

export const RESPONSE_TONE: Record<string, string> = {
  Pending: 'bg-amber-50 text-amber-700',
  'Employer Submitted': 'bg-sky-50 text-sky-700',
  Approved: 'bg-emerald-50 text-emerald-700',
  Declined: 'bg-red-50 text-red-700',
};
export const RESPONSE_LABEL: Record<string, string> = {
  Pending: 'Pending', 'Employer Submitted': 'Employer submitted', Approved: 'Approved', Declined: 'Declined',
};

export function FindingResponse({ reportId, finding, role, can, employerName, onChanged }: {
  reportId: number;
  finding: CaparFinding;
  role: string;
  can: { respond: boolean; review: boolean; message: boolean };
  employerName?: string;
  onChanged: () => void;
}) {
  const { success, error: errorToast } = useToast();
  const base = `/api/capar/${reportId}/findings/${finding.id}`;
  const [replying, setReplying] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachments, setAttachments] = useState<File[]>([]);
  const [fixing, setFixing] = useState(false);
  const [details, setDetails] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [signing, setSigning] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const employerFiles = finding.files.filter((file) => file.source === 'employer');
  const answerOpen = ['Pending', 'Declined'].includes(finding.response_status);

  async function sendMessage() {
    setBusy(true);
    const form = new FormData();
    form.append('subject', subject);
    form.append('body', body);
    attachments.forEach((file) => form.append('files', file));
    const result = await apiFetch(`${base}/messages`, { method: 'POST', body: form });
    setBusy(false);
    if (!result.ok) { setErrors(fieldErrors(result)); errorToast('Could not send it', result.message); return; }
    success('Message sent', 'The other side has been told by notification and mail.');
    setReplying(false); setSubject(''); setBody(''); setAttachments([]); setErrors({});
    onChanged();
  }

  async function submitFix(signature: SignaturePayload) {
    setBusy(true);
    if (files.length) {
      const form = new FormData();
      files.forEach((file) => form.append('files', file));
      const uploaded = await apiFetch(`${base}/employer-files`, { method: 'POST', body: form });
      if (!uploaded.ok) { setBusy(false); setSigning(false); errorToast('Could not upload the images', uploaded.message); return; }
    }
    const result = await api.post(`${base}/respond`, { response_text: details, ...signature });
    setBusy(false);
    setSigning(false);
    if (!result.ok) { setErrors(fieldErrors(result)); errorToast('Could not submit', result.message); return; }
    success('Submitted', 'The auditor has been told.');
    setFixing(false); setDetails(''); setFiles([]); setErrors({});
    onChanged();
  }

  async function review(decision: 'approve' | 'decline') {
    setBusy(true);
    const result = await api.post(`${base}/review`, { decision, note });
    setBusy(false);
    if (!result.ok) { setErrors(fieldErrors(result)); errorToast('Could not save', result.message); return; }
    success(decision === 'approve' ? 'Approved' : 'Declined');
    setDeclining(false); setNote(''); setErrors({});
    onChanged();
  }

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-line bg-surface-muted/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-ink">Employer response</h4>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${RESPONSE_TONE[finding.response_status] ?? 'bg-slate-100 text-slate-600'}`}>{RESPONSE_LABEL[finding.response_status] ?? finding.response_status}</span>
      </div>

      {finding.response_text && (
        <div className="rounded-lg bg-white p-3 text-sm">
          <p className="whitespace-pre-line text-ink">{finding.response_text}</p>
          {employerFiles.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {employerFiles.map((file) => (
                <li key={file.link_id}>
                  <a href={file.url} target="_blank" rel="noreferrer" title={file.original_name}>
                    {/^image\//.test(file.mime_type ?? '')
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={file.url} alt={file.original_name} className="h-16 w-24 rounded-lg border border-line object-cover" />
                      : <span className="inline-block rounded-lg border border-line px-2 py-1 text-xs text-brand-600">{file.original_name}</span>}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {finding.employer_signed && <p className="mt-2 text-xs text-ink-muted">Signed by <strong className="text-ink">{finding.employer_signed_by}</strong>{finding.employer_signed_at ? ` on ${formatDateTime(finding.employer_signed_at)}` : ''}</p>}
        </div>
      )}
      {finding.response_status === 'Declined' && finding.response_review_note && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800"><strong>Declined{finding.response_reviewed_by ? ` by ${finding.response_reviewed_by}` : ''}:</strong> {finding.response_review_note}</p>
      )}
      {finding.response_status === 'Approved' && finding.response_reviewed_by && (
        <p className="text-xs text-ink-muted">Approved by {finding.response_reviewed_by}{finding.response_reviewed_at ? ` on ${formatDateTime(finding.response_reviewed_at)}` : ''}.</p>
      )}

      {/* the reply thread */}
      {finding.messages.length > 0 && (
        <ul className="space-y-2">
          {finding.messages.map((message) => (
            <li key={message.id} className={`rounded-lg p-3 text-sm ${message.sender_role === 'employer' ? 'bg-white' : 'bg-brand-50/60'}`}>
              <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
                <span><strong className="text-ink">{message.sender_name}</strong> · {message.sender_role === 'employer' ? 'Employer' : 'Auditor'}</span>
                <span>{formatDateTime(message.created_at)}</span>
              </p>
              <p className="mt-1 font-medium text-ink">{message.subject}</p>
              <p className="whitespace-pre-line text-ink-soft">{message.body}</p>
              {message.files.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {message.files.map((file) => (
                    <li key={file.file_id}>
                      <a href={file.url} target="_blank" rel="noreferrer" title={file.name}>
                        {/^image\//.test(file.mime_type ?? '')
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={file.url} alt={file.name} className="h-16 w-24 rounded-lg border border-line object-cover" />
                          : <span className="inline-block rounded-lg border border-line px-2 py-1 text-xs text-brand-600">{file.name}</span>}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* actions */}
      <div className="flex flex-wrap items-center gap-2">
        {can.message && !replying && <Button size="sm" variant="outline" onClick={() => setReplying(true)}>Reply</Button>}
        {can.respond && answerOpen && finding.outcome === 'Violation' && !fixing && <Button size="sm" onClick={() => setFixing(true)}>{finding.response_status === 'Declined' ? 'Submit the fix again' : 'Submit the fix'}</Button>}
        {can.review && finding.response_status === 'Employer Submitted' && !declining && (
          <>
            <Button size="sm" variant="success" loading={busy} onClick={() => review('approve')}>Approve</Button>
            <Button size="sm" variant="outline" onClick={() => setDeclining(true)}>Decline</Button>
          </>
        )}
      </div>

      <Modal
        open={replying}
        onClose={() => setReplying(false)}
        title={role === 'employer' ? 'Message the auditor' : 'Message the employer'}
        description="The other side gets a notification and a mail. Your message stays on this finding."
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReplying(false)}>Cancel</Button>
            <Button loading={busy} disabled={subject.trim().length < 3 || body.trim().length < 2} onClick={sendMessage}>Send</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder={role === 'employer' ? 'e.g. We need 2 weeks to renew the Fire NOC' : 'e.g. Please attach the renewal receipt'} error={errors.subject} />
          <Textarea label="Message" rows={6} value={body} onChange={(event) => setBody(event.target.value)} error={errors.body} />
          <div>
            <span className="label">Attach images or documents (optional)</span>
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => setAttachments(Array.from(event.target.files ?? []))} className="block text-sm" />
            {attachments.length > 0 && <p className="helper">{attachments.map((file) => file.name).join(', ')}</p>}
          </div>
        </div>
      </Modal>

      {fixing && (
        <div className="space-y-3 rounded-lg bg-white p-3">
          <Textarea label="What has been done to fix this?" required rows={4} value={details} onChange={(event) => setDetails(event.target.value)} error={errors.response_text} placeholder="e.g. The Fire NOC was renewed on 12 Nov 2026. A copy is attached." />
          <div>
            <span className="label">Images or documents (proof)</span>
            <input type="file" multiple accept="image/*,.pdf,.doc,.docx" onChange={(event) => setFiles(Array.from(event.target.files ?? []))} className="block text-sm" />
            {files.length > 0 && <p className="helper">{files.length} file{files.length === 1 ? '' : 's'} chosen</p>}
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setFixing(false)}>Cancel</Button>
            <Button size="sm" disabled={details.trim().length < 5} onClick={() => setSigning(true)}>Sign &amp; submit</Button>
          </div>
        </div>
      )}

      {declining && (
        <div className="space-y-3 rounded-lg bg-white p-3">
          <Textarea label="What is still missing?" required rows={3} value={note} onChange={(event) => setNote(event.target.value)} error={errors.note} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => setDeclining(false)}>Cancel</Button>
            <Button size="sm" variant="danger" loading={busy} disabled={note.trim().length < 3} onClick={() => review('decline')}>Decline</Button>
          </div>
        </div>
      )}

      <SignatureDialog
        open={signing}
        onClose={() => setSigning(false)}
        title="Sign your answer"
        description="Your signature confirms that what you wrote is correct. The auditor is told straight away."
        confirmLabel="Sign & submit"
        loading={busy}
        defaultName={employerName}
        onSign={(signature) => void submitFix(signature)}
      />
    </div>
  );
}
