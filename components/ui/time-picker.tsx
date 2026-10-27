'use client';

import clsx from 'clsx';

/** Time field (HH:MM, 24-hour storage) with an optional duration helper. */
export function TimePicker({ label, value, onChange, error, helper, required, disabled, step = 900, name, className }: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  helper?: string;
  required?: boolean;
  disabled?: boolean;
  step?: number;
  name?: string;
  className?: string;
}) {
  return (
    <div className={clsx('w-full', className)}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <input
        type="time"
        name={name}
        value={value ?? ''}
        step={step}
        disabled={disabled}
        required={required}
        onChange={(event) => onChange(event.target.value)}
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

/** Tick-box week grid for selecting weekly off days / shift patterns. */
export function WeekdayPicker({ value, onChange, label }: { value: string[]; onChange: (days: string[]) => void; label?: string }) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return (
    <div>
      {label && <label className="label">{label}</label>}
      <div className="flex flex-wrap gap-1.5">
        {days.map((day) => {
          const active = value.includes(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onChange(active ? value.filter((d) => d !== day) : [...value, day])}
              className={clsx(
                'rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors',
                active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-line bg-white text-ink-soft hover:bg-surface-muted'
              )}
            >
              {day.slice(0, 3)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
