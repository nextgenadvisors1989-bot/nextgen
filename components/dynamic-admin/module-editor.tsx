'use client';

/**
 * Module detail — everything about one dynamic module:
 *   • its settings (name, type, TAT, verification, visibility, version status);
 *   • the forms inside it, each opening the drag-free section/field builder;
 *   • who may use it (role assignments with their own CRUD rights, plus
 *     named-user assignments).
 */
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Switch, Textarea } from '@/components/ui/input';
import { Select, MultiSelect } from '@/components/ui/select';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDate, formatDateTime } from '@/lib/utils/dates';
import { formatNumber, truncate } from '@/lib/utils/formatting';
import { MODULE_TYPES, FORM_TYPES } from '@/lib/validations/dynamic-module.validation';

export interface ModuleDetailPayload {
  module: Record<string, unknown>;
  forms: Record<string, unknown>[];
  roleAssignments: Record<string, unknown>[];
  userAssignments: Record<string, unknown>[];
  stats: { forms: number; published: number; submissions: number; awaitingReview: number; fields: number };
}

interface Option {
  value: string;
  label: string;
  hint?: string;
}

const ROLE_RIGHTS = [
  { key: 'can_create', label: 'Create' },
  { key: 'can_read', label: 'Read' },
  { key: 'can_update', label: 'Update' },
  { key: 'can_delete', label: 'Delete' },
  { key: 'can_approve', label: 'Approve' },
] as const;

