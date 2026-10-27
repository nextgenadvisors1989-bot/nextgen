'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import clsx from 'clsx';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  toast: (input: Omit<Toast, 'id'>) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const STYLES: Record<ToastType, { bar: string; icon: string; iconBg: string }> = {
  success: { bar: 'bg-emerald-500', icon: '✓', iconBg: 'bg-emerald-100 text-emerald-700' },
  error: { bar: 'bg-red-500', icon: '✕', iconBg: 'bg-red-100 text-red-700' },
  warning: { bar: 'bg-amber-500', icon: '!', iconBg: 'bg-amber-100 text-amber-700' },
  info: { bar: 'bg-brand-500', icon: 'i', iconBg: 'bg-brand-100 text-brand-700' },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (input: Omit<Toast, 'id'>) => {
      const id = Math.random().toString(36).slice(2);
      const duration = input.duration ?? 5000;
      setToasts((current) => [...current, { ...input, id }]);
      if (duration > 0) setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      dismiss,
      success: (title, message) => toast({ type: 'success', title, message }),
      error: (title, message) => toast({ type: 'error', title, message, duration: 8000 }),
      warning: (title, message) => toast({ type: 'warning', title, message }),
      info: (title, message) => toast({ type: 'info', title, message }),
    }),
    [toast, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-full max-w-sm flex-col gap-3">
        <AnimatePresence>
          {toasts.map((item) => {
            const style = STYLES[item.type];
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: 60 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 60 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="pointer-events-auto flex overflow-hidden rounded-lg border border-line bg-white shadow-lg"
                role="status"
              >
                <span className={clsx('w-1.5', style.bar)} />
                <div className="flex flex-1 items-start gap-3 p-3.5">
                  <span className={clsx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold', style.iconBg)}>
                    {style.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{item.title}</p>
                    {item.message && <p className="mt-0.5 break-words text-[13px] text-ink-muted">{item.message}</p>}
                  </div>
                  <button type="button" onClick={() => dismiss(item.id)} className="text-ink-muted hover:text-ink" aria-label="Dismiss">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used within a ToastProvider');
  return context;
}
