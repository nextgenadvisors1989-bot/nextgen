'use client';

import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

export interface GridField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'date' | 'email' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
  width?: string;
  required?: boolean;
}

/**
 * Compact add/remove table used by the wizard's collection steps and by the
 * employee detail tabs. Rows are held in component state and submitted with the
 * parent form, so nothing is lost when the user steps backwards.
 */
export function RecordGrid({
  title, description, fields, rows, onChange, emptyText,
}: {
  title: string;
  description?: string;
  fields: GridField[];
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
  emptyText?: string;
}) {
  const addRow = () => onChange([...rows, Object.fromEntries(fields.map((f) => [f.key, '']))]);

  const updateCell = (index: number, key: string, value: string) =>
    onChange(rows.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)));

  const removeRow = (index: number) => onChange(rows.filter((_, rowIndex) => rowIndex !== index));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-ink-muted">{description}</p>}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addRow}>Add Row</Button>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-ink-muted">
          {emptyText ?? `No rows yet — use “Add Row” to start.`}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="table-base">
            <thead>
              <tr>
                <th className="table-head w-[50px] text-center">#</th>
                {fields.map((field) => (
                  <th key={field.key} className="table-head" style={{ minWidth: field.width ?? '140px' }}>
                    {field.label}{field.required && <span className="text-red-500"> *</span>}
                  </th>
                ))}
                <th className="table-head w-[70px] text-center">Remove</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  <td className="table-cell text-center text-ink-muted">{index + 1}</td>
                  {fields.map((field) => (
                    <td key={field.key} className="table-cell">
                      {field.type === 'select' ? (
                        <Select
                          options={field.options ?? []}
                          value={row[field.key] ?? ''}
                          onChange={(value) => updateCell(index, field.key, value)}
                          placeholder={field.placeholder ?? 'Select…'}
                          size="sm"
                        />
                      ) : (
                        <input
                          type={field.type ?? 'text'}
                          value={row[field.key] ?? ''}
                          placeholder={field.placeholder}
                          required={field.required}
                          onChange={(event) => updateCell(index, field.key, event.target.value)}
                          className="focus-ring w-full rounded-lg border border-line px-3 py-1.5 text-sm"
                          aria-label={`${field.label} row ${index + 1}`}
                        />
                      )}
                    </td>
                  ))}
                  <td className="table-cell text-center">
                    <button type="button" onClick={() => removeRow(index)} className="btn-icon btn-icon-danger"
                      title={`Remove row ${index + 1}`} aria-label={`Remove row ${index + 1}`}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                        <path d="M18 6 6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Options shared by the wizard's grids and the detail-tab modals. */
export const RELATIONSHIP_OPTIONS = [
  'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Brother', 'Sister', 'Guardian', 'Other',
].map((value) => ({ value, label: value }));

export const GENDER_OPTIONS = ['Male', 'Female', 'Other'].map((value) => ({ value, label: value }));

/** Matches the employee_interviews.recommendation enum exactly. */
export const RECOMMENDATION_OPTIONS = ['Recommended', 'On Hold', 'Not Recommended'].map((value) => ({ value, label: value }));