export function ModuleEditor({
  detail,
  roleOptions,
  userOptions,
  permissions,
}: {
  detail: ModuleDetailPayload;
  roleOptions: Option[];
  userOptions: Option[];
  permissions: { update: boolean; create: boolean; remove: boolean; publish: boolean };
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const moduleId = Number(detail.module.id);
  const [settings, setSettings] = useState(() => ({
    name: String(detail.module.name ?? ''),
    description: String(detail.module.description ?? ''),
    category: String(detail.module.category ?? ''),
    icon: String(detail.module.icon ?? ''),
    module_type: String(detail.module.module_type ?? 'AUDIT'),
    default_tat_days: detail.module.default_tat_days === null || detail.module.default_tat_days === undefined ? '' : String(detail.module.default_tat_days),
    requires_verification: Boolean(Number(detail.module.requires_verification ?? 0)),
    is_public: Boolean(Number(detail.module.is_public ?? 0)),
    sort_order: String(detail.module.sort_order ?? 0),
    status: String(detail.module.status ?? 'draft'),
  }));
  const [roles, setRoles] = useState<string[]>(detail.roleAssignments.map((row) => String(row.role_slug)));
  const [roleRights, setRoleRights] = useState<Record<string, Record<string, boolean>>>(() => {
    const map: Record<string, Record<string, boolean>> = {};
    for (const row of detail.roleAssignments) {
      const slug = String(row.role_slug);
      map[slug] = {
        can_create: Boolean(Number(row.can_create ?? 0)),
        can_read: Boolean(Number(row.can_read ?? 0)),
        can_update: Boolean(Number(row.can_update ?? 0)),
        can_delete: Boolean(Number(row.can_delete ?? 0)),
        can_approve: Boolean(Number(row.can_approve ?? 0)),
      };
    }
    return map;
  });
  const [userIds, setUserIds] = useState<string[]>(detail.userAssignments.map((row) => String(row.user_id)));
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingAccess, setSavingAccess] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formDraft, setFormDraft] = useState({
    name: '', form_type: 'AUDIT', layout_columns: '1', auto_number_prefix: '', requires_signature: false,
    requires_attachments: false, allow_draft: true, description: '',
  });
  const [creatingForm, setCreatingForm] = useState(false);
  const [pendingPublishModule, setPendingPublishModule] = useState(false);
  const [pendingClone, setPendingClone] = useState(false);
  const [cloneName, setCloneName] = useState(`${String(detail.module.name ?? '')} (Copy)`);
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'module' } | { kind: 'form'; id: number; name: string } | null>(null);
  const [working, setWorking] = useState(false);

  const forms = detail.forms;

  async function saveSettings() {
    setSavingSettings(true);
    try {
      const response = await api.put(`/api/admin/dynamic-modules/${moduleId}`, {
        name: settings.name,
        description: settings.description || null,
        category: settings.category || null,
        icon: settings.icon || null,
        module_type: settings.module_type,
        default_tat_days: settings.default_tat_days === '' ? null : Number(settings.default_tat_days),
        requires_verification: settings.requires_verification,
        is_public: settings.is_public,
        sort_order: Number(settings.sort_order || 0),
        status: settings.status,
      });
      if (!response.ok) throw new Error(response.message);
      success('Module settings saved');
      router.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveAccess() {
    setSavingAccess(true);
    try {
      const response = await api.put(`/api/admin/dynamic-modules/${moduleId}/assignments`, {
        roles: roles.map((role) => ({
          role,
          can_create: roleRights[role]?.can_create ?? true,
          can_read: roleRights[role]?.can_read ?? true,
          can_update: roleRights[role]?.can_update ?? true,
          can_delete: roleRights[role]?.can_delete ?? false,
          can_approve: roleRights[role]?.can_approve ?? false,
        })),
        users: userIds.map((id) => ({ user_id: Number(id) })),
      });
      if (!response.ok) throw new Error(response.message);
      success('Access updated');
      router.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setSavingAccess(false);
    }
  }

  async function publishModule() {
    setWorking(true);
    try {
      const response = await api.post<{ version: string; forms: number; publishedForms: number; skipped?: { name: string; reason: string }[] }>(`/api/admin/dynamic-modules/${moduleId}/publish`, {});
      if (!response.ok) throw new Error(response.message);
      const data = response.data as { version?: string; forms?: number; liveForms?: number; skipped?: { name: string; reason: string }[] } | undefined;
      const skipped = data?.skipped ?? [];
      success(`Module published as v${data?.version ?? ''} — ${data?.liveForms ?? 0} of ${data?.forms ?? 0} form(s) live`);
      if (skipped.length > 0) {
        errorToast(`Still in draft: ${skipped.map((entry) => `${entry.name} (${entry.reason})`).join('; ')}`);
      }
      setPendingPublishModule(false);
      router.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function archiveModule() {
    setWorking(true);
    try {
      const response = await api.post(`/api/admin/dynamic-modules/${moduleId}/archive`, {});
      if (!response.ok) throw new Error(response.message);
      success('Module archived — it is no longer offered to any panel');
      router.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function cloneModule() {
    setWorking(true);
    try {
      const response = await api.post<{ moduleId: number }>(`/api/admin/dynamic-modules/${moduleId}/clone`, {
        name: cloneName, copy_assignments: true, copy_forms: true,
      });
      if (!response.ok) throw new Error(response.message);
      const cloned = response.data as { moduleId?: number } | undefined;
      success('Module duplicated');
      setPendingClone(false);
      if (cloned?.moduleId) router.push(`/admin/dynamic-modules/${cloned.moduleId}`);
      else router.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function deleteModule() {
    setWorking(true);
    try {
      const response = await api.delete(`/api/admin/dynamic-modules/${moduleId}`);
      if (!response.ok) throw new Error(response.message);
      success('Module deleted');
      setPendingDelete(null);
      router.push('/admin/dynamic-modules');
    } catch (error) {
      errorToast((error as Error).message);
      setPendingDelete(null);
    } finally {
      setWorking(false);
    }
  }

  async function createForm() {
    setCreatingForm(true);
    try {
      const response = await api.post<{ formId: number }>(`/api/admin/dynamic-modules/${moduleId}/forms`, {
        name: formDraft.name,
        description: formDraft.description || null,
        form_type: formDraft.form_type,
        layout_columns: Number(formDraft.layout_columns || 1),
        auto_number_prefix: formDraft.auto_number_prefix || null,
        requires_signature: formDraft.requires_signature,
        requires_attachments: formDraft.requires_attachments,
        allow_draft: formDraft.allow_draft,
        sections: [{ title: 'General', layout_columns: Number(formDraft.layout_columns || 1), fields: [], tables: [] }],
      });
      if (!response.ok) throw new Error(response.message);
      const created = response.data as { formId?: number } | undefined;
      success(`Form “${formDraft.name}” created — add its sections, fields and tables next`);
      setFormOpen(false);
      if (created?.formId) router.push(`/admin/dynamic-modules/${moduleId}/forms/${created.formId}`);
      else router.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setCreatingForm(false);
    }
  }

  async function publishForm(formId: number) {
    const response = await api.post<{ version: number; fields: number }>(`/api/admin/dynamic-forms/${formId}/publish`, {});
    if (!response.ok) errorToast(response.message);
    else {
      const data = response.data as { version?: number; fields?: number } | undefined;
      success(`Form published as v${data?.version ?? ''} with ${data?.fields ?? 0} field(s)`);
      router.refresh();
    }
  }

  async function deleteForm(formId: number) {
    setWorking(true);
    try {
      const response = await api.delete(`/api/admin/dynamic-forms/${formId}`);
      if (!response.ok) throw new Error(response.message);
      success('Form deleted');
      setPendingDelete(null);
      router.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Forms" value={formatNumber(detail.stats.forms)} hint={`${detail.stats.published} published`} tone="brand" />
        <StatCard label="Fields" value={formatNumber(detail.stats.fields)} hint="Across every form" tone="violet" />
        <StatCard label="Submissions" value={formatNumber(detail.stats.submissions)} hint="All time" tone="slate" />
        <StatCard label="Awaiting Review" value={formatNumber(detail.stats.awaitingReview)} hint="With a verifier" tone={detail.stats.awaitingReview ? 'amber' : 'emerald'} />
        <StatCard label="Status" value={<StatusBadge status={String(detail.module.status)} />} hint={`v${String(detail.module.version)} · updated ${formatDate(String(detail.module.updated_at))}`} tone="slate" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Module settings"
            description="The configuration auditors, verifiers and administrators see when they pick this module."
            action={
              <div className="flex flex-wrap gap-2">
                {permissions.publish && String(detail.module.status) !== 'published' && (
                  <Button size="sm" onClick={() => setPendingPublishModule(true)}>Publish module</Button>
                )}
                {permissions.update && String(detail.module.status) !== 'archived' && (
                  <Button size="sm" variant="outline" onClick={archiveModule} loading={working}>Archive</Button>
                )}
                {permissions.create && (
                  <Button size="sm" variant="outline" onClick={() => setPendingClone(true)}>Clone</Button>
                )}
                {permissions.remove && (
                  <Button size="sm" variant="ghost" onClick={() => setPendingDelete({ kind: 'module' })}>Delete</Button>
                )}
              </div>
            }
          />
          <CardBody className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Input label="Name" value={settings.name} onChange={(event) => setSettings((current) => ({ ...current, name: event.target.value }))} required />
              <Select
                label="Module type"
                value={settings.module_type}
                onChange={(value) => setSettings((current) => ({ ...current, module_type: value }))}
                options={MODULE_TYPES.map((type) => ({ value: type, label: type }))}
              />
              <Input label="Category" value={settings.category} onChange={(event) => setSettings((current) => ({ ...current, category: event.target.value }))} />
              <Input label="Icon key" value={settings.icon} onChange={(event) => setSettings((current) => ({ ...current, icon: event.target.value }))} helper="Sidebar icon key, e.g. layers, shield, flame." />
              <Input
                label="Default TAT (days)"
                type="number"
                min={1}
                max={365}
                value={settings.default_tat_days}
                onChange={(event) => setSettings((current) => ({ ...current, default_tat_days: event.target.value }))}
              />
              <Input
                label="Sort order"
                type="number"
                min={0}
                value={settings.sort_order}
                onChange={(event) => setSettings((current) => ({ ...current, sort_order: event.target.value }))}
              />
            </div>
            <Textarea label="Description" rows={3} value={settings.description} onChange={(event) => setSettings((current) => ({ ...current, description: event.target.value }))} />
            <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-3 md:grid-cols-3">
              <Switch label="Requires verification" checked={settings.requires_verification} onChange={(checked) => setSettings((current) => ({ ...current, requires_verification: checked }))} />
              <Switch label="Public module" checked={settings.is_public} onChange={(checked) => setSettings((current) => ({ ...current, is_public: checked }))} />
              <Select
                label="Status"
                value={settings.status}
                onChange={(value) => setSettings((current) => ({ ...current, status: value }))}
                options={[{ value: 'draft', label: 'Draft' }, { value: 'published', label: 'Published' }, { value: 'archived', label: 'Archived' }]}
              />
            </div>
            {permissions.update && (
              <div className="flex justify-end">
                <Button onClick={saveSettings} loading={savingSettings}>Save settings</Button>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Details" description="Identifiers and audit trail for this module." />
          <CardBody className="space-y-3 text-sm">
            <Row label="Slug" value={String(detail.module.slug)} />
            <Row label="Version" value={`v${String(detail.module.version)}`} />
            <Row label="Created" value={formatDateTime(String(detail.module.created_at))} />
            <Row label="Last updated" value={formatDateTime(String(detail.module.updated_at))} />
            <Row
              label="Submissions"
              value={
                <Link className="text-brand-600 hover:underline" href={`/admin/dynamic-submissions?module_id=${moduleId}`}>
                  View every submission →
                </Link>
              }
            />
            <Row
              label="Assignments"
              value={`${detail.roleAssignments.length} role(s), ${detail.userAssignments.length} user(s)`}
            />
          </CardBody>
        </Card>
      </div>

      <Card padded={false}>
        <CardHeader
          title="Forms in this module"
          description="Each form is a versioned set of sections, fields, tables and rules that submissions are validated and scored against."
          action={
            permissions.create ? (
              <Button size="sm" onClick={() => setFormOpen(true)}>+ New form</Button>
            ) : undefined
          }
        />
        {forms.length === 0 ? (
          <CardBody>
            <div className="rounded-lg border border-dashed border-line p-8 text-center">
              <p className="text-sm font-medium text-ink-soft">No forms yet</p>
              <p className="mt-1 text-sm text-ink-muted">Add the first form, then build its sections, fields and tables.</p>
            </div>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-[13px] font-semibold text-ink-soft">
                <tr>
                  <th className="w-[60px] px-4 py-3">S.No</th>
                  <th className="px-4 py-3">Form</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3">Submissions</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="w-[220px] px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {forms.map((form, index) => {
                  const formId = Number(form.id);
                  return (
                    <tr key={formId} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 text-ink-muted">{index + 1}</td>
                      <td className="px-4 py-3">
                        <Link href={`/admin/dynamic-modules/${moduleId}/forms/${formId}`} className="font-medium text-brand-600 hover:underline">
                          {truncate(String(form.name), 44)}
                        </Link>
                        <span className="block text-xs text-ink-muted">
                          {String(form.slug)}
                          {form.auto_number_prefix ? ` · prefix ${String(form.auto_number_prefix)}` : ''}
                          {Number(form.requires_signature) ? ' · signature' : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3"><Badge tone="violet">{String(form.form_type)}</Badge></td>
                      <td className="px-4 py-3 text-ink-soft">v{String(form.version)}</td>
                      <td className="px-4 py-3 text-ink-soft">
                        {formatNumber(Number(form.submission_count ?? 0))}
                        <span className="block text-xs text-ink-muted">
                          {Number(form.draft_count ?? 0)} draft · {Number(form.submitted_count ?? 0)} in review · {Number(form.approved_count ?? 0)} approved
                        </span>
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={String(form.status)} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <Link href={`/admin/dynamic-modules/${moduleId}/forms/${formId}`} className="text-xs font-medium text-brand-600 hover:underline">
                            Open builder
                          </Link>
                          {permissions.publish && String(form.status) !== 'published' && (
                            <Button size="sm" variant="ghost" onClick={() => publishForm(formId)}>Publish</Button>
                          )}
                          {permissions.remove && (
                            <Button size="sm" variant="ghost" onClick={() => setPendingDelete({ kind: 'form', id: formId, name: String(form.name) })}>Delete</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Who may use this module"
          description="Role assignments grant the module to everyone holding that role; named users get it in addition to their role."
          action={permissions.update ? <Button size="sm" onClick={saveAccess} loading={savingAccess}>Save access</Button> : undefined}
        />
        <CardBody className="space-y-5">
          <div>
            <MultiSelect
              label="Roles"
              options={roleOptions}
              values={roles}
              onChange={(values) => setRoles(values)}
              helper="Removing a role revokes the module from every user who only had it through that role."
            />
            {roles.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-[13px] font-semibold text-ink-soft">
                    <tr>
                      <th className="px-3 py-2">Role</th>
                      {ROLE_RIGHTS.map((right) => <th key={right.key} className="px-3 py-2 text-center">{right.label}</th>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {roles.map((role) => (
                      <tr key={role}>
                        <td className="px-3 py-2 font-medium text-ink">{roleOptions.find((option) => option.value === role)?.label ?? role}</td>
                        {ROLE_RIGHTS.map((right) => (
                          <td key={right.key} className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-line accent-brand-500"
                              checked={roleRights[role]?.[right.key] ?? false}
                              onChange={(event) =>
                                setRoleRights((current) => ({
                                  ...current,
                                  [role]: { ...(current[role] ?? {}), [right.key]: event.target.checked },
                                }))
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <MultiSelect
            label="Named users"
            options={userOptions}
            values={userIds}
            onChange={(values) => setUserIds(values)}
            helper="Use this for auditors who need one specific module without the role-wide grant."
          />

          {detail.userAssignments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {detail.userAssignments.map((row) => (
                <Badge key={String(row.id)} tone="slate">
                  {String(row.user_name)} · {String(row.user_email)}
                </Badge>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="New form"
        description="A starter section is created so you can begin adding fields immediately. Sections, fields, tables, rules and scoring are configured in the builder."
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={createForm} loading={creatingForm} disabled={formDraft.name.trim().length < 3}>Create & open builder</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input label="Form name" value={formDraft.name} onChange={(event) => setFormDraft((current) => ({ ...current, name: event.target.value }))} required />
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Form type"
              value={formDraft.form_type}
              onChange={(value) => setFormDraft((current) => ({ ...current, form_type: value }))}
              options={FORM_TYPES.map((type) => ({ value: type, label: type }))}
            />
            <Select
              label="Columns per section"
              value={formDraft.layout_columns}
              onChange={(value) => setFormDraft((current) => ({ ...current, layout_columns: value }))}
              options={[{ value: '1', label: '1 column' }, { value: '2', label: '2 columns' }, { value: '3', label: '3 columns' }]}
            />
          </div>
          <Input
            label="Auto-number prefix"
            value={formDraft.auto_number_prefix}
            onChange={(event) => setFormDraft((current) => ({ ...current, auto_number_prefix: event.target.value.toUpperCase().slice(0, 8) }))}
            helper="Submission numbers read PREFIX/YYYY/000001 — e.g. FSA."
          />
          <Textarea label="Description" rows={2} value={formDraft.description} onChange={(event) => setFormDraft((current) => ({ ...current, description: event.target.value }))} />
          <div className="grid gap-3 rounded-lg border border-line bg-surface-muted p-3 md:grid-cols-3">
            <Checkbox label="Signature required" checked={formDraft.requires_signature} onChange={(event) => setFormDraft((current) => ({ ...current, requires_signature: event.target.checked }))} />
            <Checkbox label="Attachments required" checked={formDraft.requires_attachments} onChange={(event) => setFormDraft((current) => ({ ...current, requires_attachments: event.target.checked }))} />
            <Checkbox label="Drafts allowed" checked={formDraft.allow_draft} onChange={(event) => setFormDraft((current) => ({ ...current, allow_draft: event.target.checked }))} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={pendingPublishModule}
        title="Publish this module?"
        message="The module version is bumped and every structurally valid form inside it goes live for the assigned roles."
        confirmLabel="Publish"
        loading={working}
        onConfirm={publishModule}
        onClose={() => setPendingPublishModule(false)}
      />

      <Modal
        open={pendingClone}
        onClose={() => setPendingClone(false)}
        title="Clone module"
        description="Forms, fields, tables and role assignments are copied. Existing submissions stay with the original."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingClone(false)}>Cancel</Button>
            <Button loading={working} disabled={cloneName.trim().length < 3} onClick={cloneModule}>Clone module</Button>
          </div>
        }
      >
        <Input label="Name of the copy" value={cloneName} onChange={(event) => setCloneName(event.target.value)} required />
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete?.kind === 'form' ? 'Delete this form?' : 'Delete this module?'}
        message={
          pendingDelete?.kind === 'form'
            ? `${pendingDelete.name} and its fields, tables and rules will be removed. Forms that already hold submissions must be archived instead.`
            : `${String(detail.module.name)} and every form inside it will be removed. Modules that hold submissions can only be archived.`
        }
        confirmLabel="Delete"
        variant="danger"
        loading={working}
        onConfirm={() => {
          if (!pendingDelete) return;
          if (pendingDelete.kind === 'form') void deleteForm(pendingDelete.id);
          else void deleteModule();
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value}</span>
    </div>
  );
}
