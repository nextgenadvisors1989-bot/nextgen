'use client';

/**
 * The settings form engine.
 *
 * Every settings screen is the same three things: a set of typed fields grouped
 * into sections, a save that sends only what changed, and a summary of what the
 * save did. The field renderer is driven entirely by the catalogue in
 * `lib/settings/definitions.ts`, so a new setting appears on screen the moment
 * it is described there — and secrets are never round-tripped: they arrive
 * masked and are only sent when the administrator types a new value.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardBody, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Switch } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { formatDateTime } from '@/lib/utils/dates';

export interface SettingFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'boolean' | 'select' | 'password' | 'email' | 'url';
  fallback: string;
  description?: string;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  secret?: boolean;
  placeholder?: string;
  hint?: string;
  example?: string;
}

export interface SettingSection {
  section: string;
  fields: SettingFieldDefinition[];
}

/** `key → resolved value`, the shape every screen passes in. */
export type ResolvedSettingMap = Record<string, ResolvedValue>;

export interface ResolvedValue {
  key: string;
  displayValue: string;
  isSet: boolean;
  isSecret: boolean;
  updatedAt: string | null;
  updatedByName: string | null;
  customised: boolean;
}

const SECRET_SENTINEL = '••••••••';

function fieldHasChanged(
  field: SettingFieldDefinition,
  value: string,
  initial: ResolvedValue | undefined
): boolean {
  if (field.secret) return value !== '' && value !== SECRET_SENTINEL;
  return (value ?? '') !== (initial?.displayValue ?? '');
}

