'use client';

/**
 * Field settings panel.
 *
 * Opened from the builder canvas; edits an in-memory `DraftField`, so nothing is
 * saved until the administrator presses Save on the builder. The panel only shows
 * the settings that mean something for the chosen type (a signature field has no
 * min/max, a heading has no validation at all), which is why the type select sits
 * at the top.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Input, Switch, Checkbox, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FORMULA_FUNCTIONS } from '@/lib/utils/formula';
import {
  CHOICE_TYPES, FIELD_TYPES, isChoice, isLayout, keyVocabulary, localKey,
  type DraftField, type DraftForm, type DraftOption,
} from './builder-types';
import type { ConditionalLogic } from '@/types/dynamic-module';

interface Props {
  open: boolean;
  field: DraftField | null;
  draft: DraftForm;
  sectionIndex: number;
  fieldIndex: number;
  onClose: () => void;
  onChange: (field: DraftField, sectionIndex: number, fieldIndex: number) => void;
}

const CONDITION_OPERATORS: { value: string; label: string }[] = [
  { value: 'equals', label: 'is equal to' },
  { value: 'not_equals', label: 'is not equal to' },
  { value: 'contains', label: 'contains' },
  { value: 'gt', label: 'is greater than' },
  { value: 'lt', label: 'is less than' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

export function FieldEditor({ open, field, draft, sectionIndex, fieldIndex, onClose, onChange }: Props) {
  const [tab, setTab] = useState<'basic' | 'rules' | 'logic'>('basic');
  const vocabulary = useMemo(() => keyVocabulary(draft), [draft]);

  if (!field) return null;
  const patch = (values: Partial<DraftField>) => onChange({ ...field, ...values }, sectionIndex, fieldIndex);

  const layout = isLayout(field);
  const choice = isChoice(field);
  const numeric = ['number', 'decimal', 'currency', 'rating'].includes(field.field_type);
  const scoring = (field.validation_json?.max_score as number | undefined) ?? undefined;
  const conditional = field.conditional_json ?? { action: 'show', match: 'all', rules: [] } as ConditionalLogic;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Field — ${field.label}`}
      width={560}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      }
    >
      <div className="mb-4 flex gap-1 border-b border-line">
        {([['basic', 'Settings'], ['rules', choice ? 'Options' : 'Values'], ['logic', 'Logic']] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              tab === key ? 'border-brand-500 text-brand-600' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'basic' && (
        <div className="space-y-4">
          <Select
            label="Field type"
            value={field.field_type}
            disabled={Boolean(field.id)}
            onChange={(value) => {
              const nextOptions = CHOICE_TYPES.includes(value) && field.options.length === 0
                ? [
                  { key: localKey('o'), option_key: 'yes', option_label: 'Yes', option_label_ta: null, option_value: null, color: null, score: null, is_default: false, sort_order: 0 },
                  { key: localKey('o'), option_key: 'no', option_label: 'No', option_label_ta: null, option_value: null, color: null, score: null, is_default: false, sort_order: 1 },
                ] as DraftOption[]
                : field.options;
              patch({ field_type: value, options: nextOptions });
            }}
            helper={field.id ? 'A saved field keeps its type so historic answers stay readable.' : undefined}
            options={FIELD_TYPES.map((type) => ({ value: type.value, label: `${type.label} · ${type.group}` }))}
          />

          <Input
            label="Label"
            value={field.label}
            required
            onChange={(event) => {
              const label = event.target.value;
              const autoKey = !field.id && (field.field_key === '' || field.field_key === 'field');
              patch(autoKey ? { label, field_key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field' } : { label });
            }}
          />
          <Input
            label="Label (Tamil)"
            value={field.label_ta ?? ''}
            onChange={(event) => patch({ label_ta: event.target.value || null })}
            helper="Printed under the English label on bilingual PDFs."
          />
          <Input
            label="Field key"
            value={field.field_key}
            onChange={(event) => patch({ field_key: event.target.value })}
            helper="Used by formulas and conditions — lower_snake_case."
          />

          {!layout && (
            <>
              <Input label="Placeholder" value={field.placeholder ?? ''} onChange={(event) => patch({ placeholder: event.target.value || null })} />
              <Textarea label="Help text" rows={2} value={field.help_text ?? ''} onChange={(event) => patch({ help_text: event.target.value || null })} />
              <Input label="Default value" value={field.default_value ?? ''} onChange={(event) => patch({ default_value: event.target.value || null })} />
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="label">Width</p>
              <Select
                value={String(field.column_width)}
                onChange={(value) => patch({ column_width: Number(value) })}
                options={[
                  { value: '12', label: 'Full width' },
                  { value: '6', label: 'Half width' },
                  { value: '4', label: 'One third' },
                  { value: '3', label: 'One quarter' },
                ]}
              />
            </div>
            {field.field_type === 'table' && (
              <div>
                <p className="label">Linked table</p>
                <Select
                  value={field.table_definition_id ? String(field.table_definition_id) : ''}
                  placeholder="Choose the table"
                  searchable
                  onChange={(value) => patch({ table_definition_id: Number(value) })}
                  options={draft.sections.flatMap((section) =>
                    section.tables.map((table) => ({ value: table.key, label: `${table.table_name} (${section.title})` })))}
                />
                <p className="mt-1 text-xs text-ink-muted">Matches on the table key when the form is saved.</p>
              </div>
            )}
          </div>

          {field.field_type === 'formula' && (
            <div className="rounded-lg border border-line bg-surface-muted p-3">
              <Input
                label="Formula"
                value={field.formula_expression ?? ''}
                onChange={(event) => patch({ formula_expression: event.target.value || null })}
                placeholder="e.g. (fire_score + water_score) / 2"
                helper={`Functions: ${FORMULA_FUNCTIONS.join(', ')}`}
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {vocabulary.slice(0, 12).map((entry) => (
                  <button
                    key={entry.value}
                    type="button"
                    onClick={() => patch({ formula_expression: `${field.formula_expression ?? ''}${entry.value}` })}
                    className="rounded border border-line bg-white px-1.5 py-0.5 font-mono text-[11px] text-brand-600 hover:bg-brand-50"
                  >
                    {entry.value}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 rounded-lg border border-line p-3">
            <p className="text-[13px] font-semibold text-ink">Behaviour</p>
            <Switch label="Required" checked={field.is_required} onChange={(checked) => patch({ is_required: checked })} />
            <Switch label="Read-only" checked={field.is_readonly} onChange={(checked) => patch({ is_readonly: checked })} />
            <Switch label="Unique (no two submissions may share the answer)" checked={field.is_unique} onChange={(checked) => patch({ is_unique: checked })} />
            <Switch label="Print in the PDF" checked={field.show_in_pdf} onChange={(checked) => patch({ show_in_pdf: checked })} />
            <Switch label="Show in submission lists" checked={field.show_in_list} onChange={(checked) => patch({ show_in_list: checked })} />
            <Switch label="Active" checked={field.status === 'active'} onChange={(checked) => patch({ status: checked ? 'active' : 'inactive' })} />
          </div>
        </div>
      )}

      {tab === 'rules' && (
        <div className="space-y-4">
          {choice && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[13px] font-semibold text-ink">Options</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => patch({
                    options: [...field.options, {
                      key: localKey('o'),
                      option_key: `option_${field.options.length + 1}`,
                      option_label: `Option ${field.options.length + 1}`,
                      option_label_ta: null, option_value: null, color: null, score: null, is_default: false,
                      sort_order: field.options.length,
                    }],
                  })}
                >
                  + Add option
                </Button>
              </div>
              <div className="space-y-2">
                {field.options.map((option, index) => (
                  <div key={option.key} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-line p-2">
                    <div className="col-span-5">
                      <Input
                        label={index === 0 ? 'Label' : undefined}
                        value={option.option_label}
                        onChange={(event) => {
                          const options = [...field.options];
                          options[index] = { ...option, option_label: event.target.value };
                          patch({ options });
                        }}
                      />
                    </div>
                    <div className="col-span-4">
                      <Input
                        label={index === 0 ? 'Key' : undefined}
                        value={option.option_key}
                        onChange={(event) => {
                          const options = [...field.options];
                          options[index] = { ...option, option_key: event.target.value };
                          patch({ options });
                        }}
                      />
                    </div>
                    <div className="col-span-3">
                      <Input
                        label={index === 0 ? 'Score' : undefined}
                        type="number"
                        value={option.score === null || option.score === undefined ? '' : String(option.score)}
                        onChange={(event) => {
                          const options = [...field.options];
                          options[index] = { ...option, score: event.target.value === '' ? null : Number(event.target.value) };
                          patch({ options });
                        }}
                      />
                    </div>
                    <div className="col-span-12 flex items-center justify-between">
                      <Checkbox
                        label="Default"
                        checked={Boolean(option.is_default)}
                        onChange={(event) => {
                          const checked = event.target.checked;
                          const options = field.options.map((entry, entryIndex) => ({
                            ...entry,
                            is_default: entryIndex === index ? checked : (field.field_type === 'multi_select' ? entry.is_default : false),
                          }));
                          patch({ options });
                        }}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => patch({ options: field.options.filter((entry) => entry.key !== option.key) })}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                {field.options.length === 0 && <p className="text-xs text-ink-muted">Add at least one option — the form cannot be published without one.</p>}
              </div>
              <p className="mt-2 text-xs text-ink-muted">
                Scores feed the submission score. A field where every option is scored contributes the chosen option&apos;s score
                (multi-select sums the chosen ones; leave a score blank for penalty options to stay out of the maximum).
              </p>
            </div>
          )}

          {!layout && !choice && (
            <div className="grid grid-cols-2 gap-3">
              <Input label="Minimum" type="number" value={field.min_value === null ? '' : String(field.min_value)} onChange={(event) => patch({ min_value: event.target.value === '' ? null : Number(event.target.value) })} />
              <Input label="Maximum" type="number" value={field.max_value === null ? '' : String(field.max_value)} onChange={(event) => patch({ max_value: event.target.value === '' ? null : Number(event.target.value) })} />
              <Input label="Min length" type="number" value={field.min_length === null ? '' : String(field.min_length)} onChange={(event) => patch({ min_length: event.target.value === '' ? null : Number(event.target.value) })} />
              <Input label="Max length" type="number" value={field.max_length === null ? '' : String(field.max_length)} onChange={(event) => patch({ max_length: event.target.value === '' ? null : Number(event.target.value) })} />
              <div className="col-span-2">
                <Input label="Pattern (regular expression)" value={field.regex_pattern ?? ''} onChange={(event) => patch({ regex_pattern: event.target.value || null })} />
              </div>
              <div className="col-span-2">
                <Input
                  label="Maximum score for this answer"
                  type="number"
                  value={scoring === undefined ? '' : String(scoring)}
                  onChange={(event) => patch({
                    validation_json: {
                      ...(field.validation_json ?? {}),
                      max_score: event.target.value === '' ? undefined : Number(event.target.value),
                    },
                  })}
                  helper={numeric ? 'Set this to make the field count towards the submission score.' : 'Used by scorecards.'}
                />
              </div>
            </div>
          )}

          {['file', 'multi_file', 'image'].includes(field.field_type) && (
            <Input
              label="Maximum files"
              type="number"
              value={String(field.validation_json?.max_files ?? (field.field_type === 'multi_file' ? 20 : 1))}
              onChange={(event) => patch({ validation_json: { ...(field.validation_json ?? {}), max_files: Number(event.target.value) } })}
            />
          )}

          {layout && <p className="text-sm text-ink-muted">Layout fields carry no answer — set the heading text or instructions in the Label field.</p>}
        </div>
      )}

      {tab === 'logic' && (
        <div className="space-y-4">
          <Select
            label="When these rules match"
            value={conditional.action}
            onChange={(value) => patch({ conditional_json: { ...conditional, action: value as ConditionalLogic['action'] } })}
            options={[
              { value: 'show', label: 'Show this field' },
              { value: 'hide', label: 'Hide this field' },
              { value: 'require', label: 'Make this field required' },
              { value: 'disable', label: 'Lock this field' },
            ]}
          />
          <Select
            label="Rule matching"
            value={conditional.match}
            onChange={(value) => patch({ conditional_json: { ...conditional, match: value as ConditionalLogic['match'] } })}
            options={[{ value: 'all', label: 'All rules must match' }, { value: 'any', label: 'Any rule may match' }]}
          />

          <div className="space-y-2">
            {conditional.rules.map((rule, index) => (
              <div key={index} className="grid grid-cols-12 items-end gap-2 rounded-lg border border-line p-2">
                <div className="col-span-5">
                  <Select
                    value={rule.field_key}
                    searchable
                    placeholder="Choose a field"
                    onChange={(value) => {
                      const rules = [...conditional.rules];
                      rules[index] = { ...rule, field_key: value };
                      patch({ conditional_json: { ...conditional, rules } });
                    }}
                    options={vocabulary.filter((entry) => !entry.value.includes('.')).map((entry) => ({ value: entry.value, label: entry.label }))}
                  />
                </div>
                <div className="col-span-4">
                  <Select
                    value={rule.operator}
                    onChange={(value) => {
                      const rules = [...conditional.rules];
                      rules[index] = { ...rule, operator: value as typeof rule.operator };
                      patch({ conditional_json: { ...conditional, rules } });
                    }}
                    options={CONDITION_OPERATORS}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    value={rule.value ?? ''}
                    placeholder="Value"
                    disabled={['is_empty', 'is_not_empty'].includes(rule.operator)}
                    onChange={(event) => {
                      const rules = [...conditional.rules];
                      rules[index] = { ...rule, value: event.target.value };
                      patch({ conditional_json: { ...conditional, rules } });
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => patch({ conditional_json: { ...conditional, rules: [...conditional.rules, { field_key: vocabulary[0]?.value ?? '', operator: 'equals', value: '' }] } })}
          >
            + Add rule
          </Button>

          {conditional.rules.length === 0 && (
            <p className="text-xs text-ink-muted">With no rules the field always shows.</p>
          )}

          {(field.formula_expression || (field.validation_json?.max_score !== undefined)) && (
            <div className="rounded-lg border border-line bg-surface-muted p-3 text-xs text-ink-soft">
              <p className="mb-1 font-semibold text-ink">Participates in scoring</p>
              {field.formula_expression && <p>Formula: <code className="font-mono">{field.formula_expression}</code></p>}
              {field.validation_json?.max_score !== undefined && <p>Maximum score: {String(field.validation_json.max_score)}</p>}
              <Badge tone="info" className="mt-2">Score preview updates on the builder as you edit</Badge>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
