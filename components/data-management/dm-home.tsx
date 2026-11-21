'use client';

/**
 * The Data Management home: one screen for the management view of the whole factory.
 *   Overview  the KPI dashboard, what waits for verification, unusual figures, treatment-plant quality
 *   Registers every register of the client's framework (PUR-01 ... CMP-01), by module, with how many records the period holds
 *   GHG       Scope 1, 2 and 3 emissions with the factor used for every line
 *   Balances  material balance, water balance, waste balance and stock reconciliation
 */
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { CompanyPicker, NoCompanyYet, PeriodBar, currentFyStart, fmt, fyOf, todayIso, useCatalogue, withCompany, type DmContext } from './dm-common';

interface Kpi { key: string; label: string; value: number | null; unit: string; how: string; note?: string; section: string }
interface Summary {
  company: string; employerId: number; viewer: string; can: { write: boolean; verify: boolean };
  period: { from: string; to: string; label: string; fy: string };
  counts: Record<string, number>; kpis: Kpi[];
  balances: {
    material: { input: number; lines: { label: string; kg: number }[]; unexplained: number | null; closure_pct: number | null };
    water: { input: number; fresh: number; recycled: number; outputs: { label: string; kl: number }[]; difference: number | null; wastewater_pct: number | null; recycled_pct: number | null; departments: { name: string; total: number }[]; sources: { name: string; total: number }[] };
    waste: { generated: number; reuse: number; recycling: number; recovery: number; disposal: number; to_account_for: number; by_stream: { name: string; total: number }[] };
    stock: { material: string; uom: string; book: number | null; physical: number | null; variance: number | null; variance_pct: number | null; date: string }[];
  };
  etp: { parameter: string; n: number; min: number | null; max: number | null; avg: number | null }[];
  exceptions: { register: string; date: string; field: string; item: string; value: number; average: number }[];
  ghg: { scopeT: Record<string, number>; totalT: number; missing: { key: string; activity: string; quantity: number; unit: string }[]; notes: string[] };
  verification: { awaiting: number; rejected: number };
}
interface GhgReport {
  company: string; totalT: number; intensity: number | null; productionMt: number;
  ghg: { lines: { month: string; scope: number; category: string; activity: string; quantity: number; unit: string; ef_code: string | null; factor: number | null; factor_unit: string | null; source: string | null; kg_co2e: number | null; note: string | null }[];
    scopeKg: Record<string, number>; byMonth: { month: string; s1: number; s2: number; s3: number; total: number }[]; missing: { key: string; activity: string; quantity: number; unit: string }[]; mismatched: { activity: string; unit: string; factor_unit: string; ef_code: string }[]; notes: string[] };
}

const VIEWS = [['overview', 'Overview'], ['registers', 'Registers'], ['ghg', 'GHG emissions'], ['balances', 'Balances']] as const;
type View = (typeof VIEWS)[number][0];

