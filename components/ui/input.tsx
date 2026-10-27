'use client';

import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import clsx from 'clsx';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helper?: string;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  requiredMark?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, helper, leftIcon, rightIcon, requiredMark, className, id, required, ...rest },
  ref
) {
  const inputId = id ?? rest.name ?? `input-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
          {(required || requiredMark) && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        {leftIcon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted">{leftIcon}</span>}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={Boolean(error)}
          className={clsx(
            'focus-ring h-10 w-full rounded-lg border bg-white px-3 text-sm text-ink placeholder:text-slate-400',
            'disabled:cursor-not-allowed disabled:bg-surface-muted',
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            error ? 'border-red-400' : 'border-line',
            className
          )}
          {...rest}
        />
        {rightIcon && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted">{rightIcon}</span>}
      </div>
      {error ? <p className="error-text">{error}</p> : helper ? <p className="helper">{helper}</p> : null}
    </div>
  );
});

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helper?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, helper, className, id, rows = 3, required, ...rest },
  ref
) {
  const inputId = id ?? rest.name ?? `textarea-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        required={required}
        aria-invalid={Boolean(error)}
        className={clsx(
          'focus-ring w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink placeholder:text-slate-400',
          error ? 'border-red-400' : 'border-line',
          className
        )}
        {...rest}
      />
      {error ? <p className="error-text">{error}</p> : helper ? <p className="helper">{helper}</p> : null}
    </div>
  );
});

export function Checkbox({
  label,
  error,
  className,
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; error?: string }) {
  const inputId = id ?? rest.name ?? `checkbox-${Math.random().toString(36).slice(2, 9)}`;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-soft">
        <input
          id={inputId}
          type="checkbox"
          className="focus-ring mt-0.5 h-4 w-4 rounded border-line text-brand-500 accent-brand-500"
          {...rest}
        />
        {label && <span>{label}</span>}
      </label>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  name,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 text-sm text-ink-soft">
      <button
        type="button"
        role="switch"
        name={name}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'focus-ring relative h-5 w-9 rounded-full transition-colors duration-200 disabled:opacity-50',
          checked ? 'bg-brand-500' : 'bg-slate-300'
        )}
      >
        <span
          className={clsx(
            'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'left-[18px]' : 'left-0.5'
          )}
        />
      </button>
      {label && <span>{label}</span>}
    </label>
  );
}
