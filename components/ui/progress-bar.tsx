'use client';

import clsx from 'clsx';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

export function ProgressBar({ value, max = 100, label, showValue = true, tone = 'brand', height = 8, className }: {
  value: number;
  max?: number;
  label?: ReactNode;
  showValue?: boolean;
  tone?: 'brand' | 'emerald' | 'amber' | 'red';
  height?: number;
  className?: string;
}) {
  const percent = Math.min(Math.max((value / (max || 100)) * 100, 0), 100);
  const tones = { brand: 'bg-brand-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500' };

  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
          {label && <span className="text-ink-soft">{label}</span>}
          {showValue && <span className="font-medium text-ink">{Math.round(percent)}%</span>}
        </div>
      )}
      <div className="w-full overflow-hidden rounded-full bg-slate-200" style={{ height }}>
        <motion.div
          className={clsx('h-full rounded-full', tones[tone])}
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
    </div>
  );
}

export function WizardProgress({ steps, currentIndex, onStepClick, completedSteps = [] }: {
  steps: { key: string; title: string; description?: string }[];
  currentIndex: number;
  onStepClick?: (index: number) => void;
  completedSteps?: string[];
}) {
  const percent = ((currentIndex + 1) / steps.length) * 100;
  return (
    <div>
      <ProgressBar value={percent} label={`Step ${currentIndex + 1} of ${steps.length}`} tone="brand" />
      <ol className="mt-4 hidden flex-wrap gap-1.5 lg:flex">
        {steps.map((step, index) => {
          const isActive = index === currentIndex;
          const isDone = completedSteps.includes(step.key) || index < currentIndex;
          return (
            <li key={step.key}>
              <button
                type="button"
                onClick={() => onStepClick?.(index)}
                className={clsx(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  isActive ? 'bg-brand-500 text-white' : isDone ? 'bg-emerald-50 text-emerald-700' : 'bg-surface-muted text-ink-muted hover:bg-slate-200'
                )}
              >
                <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full text-[11px]', isActive ? 'bg-white/25' : isDone ? 'bg-emerald-200' : 'bg-slate-200')}>
                  {isDone && !isActive ? '✓' : index + 1}
                </span>
                <span className="max-w-[160px] truncate">{step.title}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
