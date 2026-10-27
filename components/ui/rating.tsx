'use client';

import { useState } from 'react';
import clsx from 'clsx';

/** Star rating used by interview assessments and auditor performance reviews. */
export function Rating({ value, onChange, max = 5, size = 22, readOnly, labels, allowHalf, showValue }: {
  value: number;
  onChange?: (value: number) => void;
  max?: number;
  size?: number;
  readOnly?: boolean;
  labels?: string[];
  allowHalf?: boolean;
  showValue?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const display = hover ?? value;

  const handleClick = (index: number, event: React.MouseEvent<HTMLButtonElement>) => {
    if (readOnly || !onChange) return;
    if (allowHalf && event.nativeEvent.offsetX < size / 2) {
      onChange(index + 0.5);
    } else {
      onChange(index + 1);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center" onMouseLeave={() => setHover(null)} role="radiogroup" aria-label="Rating">
        {Array.from({ length: max }).map((_, index) => {
          const filled = display >= index + 1;
          const half = !filled && display >= index + 0.5;
          return (
            <button
              key={index}
              type="button"
              role="radio"
              aria-checked={value === index + 1}
              aria-label={`${index + 1} of ${max}`}
              disabled={readOnly}
              onMouseEnter={() => !readOnly && setHover(index + 1)}
              onClick={(event) => handleClick(index, event)}
              className={clsx('p-0.5 transition-transform', !readOnly && 'hover:scale-110', readOnly && 'cursor-default')}
            >
              <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
                <defs>
                  <linearGradient id={`half-${index}`}>
                    <stop offset="50%" stopColor="#f59e0b" />
                    <stop offset="50%" stopColor="transparent" />
                  </linearGradient>
                </defs>
                <path
                  d="M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.6 6.1 20.7l1.2-6.6-4.8-4.6 6.6-.9L12 2.5z"
                  fill={half ? `url(#half-${index})` : filled ? '#f59e0b' : 'none'}
                  stroke={filled || half ? '#f59e0b' : '#cbd5e1'}
                  strokeWidth="1.6"
                />
              </svg>
            </button>
          );
        })}
      </div>
      {(showValue || labels) && (
        <span className="text-sm text-ink-muted">
          {showValue && <span className="font-medium text-ink">{value.toFixed(1)}</span>}
          {labels && labels[Math.ceil(value) - 1] && <span className="ml-1">— {labels[Math.ceil(value) - 1]}</span>}
        </span>
      )}
    </div>
  );
}
