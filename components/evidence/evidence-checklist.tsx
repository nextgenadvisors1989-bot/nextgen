'use client';

/**
 * The employer's pre-audit document pack. The employer (or an administrator for it) marks each document Provided / Not applicable, adds the
 * reference, validity, notes and files, and submits the pack, which freezes a dated submission. An auditor sees the same list read-only,
 * limited to the sections the administrator gave them, and downloads the latest submission as a PDF.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api, apiFetch, fieldErrors } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';

type ItemStatus = 'Pending' | 'Provided' | 'Not applicable';
interface EvidenceFile { id: number; name: string; size_bytes: number; url: string }
interface Item { id: number; group_name: string | null; name: string; status: ItemStatus; reference_no: string | null; valid_until: string | null; notes: string | null; updated_at: string | null; files: EvidenceFile[] }
interface Section { id: number; name: string; description: string | null; items: Item[] }
interface Submission { id: number; submitted_at: string; submitted_by_name: string | null; total_items: number; provided_items: number; na_items: number; pending_items: number; note: string | null }
interface Checklist {
  employer: { id: number; name: string; code: string | null };
  sections: Section[];
  summary: { total: number; provided: number; na: number; pending: number };
  latest: Submission | null;
  downloaded_at: string | null;
  changed_since_submission: boolean;
  can: { edit: boolean; submit: boolean; download: boolean };
}

const TONE: Record<ItemStatus, 'success' | 'warning' | 'slate'> = { Provided: 'success', Pending: 'warning', 'Not applicable': 'slate' };
const STATUS_OPTIONS = (['Pending', 'Provided', 'Not applicable'] as const).map((value) => ({ value, label: value }));
const size = (bytes: number) => (bytes > 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function EvidenceChecklist({ employerId }: { employerId: number | 'me' }) {
  const toast = useToast();
  const [data, setData] = useState<Checklist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<Record<number, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | ItemStatus>('all');

  const base = `/api/evidence/employers/${employerId}`;
  const load = useCallback(async () => {
    const response = await api.get<Checklist>(base);
    if (response.ok && response.data) { setData(response.data); setError(''); } else setError(response.message);
    setLoading(false);
  }, [base]);
  useEffect(() => { load(); }, [load]);

  const realId = data?.employer.id;
  const editable = Boolean(data?.can.edit);

  async function submitPack() {
    setBusy(true);
    const response = await api.post(`${base}/submit`, { note });
    setBusy(false);
    if (!response.ok) { toast.error(response.message); return; }
    toast.success('Document pack submitted');
    setSubmitting(false);
    setNote('');
    load();
  }

  const sections = useMemo(() => (data?.sections ?? []).map((section) => ({ ...section, items: filter === 'all' ? section.items : section.items.filter((item) => item.status === filter) })), [data, filter]);

  if (loading) return <Card><p className="text-sm text-ink-muted">Loading the document list...</p></Card>;
  if (error || !data) return <Card><p className="text-sm text-red-600">{error || 'Could not load the documents.'}</p></Card>;

  const { summary, latest } = data;
  const percent = summary.total ? Math.round(((summary.provided + summary.na) / summary.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink">{data.employer.name}</h2>
            <p className="mt-0.5 text-sm text-ink-muted">
              {latest ? <>Last submitted {formatDateTime(latest.submitted_at)}{latest.submitted_by_name ? ` by ${latest.submitted_by_name}` : ''}</> : 'Not submitted yet'}
              {data.downloaded_at && <> · You downloaded it on {formatDateTime(data.downloaded_at)}</>}
            </p>
            {data.changed_since_submission && editable && <p className="mt-1 text-sm font-medium text-amber-700">You changed documents after the last submission. Submit again so the auditor receives the latest.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {latest && <a href={`/api/pdf/evidence-pack/${latest.id}`} target="_blank" rel="noreferrer"><Button variant="outline" size="sm">Download pack (PDF)</Button></a>}
            {data.can.submit && <Button size="sm" onClick={() => setSubmitting(true)} disabled={summary.provided + summary.na === 0}>Submit pack</Button>}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[['Documents', summary.total], ['Provided', summary.provided], ['Not applicable', summary.na], ['Pending', summary.pending]].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-line p-3 text-center">
              <p className="text-xl font-bold tabular-nums text-ink">{value}</p>
              <p className="text-xs text-ink-muted">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label="Documents answered">
          <div className="h-full bg-brand-500" style={{ width: `${percent}%` }} />
        </div>
        <p className="mt-1 text-xs text-ink-muted">{percent}% answered</p>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-muted">Show</span>
        {(['all', 'Pending', 'Provided', 'Not applicable'] as const).map((value) => (
          <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${filter === value ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line text-ink-soft hover:bg-surface-muted'}`}>
            {value === 'all' ? 'Everything' : value}
          </button>
        ))}
      </div>

      {sections.length === 0 && (
        <Card><p className="text-sm text-ink-muted">No document sections are available. {data.can.edit ? 'The administrator has not set up the checklist yet.' : 'The administrator has not given you any document sections.'}</p></Card>
      )}

      {sections.map((section) => {
        const answered = section.items.filter((item) => item.status !== 'Pending').length;
        const isOpen = open[section.id] ?? false;
        let lastGroup: string | null | undefined;
        return (
          <Card key={section.id} padded={false}>
            <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" aria-expanded={isOpen} onClick={() => setOpen((c) => ({ ...c, [section.id]: !isOpen }))}>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{section.name}</span>
                <span className="block text-xs text-ink-muted">{answered} of {section.items.length} answered</span>
              </span>
              <span className="text-ink-muted" aria-hidden>{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <ul className="divide-y divide-line border-t border-line">
                {section.items.map((item, index) => {
                  const heading = item.group_name && item.group_name !== lastGroup ? item.group_name : null;
                  lastGroup = item.group_name;
                  return (
                    <ItemRow key={item.id} item={item} index={index + 1} heading={heading} editable={editable} employerId={realId!} onChanged={load} />
                  );
                })}
              </ul>
            )}
          </Card>
        );
      })}

      <Modal open={submitting} onClose={() => setSubmitting(false)} title="Submit the document pack"
        description="This sends a dated copy of your list, with the files you attached, to your auditor. You can change documents and submit again."
        footer={<><Button variant="ghost" onClick={() => setSubmitting(false)}>Cancel</Button><Button onClick={submitPack} loading={busy}>Submit</Button></>}>
        <Textarea label="Note for the auditor (optional)" rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
        <p className="mt-2 text-xs text-ink-muted">{summary.provided} provided, {summary.na} not applicable, {summary.pending} still pending.</p>
      </Modal>
    </div>
  );
}

function ItemRow({ item, index, heading, editable, employerId, onChanged }: { item: Item; index: number; heading: string | null; editable: boolean; employerId: number; onChanged: () => void }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState({ status: item.status, reference_no: item.reference_no ?? '', valid_until: item.valid_until ?? '', notes: item.notes ?? '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const url = `/api/evidence/employers/${employerId}/items/${item.id}`;
  const dirty = form.status !== item.status || form.reference_no !== (item.reference_no ?? '') || form.valid_until !== (item.valid_until ?? '') || form.notes !== (item.notes ?? '');

  useEffect(() => { setForm({ status: item.status, reference_no: item.reference_no ?? '', valid_until: item.valid_until ?? '', notes: item.notes ?? '' }); }, [item]);

  async function save(next = form) {
    setSaving(true);
    setErrors({});
    const response = await api.put(url, next);
    setSaving(false);
    if (!response.ok) { setErrors(fieldErrors(response)); toast.error(response.message); return; }
    onChanged();
  }

  async function upload(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    const body = new FormData();
    Array.from(files).forEach((file) => body.append('files', file));
    const response = await apiFetch(`${url}/files`, { method: 'POST', body });
    setUploading(false);
    if (!response.ok) { toast.error(response.message); return; }
    toast.success(response.message);
    onChanged();
  }

  async function removeFile(file: EvidenceFile) {
    const response = await api.delete(`${url}/files/${file.id}`);
    if (!response.ok) { toast.error(response.message); return; }
    onChanged();
  }

  return (
    <>
      {heading && <li className="bg-surface-muted px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">{heading}</li>}
      <li className="px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button type="button" className="flex min-w-0 flex-1 items-start gap-2 text-left" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
            <span className="mt-0.5 w-6 shrink-0 text-xs tabular-nums text-ink-muted">{index}.</span>
            <span className="min-w-0 text-sm text-ink">{item.name}</span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {item.files.length > 0 && <span className="text-xs text-ink-muted">{item.files.length} file{item.files.length === 1 ? '' : 's'}</span>}
            {editable ? (
              <Select size="sm" className="w-40" value={form.status} options={STATUS_OPTIONS}
                onChange={(value) => { const next = { ...form, status: value as ItemStatus }; setForm(next); save(next); }} />
            ) : <Badge tone={TONE[item.status]}>{item.status}</Badge>}
          </div>
        </div>
        {expanded && (
          <div className="ml-8 mt-3 space-y-3">
            {editable ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input label="Reference / number" value={form.reference_no} onChange={(e) => setForm({ ...form, reference_no: e.target.value })} error={errors.reference_no} placeholder="e.g. licence number" />
                  <Input label="Valid until" type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} error={errors.valid_until} />
                </div>
                <Textarea label="Notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} error={errors.notes} />
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm" onClick={() => save()} loading={saving} disabled={!dirty}>Save</Button>
                  <label className="inline-flex cursor-pointer items-center rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-surface-muted">
                    {uploading ? 'Uploading...' : 'Attach files'}
                    <input type="file" multiple className="sr-only" disabled={uploading} onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
                  </label>
                  {item.updated_at && <span className="text-xs text-ink-muted">Updated {formatDateTime(item.updated_at)}</span>}
                </div>
              </>
            ) : (
              <dl className="grid gap-2 text-sm md:grid-cols-3">
                <div><dt className="text-xs text-ink-muted">Reference</dt><dd>{item.reference_no || '-'}</dd></div>
                <div><dt className="text-xs text-ink-muted">Valid until</dt><dd>{item.valid_until || '-'}</dd></div>
                <div><dt className="text-xs text-ink-muted">Notes</dt><dd className="whitespace-pre-line">{item.notes || '-'}</dd></div>
              </dl>
            )}
            {item.files.length > 0 && (
              <ul className="space-y-1 text-sm">
                {item.files.map((file) => (
                  <li key={file.id} className="flex flex-wrap items-center gap-2">
                    <a href={file.url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">{file.name}</a>
                    <span className="text-xs text-ink-muted">{size(file.size_bytes)}</span>
                    {editable && <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeFile(file)}>Remove</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </li>
    </>
  );
}
