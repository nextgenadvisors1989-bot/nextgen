'use client';

/**
 * The form builder.
 *
 * Left: the section rail (add / reorder / jump). Right: the canvas — every section
 * with its fields and tables, each editable in place, reorderable with the arrows
 * and removable with one click. The header carries the form identity, the save and
 * publish actions and a live readiness panel: an administrator can see exactly what
 * still blocks publishing (empty sections, missing options, broken formulas,
 * duplicate keys) *before* the server says no.
 *
 * The whole structure is saved in one request, so the form can never be left
 * half-written; a published version keeps the answers that were already collected.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Input, Switch, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/modal';
import { api } from '@/lib/utils/api-client';
import { compileFormula, formulaIdentifiers } from '@/lib/utils/formula';
import { FieldEditor } from './field-editor';
import { TableEditor } from './table-editor';
import {
  fromStructure, isLayout, newField, newTable, slugKey, toPayload,
  type DraftColumn, type DraftField, type DraftForm, type DraftSection, type DraftTable,
} from './builder-types';
import { FormRenderer } from '@/components/dynamic-renderer/form-renderer';

interface Props {
  moduleId: number;
  formId: number;
  form: Record<string, unknown>;
  structure: Record<string, unknown>;
  counts: { total: number; drafts: number; submitted: number; approved: number };
  permissions: { update: boolean; publish: boolean; create: boolean };
}

const FORM_TYPES = [
  { value: 'STANDARD', label: 'Standard form' },
  { value: 'AUDIT', label: 'Audit form' },
  { value: 'CHECKLIST', label: 'Checklist' },
  { value: 'INSPECTION', label: 'Inspection' },
  { value: 'PERMIT', label: 'Permit' },
  { value: 'ASSESSMENT', label: 'Assessment' },
];

export function FormBuilder({ moduleId, formId, form, structure, counts, permissions }: Props) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();
  const [draft, setDraft] = useState<DraftForm>(() => fromStructure(form, structure as { sections?: Record<string, unknown>[] }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [activeSection, setActiveSection] = useState(0);
  const [fieldEditor, setFieldEditor] = useState<{ index: number; fieldIndex: number } | null>(null);
  const [tableEditor, setTableEditor] = useState<{ sectionIndex: number; tableIndex: number } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [collapseAll, setCollapseAll] = useState(false);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  const update = useCallback((next: DraftForm) => {
    setDraft(next);
    setDirty(true);
  }, []);

  /* ── leaving with unsaved edits ─────────────────────────────────────── */
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  /* ── readiness ──────────────────────────────────────────────────────── */
  const readiness = useMemo(() => {
    const issues: { field: string; message: string }[] = [];
    const keys = new Map<string, string>();
    const activeSections = draft.sections.filter((section) => section.status === 'active');
    if (activeSections.length === 0) issues.push({ field: 'sections', message: 'Add at least one section' });
    if (draft.name.trim().length < 3) issues.push({ field: 'name', message: 'Give the form a name of at least 3 characters' });

    const addKey = (key: string, label: string) => {
      if (!key) {
        issues.push({ field: label, message: `"${label}" has no key` });
        return;
      }
      if (keys.has(key)) issues.push({ field: key, message: `Duplicate key "${key}" (${label})` });
      keys.set(key, label);
    };

    for (const section of draft.sections) {
      if (section.fields.length === 0 && section.tables.length === 0) {
        issues.push({ field: section.title, message: `Section "${section.title}" is empty — add a field or remove it` });
      }
      for (const field of section.fields) {
        addKey(field.field_key, field.label || field.field_type);
        if (['select', 'radio', 'multi_select'].includes(field.field_type) && field.options.length === 0) {
          issues.push({ field: field.field_key, message: `${field.label} is a ${field.field_type} with no options` });
        }
        if (field.field_type === 'formula') {
          if (!field.formula_expression) {
            issues.push({ field: field.field_key, message: `${field.label} has no formula` });
          } else {
            try {
              compileFormula(field.formula_expression);
              for (const identifier of formulaIdentifiers(field.formula_expression)) {
                if (!keys.has(identifier) && !keys.has(identifier.split('.')[0])) {
                  // Only warn for identifiers that are not defined further down the form.
                  const definedLater = draft.sections.some((section2) =>
                    section2.fields.some((f) => f.field_key === identifier)
                    || section2.tables.some((t) => t.table_key === identifier || `${t.table_key}.${''}` === identifier));
                  if (!definedLater) issues.push({ field: field.field_key, message: `${field.label} refers to "${identifier}", which is not a field on this form` });
                }
              }
            } catch (error) {
              issues.push({ field: field.field_key, message: `${field.label}: ${(error as Error).message}` });
            }
          }
        }
        if (field.field_type === 'table' && !field.table_definition_id) {
          issues.push({ field: field.field_key, message: `${field.label} is not linked to a table` });
        }
      }
      for (const table of section.tables) {
        addKey(table.table_key, table.table_name);
        if (table.columns.length === 0) issues.push({ field: table.table_key, message: `${table.table_name} has no columns` });
        for (const column of table.columns) {
          addKey(`${table.table_key}.${column.column_key}`, `${table.table_name} · ${column.column_label}`);
          if (column.column_type === 'formula' && !column.formula_expression) {
            issues.push({ field: column.column_key, message: `${table.table_name} · ${column.column_label} has no formula` });
          }
        }
      }
    }
    if (draft.requires_signature && !draft.sections.some((section) => section.fields.some((field) => field.field_type === 'signature'))) {
      issues.push({ field: 'requires_signature', message: 'The form requires a signature but has no signature field' });
    }
    return issues;
  }, [draft]);

  const stats = useMemo(() => {
    const fields = draft.sections.flatMap((section) => section.fields);
    return {
      sections: draft.sections.length,
      fields: fields.length,
      answerable: fields.filter((field) => !isLayout(field)).length,
      tables: draft.sections.reduce((sum, section) => sum + section.tables.length, 0),
      scored: fields.filter((field) => field.options.some((option) => option.score !== null && option.score !== undefined)
        || field.validation_json?.max_score !== undefined).length
        + draft.sections.flatMap((section) => section.tables).flatMap((table) => table.columns).filter((column) => column.validation_json?.scoring).length,
    };
  }, [draft]);

  /* ── actions ────────────────────────────────────────────────────────── */
  async function save(options: { silent?: boolean } = {}) {
    setSaving(true);
    try {
      const response = await api.put<{ sections: number; fields: number; tables: number }>(
        `/api/admin/dynamic-forms/${formId}`,
        toPayload(draft)
      );
      if (!response.ok) throw new Error(response.message);
      setDirty(false);
      if (!options.silent) {
        const saved = response.data as { sections?: number; fields?: number; tables?: number } | undefined;
        success(`Saved — ${saved?.sections ?? 0} section(s), ${saved?.fields ?? 0} field(s), ${saved?.tables ?? 0} table(s)`);
      }
      return true;
    } catch (error) {
      errorToast((error as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (readiness.length > 0) {
      errorToast(`${readiness.length} item(s) still need attention before publishing`);
      return;
    }
    setPublishing(true);
    try {
      if (dirty && !(await save({ silent: true }))) return;
      const result = await api.post<{ version: number; fields: number }>(`/api/admin/dynamic-forms/${formId}/publish`, {});
      if (!result.ok) throw new Error(result.message);
      const published = result.data as { version?: number; fields?: number } | undefined;
      success(`Form published as v${published?.version ?? '1'} — ${published?.fields ?? 0} field(s) live`);
      router.refresh();
    } catch (error) {
      errorToast((error as Error).message);
    } finally {
      setPublishing(false);
    }
  }

  async function removeForm() {
    try {
      const response = await api.delete(`/api/admin/dynamic-forms/${formId}`);
      if (!response.ok) throw new Error(response.message);
      success('Form deleted');
      router.push(`/admin/dynamic-modules/${moduleId}`);
    } catch (error) {
      errorToast((error as Error).message);
    }
  }

  /* ── structure editing ──────────────────────────────────────────────── */
  const patchSection = (index: number, values: Partial<DraftSection>) =>
    update({ ...draft, sections: draft.sections.map((section, i) => (i === index ? { ...section, ...values } : section)) });

  const addSection = () => {
    const next: DraftSection = {
      key: `s_${Date.now()}`,
      id: null,
      title: `Section ${draft.sections.length + 1}`,
      section_code: null,
      description: null,
      layout_columns: 1,
      is_repeatable: false,
      is_collapsible: false,
      is_collapsed: false,
      show_in_pdf: true,
      page_break_before: false,
      status: 'active',
      fields: [],
      tables: [],
    };
    update({ ...draft, sections: [...draft.sections, next] });
    setActiveSection(draft.sections.length);
  };

  const moveSection = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.sections.length) return;
    const sections = [...draft.sections];
    [sections[index], sections[target]] = [sections[target], sections[index]];
    update({ ...draft, sections });
    setActiveSection(target);
  };

  const moveField = (sectionIndex: number, fieldIndex: number, direction: -1 | 1) => {
    const fields = [...draft.sections[sectionIndex].fields];
    const target = fieldIndex + direction;
    if (target < 0 || target >= fields.length) return;
    [fields[fieldIndex], fields[target]] = [fields[target], fields[fieldIndex]];
    patchSection(sectionIndex, { fields });
  };

  const tableFieldKeys = draft.sections.flatMap((section) => section.tables.map((table) => table.key));

  return (
    <div className="space-y-6">
      {/* ── header ─────────────────────────────────────────────────────── */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-[280px] flex-1 space-y-3">
              <div className="grid gap-3 md:grid-cols-2">
                <Input label="Form name" value={draft.name} onChange={(event) => update({ ...draft, name: event.target.value })} />
                <Input
                  label="Slug"
                  value={draft.slug ?? ''}
                  onChange={(event) => update({ ...draft, slug: event.target.value || null })}
                  helper="Used in URLs and API calls; blank means it is derived from the name."
                />
              </div>
              <Textarea label="Description" rows={2} value={draft.description ?? ''} onChange={(event) => update({ ...draft, description: event.target.value || null })} />
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-2">
                <Badge tone={draft.status === 'published' ? 'success' : draft.status === 'archived' ? 'slate' : 'warning'} dot>
                  {draft.status === 'published' ? `Published v${String(form.version)}` : draft.status}
                </Badge>
                {dirty && <Badge tone="warning">Unsaved changes</Badge>}
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => save()} loading={saving} disabled={!permissions.update || !dirty}>
                  Save
                </Button>
                <Button onClick={publish} loading={publishing} disabled={!permissions.update}>
                  {draft.status === 'published' ? 'Publish new version' : 'Publish form'}
                </Button>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const name = window.prompt('Name for the copy', `${draft.name} (copy)`);
                    if (!name) return;
                    try {
                      const result = await api.post<{ formId: number }>(`/api/admin/dynamic-forms/${formId}/clone`, { name });
                      if (!result.ok) throw new Error(result.message);
                      const clone = result.data as { formId?: number } | undefined;
                      success('Form duplicated');
                      router.push(`/admin/dynamic-modules/${moduleId}/forms/${clone?.formId ?? formId}`);
                    } catch (error) {
                      errorToast((error as Error).message);
                    }
                  }}
                  disabled={!permissions.create}
                >
                  Duplicate
                </Button>
                <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={!permissions.update || counts.total > 0}>
                  Delete
                </Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <StatCard label="Sections" value={stats.sections} />
            <StatCard label="Fields" value={stats.fields} hint={`${stats.answerable} collect an answer`} />
            <StatCard label="Tables" value={stats.tables} />
            <StatCard label="Scored inputs" value={stats.scored} tone="violet" />
          </div>

          {readiness.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-[13px] font-semibold text-amber-800">
                {readiness.length} item{readiness.length === 1 ? '' : 's'} to fix before publishing
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
                {readiness.slice(0, 6).map((issue, index) => (
                  <li key={index}>• {issue.message}</li>
                ))}
                {readiness.length > 6 && <li>• …and {readiness.length - 6} more</li>}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>

      <Tabs
        items={[
          { key: 'builder', label: 'Builder', content: builderTab() },
          { key: 'settings', label: 'Form settings', content: settingsTab() },
          { key: 'preview', label: 'Preview', content: previewTab() },
        ]}
      />

      <FieldEditor
        open={Boolean(fieldEditor)}
        field={fieldEditor ? draft.sections[fieldEditor.index]?.fields[fieldEditor.fieldIndex] ?? null : null}
        draft={draft}
        sectionIndex={fieldEditor?.index ?? 0}
        fieldIndex={fieldEditor?.fieldIndex ?? 0}
        onClose={() => setFieldEditor(null)}
        onChange={(field, sectionIndex, fieldIndex) => {
          patchSection(sectionIndex, {
            fields: draft.sections[sectionIndex].fields.map((entry, i) => (i === fieldIndex ? field : entry)),
          });
        }}
      />

      <TableEditor
        open={Boolean(tableEditor)}
        table={tableEditor ? draft.sections[tableEditor.sectionIndex]?.tables[tableEditor.tableIndex] ?? null : null}
        onChange={(table) => {
          if (!tableEditor) return;
          patchSection(tableEditor.sectionIndex, {
            tables: draft.sections[tableEditor.sectionIndex].tables.map((entry, i) => (i === tableEditor.tableIndex ? table : entry)),
          });
        }}
        onClose={() => setTableEditor(null)}
        onRemove={(table) => {
          if (!tableEditor) return;
          patchSection(tableEditor.sectionIndex, {
            tables: draft.sections[tableEditor.sectionIndex].tables.filter((entry) => entry.key !== table.key),
          });
          setTableEditor(null);
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete this form?"
        message={counts.total > 0
          ? `This form has ${counts.total} submission(s) and cannot be deleted.`
          : 'The form and its structure will be removed. This cannot be undone.'}
        confirmLabel="Delete form"
        onConfirm={() => { setConfirmDelete(false); void removeForm(); }}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );

  /* ── tabs ──────────────────────────────────────────────────────────── */
  function builderTab() {
    return (
      <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-2 lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">Sections</p>
            <Button size="sm" variant="outline" onClick={addSection}>+ Add</Button>
          </div>
          {draft.sections.map((section, index) => (
            <button
              key={section.key}
              type="button"
              onClick={() => {
                setActiveSection(index);
                sectionRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                activeSection === index ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line bg-white hover:bg-surface-muted'
              }`}
            >
              <span className="block truncate font-medium">{section.title}</span>
              <span className="text-xs text-ink-muted">
                {section.fields.length} field(s){section.tables.length ? ` · ${section.tables.length} table(s)` : ''}
              </span>
            </button>
          ))}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-ink-muted">Collapse all</span>
            <Switch checked={collapseAll} onChange={setCollapseAll} label="" />
          </div>
        </aside>

        <div className="space-y-4">
          {draft.sections.map((section, sectionIndex) => (
            <Card key={section.key} padded={false}>
              <div ref={(element) => { sectionRefs.current[sectionIndex] = element; }}>
                <CardHeader
                  title={
                    <Input
                      value={section.title}
                      onChange={(event) => patchSection(sectionIndex, { title: event.target.value })}
                      className="max-w-[420px]"
                    />
                  }
                  description={
                    <Input
                      value={section.description ?? ''}
                      placeholder="Optional instructions for this section"
                      onChange={(event) => patchSection(sectionIndex, { description: event.target.value || null })}
                      className="mt-1 max-w-[520px]"
                    />
                  }
                  action={
                    <div className="flex flex-wrap items-center gap-1">
                      <Select
                        value={String(section.layout_columns)}
                        onChange={(value) => patchSection(sectionIndex, { layout_columns: Number(value) })}
                        options={[{ value: '1', label: '1 column' }, { value: '2', label: '2 columns' }, { value: '3', label: '3 columns' }]}
                      />
                      <Button size="sm" variant="ghost" onClick={() => moveSection(sectionIndex, -1)} aria-label="Move section up">↑</Button>
                      <Button size="sm" variant="ghost" onClick={() => moveSection(sectionIndex, 1)} aria-label="Move section down">↓</Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={draft.sections.length <= 1}
                        onClick={() => update({ ...draft, sections: draft.sections.filter((_, i) => i !== sectionIndex) })}
                      >
                        Remove
                      </Button>
                    </div>
                  }
                />
                <CardBody className="space-y-4">
                  <div className="flex flex-wrap gap-2 rounded-lg border border-dashed border-line bg-surface-muted p-3">
                    {['text', 'textarea', 'number', 'date', 'select', 'radio', 'multi_select', 'file', 'signature', 'heading'].map((type) => (
                      <Button
                        key={type}
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const field = newField(section.fields, {
                            field_type: type,
                            label: type === 'heading' ? 'Heading' : `New ${type.replace(/_/g, ' ')}`,
                          });
                          patchSection(sectionIndex, { fields: [...section.fields, field] });
                          setFieldEditor({ index: sectionIndex, fieldIndex: section.fields.length });
                        }}
                      >
                        + {type.replace(/_/g, ' ')}
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const table = newTable({ table_key: `register_${section.tables.length + 1}`, table_name: `Register ${section.tables.length + 1}` });
                        const tableIdField = newField(section.fields, {
                          field_type: 'table',
                          label: table.table_name,
                          table_definition_id: null,
                        });
                        patchSection(sectionIndex, { tables: [...section.tables, table], fields: [...section.fields, tableIdField] });
                        setTableEditor({ sectionIndex, tableIndex: section.tables.length });
                      }}
                    >
                      + repeatable table
                    </Button>
                  </div>

                  <div className={`grid gap-3 ${section.layout_columns === 1 ? 'grid-cols-1' : section.layout_columns === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3'}`}>
                    {section.fields.map((field, fieldIndex) => (
                      <div
                        key={field.key}
                        className={`rounded-lg border border-line bg-white p-3 transition-shadow hover:shadow-sm ${
                          field.column_width === 12 ? (section.layout_columns === 1 ? '' : 'md:col-span-full') : ''
                        }`}
                        style={section.layout_columns > 1 ? { gridColumn: `span ${Math.min(field.column_width, 12) === 12 ? 2 : 1}` } : undefined}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">
                              {field.label}
                              {field.is_required && <span className="ml-1 text-red-500">*</span>}
                            </p>
                            <p className="truncate font-mono text-[11px] text-ink-muted">{field.field_key}</p>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button size="sm" variant="ghost" onClick={() => moveField(sectionIndex, fieldIndex, -1)} aria-label="Move up">↑</Button>
                            <Button size="sm" variant="ghost" onClick={() => moveField(sectionIndex, fieldIndex, 1)} aria-label="Move down">↓</Button>
                            <Button size="sm" variant="outline" onClick={() => setFieldEditor({ index: sectionIndex, fieldIndex })}>Edit</Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => patchSection(sectionIndex, { fields: section.fields.filter((entry) => entry.key !== field.key) })}
                            >
                              ✕
                            </Button>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Badge tone="slate">{field.field_type.replace(/_/g, ' ')}</Badge>
                          {field.options.length > 0 && <Badge tone="brand">{field.options.length} option(s)</Badge>}
                          {field.options.some((option) => option.score !== null && option.score !== undefined) && <Badge tone="violet">scored</Badge>}
                          {field.field_type === 'formula' && <Badge tone="info">{field.formula_expression || 'no formula'}</Badge>}
                          {field.conditional_json?.rules?.length ? <Badge tone="warning">conditional</Badge> : null}
                          {field.is_unique && <Badge tone="danger">unique</Badge>}
                          {field.status === 'inactive' && <Badge tone="slate">inactive</Badge>}
                        </div>
                      </div>
                    ))}
                    {section.fields.length === 0 && section.tables.length === 0 && (
                      <p className="text-sm text-ink-muted">No fields yet — add one from the palette above.</p>
                    )}
                  </div>

                  {section.tables.map((table, tableIndex) => (
                    <div key={table.key} className="rounded-lg border border-line">
                      <div className="flex items-center justify-between gap-2 border-b border-line bg-surface-muted px-3 py-2">
                        <div>
                          <p className="text-sm font-medium text-ink">{table.table_name}</p>
                          <p className="font-mono text-[11px] text-ink-muted">{table.table_key} · {table.columns.length} column(s)</p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setTableEditor({ sectionIndex, tableIndex })}>Edit table</Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => patchSection(sectionIndex, { tables: section.tables.filter((entry) => entry.key !== table.key) })}
                          >
                            ✕
                          </Button>
                        </div>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="table-base min-w-full">
                          <thead>
                            <tr>
                              {table.show_row_numbers && <th className="table-head w-[50px]">#</th>}
                              {table.columns.map((column: DraftColumn) => (
                                <th key={column.key} className="table-head">
                                  {column.column_label}
                                  {column.is_total && <span className="ml-1 text-[10px] text-brand-600">Σ</span>}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            <tr className="bg-white">
                              {table.show_row_numbers && <td className="table-cell text-ink-muted">1</td>}
                              {table.columns.map((column) => (
                                <td key={column.key} className="table-cell text-ink-muted">
                                  {column.column_type === 'checkbox' ? '☐' : '—'}
                                </td>
                              ))}
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  {tableFieldKeys.length === 0 && null}
                </CardBody>
              </div>
            </Card>
          ))}
          <Button variant="outline" fullWidth onClick={addSection}>+ Add section</Button>
        </div>
      </div>
    );
  }

  function settingsTab() {
    return (
      <Card>
        <CardHeader title="Form settings" description="How the form behaves for the people filling it in, and how it prints." />
        <CardBody className="grid gap-4 md:grid-cols-2">
          <Select
            label="Form type"
            value={draft.form_type}
            onChange={(value) => update({ ...draft, form_type: value })}
            options={FORM_TYPES}
          />
          <Select
            label="Default columns on screen"
            value={String(draft.layout_columns)}
            onChange={(value) => update({ ...draft, layout_columns: Number(value) })}
            options={[{ value: '1', label: 'One column' }, { value: '2', label: 'Two columns' }]}
          />
          <Input
            label="Submission-number prefix"
            value={draft.auto_number_prefix ?? ''}
            placeholder={`e.g. ${draft.name.slice(0, 3).toUpperCase() || 'FRM'}`}
            onChange={(event) => update({ ...draft, auto_number_prefix: event.target.value || null })}
            helper="Numbers are issued as PREFIX/YYYY/000001. Leave blank for SUB/YYYY/000001."
          />
          <Input
            label="Slug"
            value={draft.slug ?? ''}
            onChange={(event) => update({ ...draft, slug: event.target.value || null })}
          />
          <div className="space-y-2 rounded-lg border border-line p-3 md:col-span-2">
            <Switch label="Allow saving a draft" checked={draft.allow_draft} onChange={(checked) => update({ ...draft, allow_draft: checked })} />
            <p className="text-xs text-ink-muted">With drafts off, the form must be completed and submitted in one sitting.</p>
            <Switch label="Requires a signature before submitting" checked={draft.requires_signature} onChange={(checked) => update({ ...draft, requires_signature: checked })} />
            <Switch label="Requires attachments before submitting" checked={draft.requires_attachments} onChange={(checked) => update({ ...draft, requires_attachments: checked })} />
          </div>
        </CardBody>
      </Card>
    );
  }

  function previewTab() {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-[13px] text-brand-800">
          This is exactly what the person filling the form sees — jump between answers to watch conditional logic and formulas react.
        </div>
        <FormRenderer
          mode="preview"
          spec={{
            form: { ...form, ...toPayload(draft) },
            module: { id: moduleId, name: String(form.module_name ?? 'Module') },
            structure: {
              layoutColumns: draft.layout_columns,
              requiresSignature: draft.requires_signature,
              requiresAttachments: draft.requires_attachments,
              sections: draft.sections.map((section) => ({
                id: 0,
                title: section.title,
                description: section.description,
                section_code: section.section_code,
                layout_columns: section.layout_columns,
                is_collapsible: section.is_collapsible,
                is_collapsed: section.is_collapsed,
                sort_order: 0,
                fields: section.fields.map((field) => ({
                  id: 0,
                  section_id: 0,
                  field_key: field.field_key,
                  label: field.label,
                  label_ta: field.label_ta,
                  field_type: field.field_type,
                  placeholder: field.placeholder,
                  help_text: field.help_text,
                  default_value: field.default_value,
                  options: field.options,
                  validation_json: field.validation_json,
                  conditional_json: field.conditional_json,
                  table_definition_id: field.table_definition_id,
                  formula_expression: field.formula_expression,
                  is_required: field.is_required,
                  is_readonly: field.is_readonly,
                  is_unique: field.is_unique,
                  column_width: field.column_width,
                  min_value: field.min_value,
                  max_value: field.max_value,
                  min_length: field.min_length,
                  max_length: field.max_length,
                  regex_pattern: field.regex_pattern,
                })),
                tables: section.tables.map((table) => ({
                  id: 0,
                  table_key: table.table_key,
                  table_name: table.table_name,
                  description: table.description,
                  is_repeatable: table.is_repeatable,
                  min_rows: table.min_rows,
                  max_rows: table.max_rows,
                  show_row_numbers: table.show_row_numbers,
                  show_totals: table.show_totals,
                  columns: table.columns.map((column) => ({
                    id: 0,
                    column_key: column.column_key,
                    column_label: column.column_label,
                    column_label_ta: column.column_label_ta,
                    column_type: column.column_type,
                    options: column.options_json ?? [],
                    formula_expression: column.formula_expression,
                    default_value: column.default_value,
                    is_required: column.is_required,
                    is_editable: column.is_editable,
                    is_total: column.is_total,
                    validation_json: column.validation_json,
                  })),
                })),
              })),
            },
            defaults: {},
            existingDraftId: null,
          } as never}
        />
      </div>
    );
  }
}

export { slugKey };