export function DataManagementHome({ ctx, viewer }: { ctx: DmContext; viewer: 'employer' | 'employee' | 'auditor' | 'admin' }) {
  const { error: errorToast } = useToast();
  const { catalogue } = useCatalogue();
  const fy = currentFyStart();
  const [view, setView] = useState<View>('overview');
  const [from, setFrom] = useState(fyOf(fy).from);
  const [to, setTo] = useState(todayIso());
  const [summary, setSummary] = useState<Summary | null>(null);
  const [ghg, setGhg] = useState<GhgReport | null>(null);
  const [loading, setLoading] = useState(false);
  const blocked = ctx.needsCompany && !ctx.employerId;

  useEffect(() => {
    if (blocked) return;
    let live = true;
    setLoading(true);
    setSummary(null);
    void api.get(withCompany(`/api/data-management/summary?from=${from}&to=${to}`, ctx.employerId)).then((result) => {
      if (!live) return;
      setLoading(false);
      if (!result.ok) { errorToast(result.message); return; }
      setSummary(result.raw as Summary);
    });
    return () => { live = false; };
  }, [blocked, from, to, ctx.employerId, errorToast]);

  useEffect(() => {
    if (blocked || view !== 'ghg') return;
    let live = true;
    setGhg(null);
    void api.get(withCompany(`/api/data-management/ghg?from=${from}&to=${to}`, ctx.employerId)).then((result) => { if (live && result.ok) setGhg(result.raw as GhgReport); });
    return () => { live = false; };
  }, [blocked, view, from, to, ctx.employerId]);

  return (
    <div className="space-y-5">
      {ctx.needsCompany && <CompanyPicker employerId={ctx.employerId} />}
      {blocked ? <NoCompanyYet /> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-soft">{summary ? <>Company: <strong className="text-ink">{summary.company}</strong> · {summary.period.fy} · {summary.period.label}</> : 'Loading…'}</p>
            {viewer === 'admin' && <Link href="/admin/data-management/factors" className="text-sm font-medium text-brand-700 hover:underline">Emission factors →</Link>}
          </div>
          <PeriodBar from={from} to={to} onChange={(a, b) => { setFrom(a); setTo(b); }} />
          <div role="tablist" aria-label="Data Management" className="flex flex-wrap gap-1 border-b border-line">
            {VIEWS.map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={view === key} onClick={() => setView(key)} className={`focus-ring -mb-px border-b-2 px-4 py-2 text-sm font-medium ${view === key ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink'}`}>{label}</button>
            ))}
          </div>
          {!summary ? <p className="py-10 text-center text-sm text-ink-muted">{loading ? 'Working out the figures…' : ''}</p> : (
            <>
              {view === 'overview' && <Overview summary={summary} ctx={ctx} viewer={viewer} />}
              {view === 'registers' && <Registers summary={summary} ctx={ctx} catalogue={catalogue} viewer={viewer} />}
              {view === 'ghg' && <Ghg report={ghg} summary={summary} viewer={viewer} />}
              {view === 'balances' && <Balances summary={summary} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function Overview({ summary, ctx, viewer }: { summary: Summary; ctx: DmContext; viewer: string }) {
  const sections = [...new Set(summary.kpis.map((kpi) => kpi.section))];
  const empty = Object.values(summary.counts).every((n) => n === 0);
  return (
    <div className="space-y-5">
      {empty && (
        <Card><p className="text-sm text-ink-soft">{summary.can.write ? <>No records in this period yet. Start with <Link href={`${ctx.basePath}/PRO-01`} className="font-medium text-brand-700 underline">the daily production register</Link>, the <Link href={`${ctx.basePath}/ENR-01`} className="font-medium text-brand-700 underline">electricity register</Link> and the <Link href={`${ctx.basePath}/WAT-01`} className="font-medium text-brand-700 underline">water register</Link>; every figure below is worked out from the records.</> : 'No records in this period.'}</p></Card>
      )}
      {summary.can.verify && (summary.verification.awaiting > 0 || summary.verification.rejected > 0) && (
        <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {summary.verification.awaiting > 0 && <><strong>{summary.verification.awaiting}</strong> record{summary.verification.awaiting === 1 ? '' : 's'} entered in this period wait for your verification. Open a register and press Verify. </>}
          {summary.verification.rejected > 0 && <><strong>{summary.verification.rejected}</strong> rejected record{summary.verification.rejected === 1 ? '' : 's'} need correcting.</>}
        </div>
      )}
      {sections.map((section) => (
        <section key={section} aria-labelledby={`kpi-${section}`}>
          <h2 id={`kpi-${section}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{section}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {summary.kpis.filter((kpi) => kpi.section === section).map((kpi) => (
              <div key={kpi.key} className="rounded-lg border border-line bg-white p-4">
                <p className="text-sm font-medium text-ink-soft">{kpi.label}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{kpi.value === null ? '—' : fmt(kpi.value)} <span className="text-sm font-normal text-ink-muted">{kpi.value === null ? '' : kpi.unit}</span></p>
                <p className="mt-1 text-xs text-ink-muted">{kpi.value === null && kpi.note ? kpi.note : kpi.how}</p>
                {kpi.value !== null && kpi.note && <p className="mt-1 text-xs font-medium text-amber-800">{kpi.note}</p>}
              </div>
            ))}
          </div>
        </section>
      ))}
      {summary.etp.some((row) => row.n > 0) && (
        <Card padded={false}>
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Treatment plant quality (WAT-02) — compare with the limits in your consent</h2>
          <table className="w-full text-left text-sm"><thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-2">Parameter</th><th className="px-3 py-2 text-right">Samples</th><th className="px-3 py-2 text-right">Lowest</th><th className="px-3 py-2 text-right">Average</th><th className="px-3 py-2 text-right">Highest</th></tr></thead>
            <tbody className="divide-y divide-line">{summary.etp.filter((row) => row.n > 0).map((row) => <tr key={row.parameter}><td className="px-4 py-2 font-medium uppercase">{row.parameter.replace('_', ' ')}</td><td className="px-3 py-2 text-right tabular-nums">{row.n}</td><td className="px-3 py-2 text-right tabular-nums">{fmt(row.min)}</td><td className="px-3 py-2 text-right tabular-nums">{fmt(row.avg)}</td><td className="px-3 py-2 text-right tabular-nums">{fmt(row.max)}</td></tr>)}</tbody></table>
        </Card>
      )}
      <Card padded={false}>
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Figures that stand out (exception report)</h2>
        {summary.exceptions.length === 0 ? <p className="px-4 py-5 text-sm text-ink-muted">Nothing unusual in this period. A figure is flagged when it is more than twice and three deviations above the average of its own register and item, or when a stock count differs from the book by more than 5%.</p> : (
          <ul className="divide-y divide-line text-sm">{summary.exceptions.map((row, i) => (
            <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"><span><Link href={`${ctx.basePath}/${row.register}${ctx.employerId ? `?employer_id=${ctx.employerId}` : ''}`} className="font-mono text-xs font-semibold text-brand-700 hover:underline">{row.register}</Link> · {row.date} · {row.item || row.field}</span><span className="tabular-nums"><strong>{fmt(row.value)}</strong>{row.average ? <span className="text-ink-muted"> (average {fmt(row.average)})</span> : null}</span></li>
          ))}</ul>
        )}
      </Card>
      {viewer !== 'employer' && <p className="text-xs text-ink-muted">You are looking at this company's records only.</p>}
    </div>
  );
}

function Registers({ summary, ctx, catalogue, viewer }: { summary: Summary; ctx: DmContext; catalogue: ReturnType<typeof useCatalogue>['catalogue']; viewer: string }) {
  if (!catalogue) return null;
  return (
    <div className="space-y-6">
      {catalogue.groups.map((group) => (
        <section key={group} aria-labelledby={`grp-${group}`}>
          <h2 id={`grp-${group}`} className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-muted">{group}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {catalogue.registers.filter((register) => register.group === group).map((register) => (
              <Link key={register.code} href={`${ctx.basePath}/${register.code}${ctx.employerId ? `?employer_id=${ctx.employerId}` : ''}`} className="focus-ring flex flex-col rounded-lg border border-line bg-white p-4 transition-colors hover:border-brand-500">
                <span className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-semibold text-ink-muted">{register.code}</span><Badge tone="slate">{register.frequency}</Badge></span>
                <span className="mt-1 text-sm font-semibold text-ink">{register.name}</span>
                <span className="mt-1 line-clamp-2 text-xs text-ink-muted">{register.description}</span>
                <span className="mt-3 text-sm text-ink-soft"><strong className="tabular-nums text-ink">{summary.counts[register.code] ?? 0}</strong> record{(summary.counts[register.code] ?? 0) === 1 ? '' : 's'} in this period · {summary.can.write && viewer !== 'auditor' ? 'Enter / see' : 'See'}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Ghg({ report, summary, viewer }: { report: GhgReport | null; summary: Summary; viewer: string }) {
  if (!report) return <p className="py-10 text-center text-sm text-ink-muted">Working out the emissions…</p>;
  const g = report.ghg;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {([['Scope 1', g.scopeKg[1]], ['Scope 2', g.scopeKg[2]], ['Scope 3', g.scopeKg[3]]] as const).map(([label, kg]) => (
          <div key={label} className="rounded-lg border border-line bg-white p-4"><p className="text-sm font-medium text-ink-soft">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(Math.round(kg) / 1000)} <span className="text-sm font-normal text-ink-muted">tCO2e</span></p></div>
        ))}
        <div className="rounded-lg border border-brand-300 bg-brand-50 p-4"><p className="text-sm font-medium text-ink-soft">Total</p><p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(report.totalT)} <span className="text-sm font-normal text-ink-muted">tCO2e</span></p></div>
        <div className="rounded-lg border border-line bg-white p-4"><p className="text-sm font-medium text-ink-soft">Carbon intensity</p><p className="mt-1 text-2xl font-semibold tabular-nums">{report.intensity === null ? '—' : fmt(report.intensity, 3)} <span className="text-sm font-normal text-ink-muted">tCO2e / MT</span></p><p className="text-xs text-ink-muted">Production {fmt(report.productionMt)} MT</p></div>
      </div>
      {g.notes.map((note) => <p key={note} className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">{note}{viewer === 'admin' ? <> <Link href="/admin/data-management/factors" className="font-medium underline">Open the emission factors</Link>.</> : null}</p>)}
      {g.missing.length > 0 && (
        <Card padded={false}>
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Activities with no approved emission factor (not counted yet)</h2>
          <ul className="divide-y divide-line text-sm">{g.missing.map((m) => <li key={m.key} className="flex flex-wrap justify-between gap-2 px-4 py-2.5"><span>{m.activity} <span className="font-mono text-xs text-ink-muted">{m.key}</span></span><span className="tabular-nums">{fmt(m.quantity)} {m.unit}</span></li>)}</ul>
          <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">The administrator adds the client's official factor for each of these under Data Management → Emission factors. Until then they add nothing: the platform never uses a factor nobody can name the source of.</p>
        </Card>
      )}
      {g.mismatched.length > 0 && <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">Unit mismatch: {g.mismatched.map((m) => `${m.activity} is recorded in ${m.unit} but factor ${m.ef_code} is per ${m.factor_unit}`).join('; ')}.</p>}
      {g.byMonth.length > 0 && (
        <Card padded={false}>
          <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Month by month (tCO2e)</h2>
          <div className="relative overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-2">Month</th><th className="px-3 py-2 text-right">Scope 1</th><th className="px-3 py-2 text-right">Scope 2</th><th className="px-3 py-2 text-right">Scope 3</th><th className="px-3 py-2 text-right">Total</th></tr></thead>
            <tbody className="divide-y divide-line">{g.byMonth.map((m) => <tr key={m.month}><td className="px-4 py-2 font-medium">{m.month}</td><td className="px-3 py-2 text-right tabular-nums">{fmt(Math.round(m.s1) / 1000, 3)}</td><td className="px-3 py-2 text-right tabular-nums">{fmt(Math.round(m.s2) / 1000, 3)}</td><td className="px-3 py-2 text-right tabular-nums">{fmt(Math.round(m.s3) / 1000, 3)}</td><td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(Math.round(m.total) / 1000, 3)}</td></tr>)}</tbody></table></div>
        </Card>
      )}
      <Card padded={false}>
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Every line: activity × emission factor</h2>
        {g.lines.length === 0 ? <p className="px-4 py-5 text-sm text-ink-muted">No fuel, electricity, transport, waste or other activity records in this period.</p> : (
          <div className="relative overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted"><tr><th className="px-4 py-2">Month</th><th className="px-3 py-2">Scope</th><th className="px-3 py-2">Category · activity</th><th className="px-3 py-2 text-right">Quantity</th><th className="px-3 py-2">Factor</th><th className="px-3 py-2 text-right">kg CO2e</th></tr></thead>
            <tbody className="divide-y divide-line">{g.lines.map((line, i) => (
              <tr key={i} className="align-top"><td className="whitespace-nowrap px-4 py-2">{line.month}</td><td className="px-3 py-2">{line.scope}</td><td className="px-3 py-2">{line.category}<span className="block text-xs text-ink-muted">{line.activity}</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(line.quantity)} {line.unit}</td>
                <td className="px-3 py-2 text-xs">{line.ef_code ? <><span className="font-mono font-semibold">{line.ef_code}</span> = {fmt(line.factor, 6)} per {line.factor_unit}<span className="block text-ink-muted">{line.source}</span></> : <span className="text-amber-800">{line.note}</span>}</td>
                <td className="px-3 py-2 text-right tabular-nums">{line.kg_co2e === null ? '—' : fmt(line.kg_co2e)}</td></tr>
            ))}</tbody></table></div>
        )}
      </Card>
      <p className="text-xs text-ink-muted">Fuel of your own vehicles is counted once, in Scope 1, from the transport registers. Hired vehicles count in Scope 3. Emissions = activity data × emission factor; factors are the administrator's approved register entries. ({summary.company})</p>
    </div>
  );
}

function Balances({ summary }: { summary: Summary }) {
  const b = summary.balances;
  const table = (head: string[], rows: (string | number | null)[][]) => (
    <div className="relative overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-surface-muted text-xs uppercase tracking-wide text-ink-muted"><tr>{head.map((h, i) => <th key={h} className={`px-4 py-2 ${i > 0 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-line">{rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className={`px-4 py-2 ${j > 0 ? 'text-right tabular-nums' : 'font-medium'}`}>{typeof cell === 'number' ? fmt(cell) : cell ?? '—'}</td>)}</tr>)}</tbody></table></div>
  );
  return (
    <div className="space-y-5">
      <Card padded={false}>
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Material balance (kg) — input = output + accumulation</h2>
        {b.material.input === 0 ? <p className="px-4 py-5 text-sm text-ink-muted">Needs the raw material consumed (daily production register PRO-01).</p> : (
          <>
            {table(['', 'kg'], [['Total raw material input', b.material.input], ...b.material.lines.map((l) => [l.label, l.kg]), ['Unexplained difference', b.material.unexplained], ['Balance closure %', b.material.closure_pct]])}
            <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">A difference that is not explained must be investigated (AUD-01), not written off as process loss. The by-products, wastewater-borne material, other losses and accumulation come from the monthly reconciliation register AUD-01.</p>
          </>
        )}
      </Card>
      <Card padded={false}>
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Water balance (KL) — input = product + evaporation + wastewater + other losses + storage change</h2>
        {b.water.input === 0 ? <p className="px-4 py-5 text-sm text-ink-muted">Needs the water intake (register WAT-01).</p> : table(['', 'KL'], [['Fresh water drawn', b.water.fresh], ['Recycled water used', b.water.recycled], ['Total water input', b.water.input], ...b.water.outputs.map((o) => [o.label, o.kl]), ['Balance difference (input - outputs)', b.water.difference], ['Wastewater as % of input', b.water.wastewater_pct], ['Recycled water as % of demand', b.water.recycled_pct]])}
        {b.water.sources.length > 0 && <div className="border-t border-line">{table(['Source', 'KL'], b.water.sources.map((s) => [s.name, s.total]))}</div>}
        {b.water.departments.length > 0 && <div className="border-t border-line">{table(['Department use', 'KL'], b.water.departments.map((s) => [s.name, s.total]))}</div>}
      </Card>
      <Card padded={false}>
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Waste balance (kg)</h2>
        {table(['', 'kg'], [['Waste generated (solid + hazardous + ETP sludge)', b.waste.generated], ['Reused', b.waste.reuse], ['Recycled', b.waste.recycling], ['Recovered', b.waste.recovery], ['Sent for disposal', b.waste.disposal], ['Still to be accounted for (generated - all of the above)', b.waste.to_account_for]])}
        {b.waste.by_stream.length > 0 && <div className="border-t border-line">{table(['Generated by stream', 'kg'], b.waste.by_stream.map((s) => [s.name, s.total]))}</div>}
        <p className="border-t border-line px-4 py-3 text-xs text-ink-muted">What is still to be accounted for is the waste in storage (or an unrecorded movement). A negative figure means more went out than was generated in this period (it came from earlier stock).</p>
      </Card>
      <Card padded={false}>
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold text-ink">Stock reconciliation (latest count of each material)</h2>
        {b.stock.length === 0 ? <p className="px-4 py-5 text-sm text-ink-muted">No stock records in this period (INV-01).</p> : table(['Material', 'Book stock', 'Physical', 'Variance', 'Variance %', 'Counted on'], b.stock.map((s) => [`${s.material} (${s.uom})`, s.book, s.physical, s.variance, s.variance_pct, s.date]))}
      </Card>
    </div>
  );
}
