'use client';

import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';

/** Side panel used for filters, quick views and record previews on narrow screens. */
export function Drawer({ open, onClose, title, children, footer, side = 'right', width = 420 }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'left' | 'right';
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-slate-900/40"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: side === 'right' ? width : -width }}
            animate={{ x: 0 }}
            exit={{ x: side === 'right' ? width : -width }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            style={{ width, maxWidth: '90vw' }}
            className={`absolute top-0 flex h-full flex-col bg-white shadow-2xl ${side === 'right' ? 'right-0' : 'left-0'}`}
            role="dialog"
            aria-modal="true"
          >
            <header className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-base font-semibold text-ink">{title}</h2>
              <button type="button" onClick={onClose} className="rounded p-1 text-ink-muted hover:bg-surface-muted" aria-label="Close panel">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && <footer className="border-t border-line px-5 py-4">{footer}</footer>}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}
