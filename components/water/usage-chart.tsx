'use client';

/**
 * Month-by-month water drawn per day, as bars, with the NOC's approved quantity as a dashed limit line. A bar is green
 * while the month stays inside the limit, amber from 90 percent of it and red above it, so the one thing that matters (are we
 * over the permit?) reads without a legend lookup. Values are always printed above the bars as well.
 */
import type { MonthFigures } from '@/types/water';

const BAR = { 'Within limit': '#059669', 'Near limit': '#d97706', 'Over limit': '#dc2626', 'No data': '#94a3b8' } as const;

function monthLabel(month: string): string {
  const [year, number] = month.split('-').map(Number);
  return new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

export function UsageChart({ months, approvedKld }: { months: MonthFigures[]; approvedKld: number }) {
  if (!months.length) {
    return <p className="py-10 text-center text-sm text-ink-muted">Enter two or more meter readings to see the water drawn each month.</p>;
  }
  const width = 720;
  const height = 240;
  const pad = { top: 26, right: 84, bottom: 34, left: 44 };
  // Round axis: four equal steps of 1, 2, 2.5, 5 or 10 times a power of ten, enough to hold the limit and the highest bar.
  const wanted = Math.max(approvedKld * 1.25, ...months.map((month) => month.avgKld * 1.1), 1);
  const raw = wanted / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? raw;
  const top = step * 4;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const slot = plotWidth / months.length;
  const barWidth = Math.min(46, slot * 0.62);
  const y = (value: number) => pad.top + plotHeight - (value / top) * plotHeight;
  const ticks = [0, 1, 2, 3, 4].map((n) => n * step);

  return (
    <figure>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img"
        aria-label={`Water drawn per day by month against the approved ${Math.round(approvedKld)} kilolitres a day`}>
        {ticks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} stroke="#e2e8f0" strokeWidth="1" />
            <text x={pad.left - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#64748b">{tick}</text>
          </g>
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={y(approvedKld)} y2={y(approvedKld)} stroke="#0f172a" strokeWidth="1.5" strokeDasharray="6 4" />
        <text x={width - pad.right + 8} y={y(approvedKld) - 2} fontSize="11" fontWeight="600" fill="#0f172a">Approved</text>
        <text x={width - pad.right + 8} y={y(approvedKld) + 11} fontSize="11" fontWeight="600" fill="#0f172a">{Math.round(approvedKld)} KLD</text>
        {months.map((month, index) => {
          const x = pad.left + slot * index + (slot - barWidth) / 2;
          const barTop = y(month.avgKld);
          return (
            <g key={month.month}>
              <rect x={x} y={barTop} width={barWidth} height={Math.max(y(0) - barTop, 1)} rx="3" fill={BAR[month.status]}>
                <title>{`${monthLabel(month.month)}: ${month.avgKld.toFixed(1)} KLD (${month.percent === null ? 'no data' : `${month.percent.toFixed(0)}% of the limit`}), ${month.days} day(s) measured`}</title>
              </rect>
              <text x={x + barWidth / 2} y={barTop - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill="#1e293b">{month.avgKld.toFixed(0)}</text>
              <text x={x + barWidth / 2} y={height - 12} textAnchor="middle" fontSize="11" fill="#64748b">{monthLabel(month.month)}</text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <span>Kilolitres per day (KLD), average of the days measured in each month.</span>
        {(['Within limit', 'Near limit', 'Over limit'] as const).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: BAR[status] }} aria-hidden />
            {status}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
