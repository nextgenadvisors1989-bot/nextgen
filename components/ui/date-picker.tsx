'use client';

import clsx from 'clsx';
import { formatDate, isoDate } from '@/lib/utils/dates';

/**
 * Native date input rendered in the platform's field style. Chosen deliberately:
 * it gives correct localised pickers (including month/year scrubbing) on desktop
 * and mobile without shipping a calendar widget.
 */
/** A control fills its container unless the caller gave it a width of its own (then it sits inline). */
function hasOwnWidth(className?: string): boolean {
  return Boolean(className && /(^|\s)(w|min-w|max-w)-/.test(className));
}

export function DatePicker({ label, value, onChange, error, helper, min, max, disabled, required, placeholder, name, className }: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helper?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  name?: string;
  className?: string;
}) {
  return (
    <div className={clsx(!hasOwnWidth(className) && 'w-full', className)}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <input
        type="date"
        name={name}
        value={isoDate(value)}
        min={min}
        max={max}
        disabled={disabled}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={clsx(
          'focus-ring h-10 w-full rounded-lg border bg-white px-3 text-sm text-ink',
          error ? 'border-red-400' : 'border-line',
          disabled && 'cursor-not-allowed bg-surface-muted'
        )}
      />
      {error ? <p className="error-text">{error}</p> : helper ? <p className="helper">{helper}</p> : null}
    </div>
  );
}

/** From/To range control that keeps `from <= to`. */
export function DateRangePicker({ from, to, onChange, labelFrom = 'From', labelTo = 'To' }: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  labelFrom?: string;
  labelTo?: string;
}) {
  return (
    <div className="flex items-end gap-2">
      <DatePicker
        label={labelFrom}
        value={from}
        max={to || undefined}
        onChange={(value) => onChange({ from: value, to })}
        className="w-[168px]"
      />
      <DatePicker
        label={labelTo}
        value={to}
        min={from || undefined}
        onChange={(value) => onChange({ from, to: value })}
        className="w-[168px]"
      />
    </div>
  );
}

export { formatDate };
