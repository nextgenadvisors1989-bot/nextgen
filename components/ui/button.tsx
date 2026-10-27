'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 focus:ring-brand-500/40',
  secondary: 'bg-slate-700 text-white hover:bg-slate-800 focus:ring-slate-500/40',
  outline: 'border border-line bg-white text-ink-soft hover:bg-surface-muted focus:ring-brand-500/30',
  ghost: 'bg-transparent text-ink-soft hover:bg-surface-muted focus:ring-brand-500/30',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500/40',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500/40',
  warning: 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500/40',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
  icon: 'h-9 w-9 p-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, fullWidth, className, children, disabled, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-all duration-150 ease-in-out',
        'focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60',
        'hover:-translate-y-[2px] active:translate-y-0',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className
      )}
      {...rest}
    >
      {loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export interface LinkButtonProps {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

/** Same visual language as Button but renders a Next.js link. */
export function LinkButton({ href, variant = 'primary', size = 'md', className, children, leftIcon, rightIcon }: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={clsx(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg font-medium transition-all duration-150 ease-in-out',
        'hover:-translate-y-[2px]',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
    >
      {leftIcon}
      {children}
      {rightIcon}
    </Link>
  );
}
