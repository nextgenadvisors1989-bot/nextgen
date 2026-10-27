'use client';

/**
 * Cost-to-company chart for shift-rated workers, the table the client keeps beside the wage register: for each shift wage, the employer's
 * on-costs (PF, ESI, bonus, ex gratia, leave salary, gratuity), the cost of a shift, the cost of a longer working day and the overtime rate.
 * The percentages start from the headings of the client's sheet and every one of them can be changed; nothing here is saved or posted.
 */
import { useMemo, useState } from 'react';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { downloadCsv } from '@/lib/utils/export';

const DEFAULT_RATES = [
  { key: 'pf', label: 'PF', value: 13 },
  { key: 'esi', label: 'ESI', value: 3.25 },
  { key: 'bonus', label: 'Bonus', value: 8.33 },
  { key: 'exgratia', label: 'Ex gratia', value: 3.33 },
  { key: 'leave', label: 'Leave salary', value: 5 },
  { key: 'gratuity', label: 'Gratuity', value: 4.81 },
];
const HOURS = [8.5, 9, 9.5, 10];
const round2 = (value: number) => Math.round(value * 100) / 100;
const fmt = (value: number) => value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function CtcChart() {
  const [from, setFrom] = useState('316');
  const [to, setTo] = useState('460');
  const [step, setStep] = useState('10');
  const [shiftHours, setShiftHours] = useState('8');
  const [otMultiple, setOtMultiple] = useState('2');
  const [rates, setRates] = useState(DEFAULT_RATES.map((rate) => String(rate.value)));

  const rows = useMemo(() => {
    const start = Number(from), end = Number(to), by = Number(step), hours = Number(shiftHours) || 8, multiple = Number(otMultiple) || 2;
    if (!(start > 0) || !(end >= start) || !(by > 0) || (end - start) / by > 400) return [];
    const list = [];
    for (let wage = start; wage <= end + 1e-9; wage += by) {
      const parts = DEFAULT_RATES.map((_, i) => round2((wage * (Number(rates[i]) || 0)) / 100));
      const onCost = round2(parts.reduce((sum, part) => sum + part, 0));
      const ctc = round2(wage + onCost);
      const hourly = wage / hours;
      list.push({ wage, parts, onCost, ctc, otRate: round2(hourly * multiple), longer: HOURS.map((h) => round2(ctc + (h - hours) * hourly * multiple)) });
    }
    return list;
  }, [from, to, step, shiftHours, otMultiple, rates]);

  const headers = ['Shift wage', ...DEFAULT_RATES.map((r) => r.label), 'On-cost', 'CTC per shift', 'OT rate per hour', ...HOURS.map((h) => `${h} hrs CTC`)];
  const table = rows.map((row) => [row.wage, ...row.parts, row.onCost, row.ctc, row.otRate, ...row.longer]);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Chart settings" description="Change a figure and the chart recalculates. Nothing is saved." />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Input label="Shift wage from" type="number" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input label="to" type="number" value={to} onChange={(e) => setTo(e.target.value)} />
            <Input label="Step" type="number" value={step} onChange={(e) => setStep(e.target.value)} />
            <Input label="Shift hours" type="number" value={shiftHours} onChange={(e) => setShiftHours(e.target.value)} />
            <Input label="Overtime multiple" type="number" step="0.25" value={otMultiple} onChange={(e) => setOtMultiple(e.target.value)} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 md:grid-cols-6">
            {DEFAULT_RATES.map((rate, i) => (
              <Input key={rate.key} label={`${rate.label} %`} type="number" step="0.01" value={rates[i]} onChange={(e) => setRates(rates.map((v, j) => (j === i ? e.target.value : v)))} />
            ))}
          </div>
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Cost to company per shift" description={`${rows.length} wage rows. Longer-day columns add the extra hours at the overtime rate.`}
          action={<Button size="sm" variant="outline" disabled={!rows.length} onClick={() => downloadCsv('ctc-chart.csv', headers, table)}>Export CSV</Button>} />
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-line bg-surface-muted text-right text-xs text-ink-muted">
                {headers.map((h, i) => <th key={h} scope="col" className={`px-3 py-2 font-medium ${i === 0 ? 'text-left' : ''}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.map((row) => (
                <tr key={String(row[0])} className="border-b border-line text-right tabular-nums">
                  {row.map((cell, i) => <td key={i} className={`px-3 py-1.5 ${i === 0 ? 'text-left font-medium text-ink' : 'text-ink-soft'}`}>{fmt(Number(cell))}</td>)}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={headers.length} className="px-3 py-8 text-center text-ink-muted">Enter a valid wage range (the end must not be below the start).</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
