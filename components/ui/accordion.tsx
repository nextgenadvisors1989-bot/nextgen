'use client';

import { useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';

export interface AccordionItem {
  key: string;
  title: ReactNode;
  subtitle?: ReactNode;
  content: ReactNode;
  badge?: ReactNode;
  disabled?: boolean;
}

export function Accordion({ items, defaultOpen = [], allowMultiple = true, className }: {
  items: AccordionItem[];
  defaultOpen?: string[];
  allowMultiple?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState<string[]>(defaultOpen);

  const toggle = (key: string) => {
    setOpen((current) => {
      if (current.includes(key)) return current.filter((k) => k !== key);
      return allowMultiple ? [...current, key] : [key];
    });
  };

  return (
    <div className={clsx('divide-y divide-line overflow-hidden rounded-lg border border-line bg-white', className)}>
      {items.map((item) => {
        const isOpen = open.includes(item.key);
        return (
          <div key={item.key}>
            <button
              type="button"
              disabled={item.disabled}
              onClick={() => toggle(item.key)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors duration-150 hover:bg-surface-muted disabled:opacity-50"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{item.title}</span>
                  {item.badge}
                </span>
                {item.subtitle && <span className="mt-0.5 block text-xs text-ink-muted">{item.subtitle}</span>}
              </span>
              <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 text-ink-muted">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </motion.span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-line px-5 py-4">{item.content}</div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/** Collapsible titled section used by long detail/edit forms. */
export function CollapsibleSection({ title, description, children, defaultOpen = true, actions, badge }: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-line px-6 py-4">
        <button type="button" onClick={() => setOpen((value) => !value)} className="flex flex-1 items-center gap-2 text-left">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className={clsx('text-ink-muted transition-transform duration-200', open ? 'rotate-90' : '')}>
            <path d="m9 18 6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              {title}
              {badge}
            </span>
            {description && <span className="mt-0.5 block text-xs text-ink-muted">{description}</span>}
          </span>
        </button>
        {actions}
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="px-6 py-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