export function SettingsForm({
  group,
  label,
  sections,
  initial,
  canEdit,
  note,
  sidebar,
}: {
  group: string;
  label: string;
  sections: SettingSection[];
  initial: Record<string, ResolvedValue>;
  canEdit: boolean;
  /** Extra prompt shown above the save button — e.g. "changes apply immediately". */
  note?: string;
  sidebar?: ReactNode;
}) {
  const router = useRouter();
  const { success, error: errorToast } = useToast();

  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.values(initial).map((entry) => [entry.key, entry.isSecret ? (entry.isSet ? SECRET_SENTINEL : '') : entry.displayValue])
    )
  );
  const [changeNote, setChangeNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<Record<string, string>>({});
  // Keys the operator asked to remove outright — sent as null, which is how the
  // API distinguishes "delete this secret" from "leave it alone".
  const [cleared, setCleared] = useState<Record<string, boolean>>({});

  const changedKeys = useMemo(
    () => Object.values(initial).filter((entry) => {
      const field = sections.flatMap((section) => section.fields).find((candidate) => candidate.key === entry.key);
      if (!field) return false;
      if (cleared[entry.key]) return entry.isSet;
      return fieldHasChanged(field, values[entry.key] ?? '', entry);
    }).map((entry) => entry.key),
    [cleared, initial, sections, values]
  );

  const set = (key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setIssues((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  };

  async function save() {
    setSaving(true);
    setIssues({});
    try {
      const fields = sections.flatMap((section) => section.fields);
      const payload: Record<string, string | null> = {};

      for (const field of fields) {
        const value = values[field.key] ?? '';
        const entry = initial[field.key];
        if (cleared[field.key]) {
          payload[field.key] = null as unknown as string;
          continue;
        }
        if (!fieldHasChanged(field, value, entry)) continue;
        // Secrets: '' means "keep the stored value", null clears it.
        payload[field.key] = value === SECRET_SENTINEL ? '' : value;
      }

      if (!Object.keys(payload).length) {
        errorToast('No changes to save');
        return;
      }

      const result = await api.put(`/api/admin/settings/${group}`, {
        values: payload,
        ...(changeNote ? { note: changeNote } : {}),
      });

      if (!result.ok) {
        const mapped: Record<string, string> = {};
        if (Array.isArray(result.errors)) {
          for (const issue of result.errors) mapped[issue.field] = issue.message;
        }
        setIssues(mapped);
        errorToast(result.message);
        return;
      }

      success(result.message);
      setChangeNote('');
      setCleared({});
      // Secret fields go back to masked so the plaintext never lingers in state.
      setValues((current) => {
        const next = { ...current };
        for (const field of fields) {
          if (field.secret && next[field.key] && next[field.key] !== SECRET_SENTINEL) next[field.key] = SECRET_SENTINEL;
        }
        return next;
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        {sections.map((section) => (
          <Card key={section.section}>
            <CardBody className="space-y-5">
              <div>
                <h2 className="section-title">{section.section}</h2>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {section.fields.length} setting{section.fields.length === 1 ? '' : 's'} in this section.
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                {section.fields.map((field) => {
                  const entry = initial[field.key];
                  const value = values[field.key] ?? '';
                  const changed = fieldHasChanged(field, value, entry);
                  const wide = field.type === 'textarea' || field.type === 'text' && (field.key.includes('address'));
                  return (
                    <div key={field.key} className={wide ? 'sm:col-span-2' : undefined}>
                      <SettingField
                        field={field}
                        value={value}
                        changed={changed}
                        entry={entry}
                        disabled={!canEdit}
                        error={issues[field.key]}
                        cleared={Boolean(cleared[field.key])}
                        onChange={(next) => set(field.key, next)}
                        onClear={() => {
                          setCleared((current) => ({ ...current, [field.key]: !current[field.key] }));
                          set(field.key, '');
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </CardBody>
            <CardFooter className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <span className="text-[12px] text-ink-muted">
                {changedKeys.length
                  ? `${changedKeys.length} unsaved change(s) in ${label.toLowerCase()} settings`
                  : 'Everything in this screen is saved'}
              </span>
            </CardFooter>
          </Card>
        ))}

        {canEdit && (
          <Card>
            <CardBody className="space-y-4">
              <div>
                <h2 className="section-title">Save</h2>
                <p className="mt-1 text-[13px] text-ink-muted">
                  {note ?? 'Changes take effect immediately for every user of the platform. Each save is written to the activity log with its previous values.'}
                </p>
              </div>
              <Input
                label="Change note (optional)" value={changeNote} maxLength={300}
                placeholder="Why this is being changed — recorded in the audit log"
                onChange={(event) => setChangeNote(event.target.value)}
              />
              <div className="flex flex-wrap items-center justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setCleared({});
                    setValues(Object.fromEntries(Object.values(initial).map((entry) => [
                      entry.key, entry.isSecret ? (entry.isSet ? SECRET_SENTINEL : '') : entry.displayValue,
                    ])));
                  }}
                  disabled={!changedKeys.length}
                >
                  Discard changes
                </Button>
                <Button onClick={save} loading={saving} disabled={!changedKeys.length}>
                  Save {label.toLowerCase()} settings
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      {sidebar && <div className="space-y-5">{sidebar}</div>}
    </div>
  );
}

function SettingField({
  field,
  value,
  changed,
  entry,
  disabled,
  error,
  cleared,
  onChange,
  onClear,
}: {
  field: SettingFieldDefinition;
  value: string;
  changed: boolean;
  entry: ResolvedValue | undefined;
  disabled?: boolean;
  error?: string;
  cleared?: boolean;
  onChange: (value: string) => void;
  onClear?: () => void;
}) {
  const meta = (
    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-ink-muted">
      {cleared ? <Badge tone="danger">Will be removed</Badge> : changed && <Badge tone="warning">Unsaved</Badge>}
      {entry?.updatedAt && <span>Last saved {formatDateTime(entry.updatedAt)}{entry.updatedByName ? ` by ${entry.updatedByName}` : ''}</span>}
    </span>
  );

  if (field.type === 'boolean') {
    return (
      <div className={`rounded-lg border p-3 ${changed ? 'border-amber-300 bg-amber-50/40' : 'border-line'}`}>
        <Switch
          checked={value === 'true'}
          onChange={(checked) => onChange(checked ? 'true' : 'false')}
          label={field.label}
          disabled={disabled}
        />
        {field.description && <p className="mt-2 text-[12px] text-ink-muted">{field.description}</p>}
        {meta}
      </div>
    );
  }

  if (field.type === 'select') {
    return (
      <div className={`rounded-lg ${changed ? 'rounded-lg ring-1 ring-amber-300' : ''}`}>
        <Select
          label={field.label}
          value={value}
          options={field.options ?? []}
          disabled={disabled}
          error={error}
          onChange={(next) => onChange(next)}
          helper={field.description ?? field.hint}
        />
        {meta}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div className={changed ? 'rounded-lg ring-1 ring-amber-300' : undefined}>
        <Textarea
          label={field.label}
          value={value}
          rows={3}
          disabled={disabled}
          error={error}
          placeholder={field.placeholder ?? field.example}
          helper={field.description ?? field.hint}
          onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value)}
        />
        {meta}
      </div>
    );
  }

  const isSecret = field.type === 'password';
  return (
    <div className={cleared ? 'rounded-lg bg-red-50/40 p-3 ring-1 ring-red-300' : changed ? 'rounded-lg ring-1 ring-amber-300' : undefined}>
      <Input
        label={field.label}
        type={isSecret ? 'password' : field.type === 'number' ? 'number' : 'text'}
        value={cleared ? '' : value}
        disabled={disabled || cleared}
        error={error}
        min={field.min}
        max={field.max}
        placeholder={isSecret ? (entry?.isSet ? 'Leave blank to keep the current value' : 'Not set yet') : field.placeholder ?? field.example}
        helper={field.description ?? field.hint}
        autoComplete={isSecret ? 'new-password' : 'off'}
        onChange={(event) => onChange(event.target.value)}
      />
      {meta}
      {isSecret && entry?.isSet && (
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
          <p>
            Stored value: <span className="font-mono">{entry.displayValue}</span> — the audit log records that it changed, never what it was.
          </p>
          {!disabled && onClear && (
            <button type="button" className="shrink-0 text-red-600 hover:underline" onClick={onClear}>
              {cleared ? 'Keep the stored value' : 'Remove stored value'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
