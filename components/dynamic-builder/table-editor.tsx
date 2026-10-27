'use client';

/**
 * Repeatable-table editor.
 *
 * A table field is where auditors and employers enter lists (registers, vehicles,
 * PPE issues, wage heads…). Each column carries its own type, width, validation
 * and — for scoring tables — the marks a cell is worth, which is how the
 * submission score is rolled up.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Input, Switch, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { localKey, slugKey, type DraftColumn, type DraftTable } from './builder-types';
import type { FieldOption } from '@/types/dynamic-module';

const COLUMN_TYPES: { value: string; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'number', label: 'Whole number' },
  { value: 'decimal', label: 'Decimal' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'time', label: 'Time' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Yes / No' },
  { value: 'file', label: 'File' },
  { value: 'formula', label: 'Calculated' },
  { value: 'auto_number', label: 'Auto number (row)' },
];

interface Props {
  open: boolean;
  table: DraftTable | null;
  onChange: (table: DraftTable) => void;
  onClose: () => void;
  onRemove?: (table: DraftTable) => void;
}

export function TableEditor({ open, table, onChange, onClose, onRemove }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!table) return null;

  const patch = (values: Partial<DraftTable>) => onChange({ ...table, ...values });
  const patchColumn = (key: string, values: Partial<DraftColumn>) =>
    patch({ columns: table.columns.map((column) => (column.key === key ? { ...column, ...values } : column)) });

  const moveColumn = (index: number, direction: -1 | 1) => {
    const next = [...table.columns];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch({ columns: next });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      title={`Table — ${table.table_name}`}
      description="Rows are entered by the person filling the form; totals and scores roll up automatically."
      footer={
        <div className="flex w-full items-center justify-between">
          {onRemove ? (
            <Button variant="danger" size="sm" onClick={() => onRemove(table)}>Remove table</Button>
          ) : <span />}
          <Button onClick={onClose}>Done</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Table name"
            value={table.table_name}
            onChange={(event) => patch({ table_name: event.target.value })}
          />
          <Input
            label="Table key"
            value={table.table_key}
            onChange={(event) => patch({ table_key: event.target.value })}
            helper="Formulas reference totals as table_key.column_key."
          />
          <Input label="Tamil name" value={table.table_name_ta ?? ''} onChange={(event) => patch({ table_name_ta: event.target.value || null })} />
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Minimum rows"
              type="number"
              value={String(table.min_rows)}
              onChange={(event) => patch({ min_rows: Number(event.target.value) })}
            />
            <Input
              label="Maximum rows"
              type="number"
              value={table.max_rows === null ? '' : String(table.max_rows)}
              onChange={(event) => patch({ max_rows: event.target.value === '' ? null : Number(event.target.value) })}
            />
          </div>
          <div className="col-span-2">
            <Textarea label="Description" rows={2} value={table.description ?? ''} onChange={(event) => patch({ description: event.target.value || null })} />
          </div>
          <div className="col-span-2 grid grid-cols-2 gap-2 rounded-lg border border-line p-3 md:grid-cols-4">
            <Switch label="Repeatable" checked={table.is_repeatable} onChange={(checked) => patch({ is_repeatable: checked })} />
            <Switch label="Row numbers" checked={table.show_row_numbers} onChange={(checked) => patch({ show_row_numbers: checked })} />
            <Switch label="Totals strip" checked={table.show_totals} onChange={(checked) => patch({ show_totals: checked })} />
            <Switch label="Print in PDF" checked={table.show_in_pdf} onChange={(checked) => patch({ show_in_pdf: checked })} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">Columns ({table.columns.length})</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => patch({
                columns: [...table.columns, {
                  key: localKey('c'),
                  id: null,
                  column_key: `column_${table.columns.length + 1}`,
                  column_label: `Column ${table.columns.length + 1}`,
                  column_label_ta: null,
                  column_type: 'text',
                  options_json: null,
                  formula_expression: null,
                  default_value: null,
                  width_pct: 20,
                  is_required: false,
                  is_editable: true,
                  is_sortable: false,
                  is_total: false,
                  show_in_pdf: true,
                  validation_json: null,
                  status: 'active',
                }],
              })}
            >
              + Add column
            </Button>
          </div>

          <div className="overflow-hidden rounded-lg border border-line">
            <table className="table-base min-w-full">
              <thead>
                <tr>
                  <th className="table-head">Label</th>
                  <th className="table-head">Key</th>
                  <th className="table-head">Type</th>
                  <th className="table-head text-right">Width %</th>
                  <th className="table-head text-center">Scoring</th>
                  <th className="table-head text-right">Order</th>
                </tr>
              </thead>
              <tbody>
                {table.columns.map((column, index) => (
                  <tr key={column.key} className="bg-white">
                    <td className="table-cell">
                      <Input
                        value={column.column_label}
                        onChange={(event) => {
                          const label = event.target.value;
                          const autoKey = !column.id && /^column_\d+$/.test(column.column_key);
                          patchColumn(column.key, autoKey ? { column_label: label, column_key: slugKey(label, 'column') } : { column_label: label });
                        }}
                      />
                    </td>
                    <td className="table-cell">
                      <Input value={column.column_key} onChange={(event) => patchColumn(column.key, { column_key: event.target.value })} />
                    </td>
                    <td className="table-cell">
                      <Select
                        value={column.column_type}
                        onChange={(value) => patchColumn(column.key, {
                          column_type: value,
                          options_json: ['select'].includes(value) && !column.options_json ? [{ option_key: 'yes', option_label: 'Yes' }] : column.options_json,
                        })}
                        options={COLUMN_TYPES}
                      />
                    </td>
                    <td className="table-cell text-right">
                      <Input
                        type="number"
                        value={column.width_pct === null || column.width_pct === undefined ? '' : String(column.width_pct)}
                        onChange={(event) => patchColumn(column.key, { width_pct: event.target.value === '' ? null : Number(event.target.value) })}
                        className="w-20 text-right"
                      />
                    </td>
                    <td className="table-cell text-center">
                      {column.validation_json?.scoring
                        ? (
                          <Badge tone="success">
                            {`Scores ${typeof column.validation_json.max_per_row === 'number' ? column.validation_json.max_per_row : '?'} per row`}
                          </Badge>
                        )
                        : <span className="text-xs text-ink-muted">—</span>}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => moveColumn(index, -1)} aria-label="Move up">↑</Button>
                        <Button size="sm" variant="ghost" onClick={() => moveColumn(index, 1)} aria-label="Move down">↓</Button>
                        <Button size="sm" variant="outline" onClick={() => setExpanded(expanded === column.key ? null : column.key)}>
                          {expanded === column.key ? 'Close' : 'Settings'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={table.columns.length <= 1}
                          onClick={() => patch({ columns: table.columns.filter((entry) => entry.key !== column.key) })}
                        >
                          ✕
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {expanded && (() => {
            const column = table.columns.find((entry) => entry.key === expanded);
            if (!column) return null;
            return (
              <div className="mt-2 space-y-3 rounded-lg border border-line bg-surface-muted p-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <Switch label="Required" checked={column.is_required} onChange={(checked) => patchColumn(column.key, { is_required: checked })} />
                  <Switch label="Editable" checked={column.is_editable} onChange={(checked) => patchColumn(column.key, { is_editable: checked })} />
                  <Switch label="Show total" checked={column.is_total} onChange={(checked) => patchColumn(column.key, { is_total: checked })} />
                  <Switch label="Print in PDF" checked={column.show_in_pdf} onChange={(checked) => patchColumn(column.key, { show_in_pdf: checked })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Calculated when set"
                    value={column.formula_expression ?? ''}
                    placeholder="e.g. quantity * rate"
                    onChange={(event) => patchColumn(column.key, { formula_expression: event.target.value || null })}
                    helper="Row formulas may use other columns of the same row."
                  />
                  <Input
                    label="Default value"
                    value={column.default_value ?? ''}
                    onChange={(event) => patchColumn(column.key, { default_value: event.target.value || null })}
                  />
                </div>
                {['number', 'decimal', 'currency', 'formula'].includes(column.column_type) && (
                  <div className="rounded-lg border border-line bg-white p-3">
                    <Switch
                      label="Count these cells towards the submission score"
                      checked={Boolean(column.validation_json?.scoring)}
                      onChange={(checked) => patchColumn(column.key, {
                        validation_json: { ...(column.validation_json ?? {}), scoring: checked },
                      })}
                    />
                    {Boolean(column.validation_json?.scoring) && (
                      <div className="mt-2 max-w-[220px]">
                        <Input
                          label="Maximum marks per row"
                          type="number"
                          value={String(column.validation_json?.max_per_row ?? 1)}
                          onChange={(event) => patchColumn(column.key, {
                            validation_json: { ...(column.validation_json ?? {}), max_per_row: Number(event.target.value) },
                          })}
                        />
                      </div>
                    )}
                  </div>
                )}
                {column.column_type === 'select' && (
                  <div>
                    <p className="label">Dropdown options</p>
                    <div className="space-y-2">
                      {(column.options_json ?? []).map((option, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2">
                          <div className="col-span-5">
                            <Input
                              value={option.option_label}
                              onChange={(event) => {
                                const options = [...(column.options_json ?? [])];
                                options[index] = { ...options[index], option_label: event.target.value };
                                patchColumn(column.key, { options_json: options });
                              }}
                            />
                          </div>
                          <div className="col-span-5">
                            <Input
                              value={option.option_key}
                              onChange={(event) => {
                                const options = [...(column.options_json ?? [])];
                                options[index] = { ...options[index], option_key: event.target.value };
                                patchColumn(column.key, { options_json: options });
                              }}
                            />
                          </div>
                          <div className="col-span-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => patchColumn(column.key, { options_json: (column.options_json ?? []).filter((_, i) => i !== index) })}
                            >
                              ✕
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => patchColumn(column.key, {
                        options_json: [...(column.options_json ?? []), { option_key: `option_${(column.options_json ?? []).length + 1}`, option_label: 'New option' } as FieldOption],
                      })}
                    >
                      + Add option
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </Modal>
  );
}
