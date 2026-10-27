'use client';

import clsx from 'clsx';
import { useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';

export interface TabItem {
  key: string;
  label: string;
  badge?: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export function Tabs({ items, defaultTab, onChange, className, variant = 'underline' }: {
  items: TabItem[];
  defaultTab?: string;
  onChange?: (key: string) => void;
  className?: string;
  variant?: 'underline' | 'pill';
}) {
  const [active, setActive] = useState(defaultTab ?? items[0]?.key);

  const select = (key: string) => {
    setActive(key);
    onChange?.(key);
  };

  const current = items.find((item) => item.key === active) ?? items[0];

  return (
    <div className={className}>
      <div className={clsx('flex gap-1 overflow-x-auto', variant === 'underline' && 'border-b border-line')} role="tablist">
        {items.map((item) => {
          const isActive = item.key === current?.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              disabled={item.disabled}
              onClick={() => select(item.key)}
              className={clsx(
                'relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors duration-150 disabled:opacity-50',
                variant === 'underline'
                  ? isActive
                    ? 'text-brand-600'
                    : 'text-ink-muted hover:text-ink-soft'
                  : clsx('rounded-lg', isActive ? 'bg-brand-500 text-white' : 'text-ink-soft hover:bg-surface-muted')
              )}
            >
              <span className="inline-flex items-center gap-2">
                {item.label}
                {item.badge}
              </span>
              {variant === 'underline' && isActive && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute inset-x-0 -bottom-px h-[3px] bg-brand-500"
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                />
              )}
            </button>
          );
        })}
      </div>
      <div className="animate-fade-up pt-5" role="tabpanel">
        {current?.content}
      </div>
    </div>
  );
}
