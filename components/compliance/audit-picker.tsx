'use client';

/**
 * The auditor's Audit and Assessment page: pick which audit or assessment is being done, which of its forms, and the company it is for
 * (one of the assigned audits, or a name typed in), then the form opens right below with every field of the client's document.
 * The same page stays: after "Submit" the answers, the report PDF and the Word file are right there.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { SubmissionRecord, type SubmissionWorkspacePayload } from '@/components/dynamic-renderer/submission-record';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';

interface LinkedForm { id: number; name: string; canOpen: boolean }
interface AuditType { id: number; name: string; status: string; forms: LinkedForm[] }
interface MyAudit { value: string; label: string; hint?: string; employerId: number; company: string; unit: string | null; auditDate: string | null }

export function AuditPicker() {
  const { error: errorToast } = useToast();
  const [types, setTypes] = useState<AuditType[] | null>(null);
  const [audits, setAudits] = useState<MyAudit[]>([]);
  const [typeId, setTypeId] = useState('');
  const [formId, setFormId] = useState('');
  const [company, setCompany] = useState('');
  const [busy, setBusy] = useState(false);
  const [workspace, setWorkspace] = useState<SubmissionWorkspacePayload | null>(null);

  useEffect(() => {
    void api.get<AuditType[]>('/api/compliance-register/types').then((result) => { if (result.ok && Array.isArray(result.data)) setTypes(result.data); });
    void api.get<MyAudit[]>('/api/capar/lookups?type=myaudits').then((result) => { if (result.ok && Array.isArray(result.data)) setAudits(result.data); });
  }, []);

  const type = types?.find((entry) => String(entry.id) === typeId) ?? null;
  const openable = useMemo(() => (type?.forms ?? []).filter((form) => form.canOpen), [type]);
  const form = openable.find((entry) => String(entry.id) === formId) ?? (openable.length === 1 ? openable[0] : null);
  const picked = audits.find((audit) => audit.value === company) ?? null;
  const typed = picked ? '' : company.trim();

  // choosing another audit clears the form and any form already opened
  useEffect(() => { setFormId(''); setWorkspace(null); }, [typeId]);

  // Any auditor may do any audit on the list for any company, so every audit with a form is offered in the order the administrator keeps; an audit that
  // has no form linked yet is not shown (the administrator links forms under Audit and Assessment).
  const options = useMemo(() => (types ?? []).filter((entry) => entry.forms.some((f) => f.canOpen)).map((entry) => ({ value: String(entry.id), label: entry.name })), [types]);

  const fetchWorkspace = useCallback(async (id: number) => {
    const result = await api.get<unknown>(`/api/auditor/submissions/${id}`);
    return result.ok && result.raw ? (JSON.parse(JSON.stringify(result.raw)) as SubmissionWorkspacePayload) : null;
  }, []);
  const load = useCallback(async (id: number) => {
    const next = await fetchWorkspace(id);
    if (next) setWorkspace(next);
    return Boolean(next);
  }, [fetchWorkspace]);

  async function open() {
    if (!form) return;
    setBusy(true);
    const body: Record<string, unknown> = { form_id: form.id };
    if (picked) { body.assignment_id = Number(picked.value); body.employer_id = picked.employerId; } else body.title = `${form.name} — ${typed}`;
    const started = await api.post<unknown>('/api/auditor/submissions', body);
    const id = Number((started.raw as { submissionId?: number } | undefined)?.submissionId);
    if (!started.ok || !id) { setBusy(false); errorToast('Could not open the form', started.message); return; }
    // the company goes into the form's own "facility" field the first time it is opened, before the form is drawn
    let next = await fetchWorkspace(id);
    if (next) {
      const sections = (next.structure as { sections?: { fields?: { field_key: string }[] }[] }).sections ?? [];
      const fields = sections.flatMap((section) => section.fields ?? []).map((field) => field.field_key);
      const values: Record<string, unknown> = {};
      if (fields.includes('facility_unit_name') && !next.values.facility_unit_name) values.facility_unit_name = picked ? picked.label : typed;
      if (picked?.auditDate && fields.includes('audit_date') && !next.values.audit_date) values.audit_date = picked.auditDate;
      if (Object.keys(values).length) {
        // a save replaces the answers it carries, so the answers already there go with it
        await api.put(`/api/auditor/submissions/${id}`, { values: { ...next.values, ...values } });
        next = (await fetchWorkspace(id)) ?? next;
      }
      setWorkspace(next);
    }
    setBusy(false);
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardBody>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select label="Which audit or assessment are you doing?" required searchable options={options} value={typeId} onChange={setTypeId} placeholder={types === null ? 'Loading...' : 'Choose the audit or assessment'} />
            {type && openable.length > 1 ? (
              <Select label="Which form?" required options={openable.map((entry) => ({ value: String(entry.id), label: entry.name }))} value={form ? String(form.id) : ''} onChange={setFormId} placeholder="Choose the form" />
            ) : type && openable.length === 1 ? (
              <div><span className="label">Form</span><p className="flex h-10 items-center rounded-lg border border-line bg-surface-muted px-3 text-sm text-ink">{openable[0].name}</p></div>
            ) : <div />}
            <Select
              label="Company being audited"
              required
              searchable
              allowCustom
              options={audits.map((audit) => ({ value: audit.value, label: audit.label }))}
              value={company}
              onChange={setCompany}
              placeholder="Choose from your assigned audits or type a company name"
              helper="Your assigned audits are listed. A company that is not listed can be typed and added."
            />
            <div className="flex items-end gap-3">
              <Button onClick={open} loading={busy} disabled={!form || !company.trim()}>Open the form</Button>
              {form && (
                <span className="flex items-center gap-3 pb-2 text-xs font-semibold text-brand-600">
                  <a href={`/api/documents/form/${form.id}?format=pdf`} className="hover:underline">Blank PDF</a>
                  <a href={`/api/documents/form/${form.id}?format=docx`} className="hover:underline">Blank Word</a>
                </span>
              )}
            </div>
          </div>
        </CardBody>
      </Card>

      {workspace && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">{String(workspace.form.name)}{company ? <span className="font-normal text-ink-muted"> · {picked ? picked.label : typed}</span> : null}</h2>
            <Button variant="outline" size="sm" onClick={() => setWorkspace(null)}>Close the form</Button>
          </div>
          <SubmissionRecord
            key={String(workspace.submission.id)}
            workspace={workspace}
            mode={workspace.permissions.canEdit ? 'fill' : 'view'}
            apiBase="/api/auditor/submissions"
            backHref="/auditor/compliance"
            backLabel="Audit and Assessment"
            onChanged={() => { void load(Number(workspace.submission.id)); }}
          />
        </div>
      )}
    </div>
  );
}
