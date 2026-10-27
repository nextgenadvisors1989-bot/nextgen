'use client';

/**
 * The employee's working day, laid out as the client sketched the profile: Active / Long leave / Exit, wage today / this week / this
 * month, working days and hours, employee and working status, then a hide-and-view profile (benefits, salary slip, deductions, PF / UAN,
 * full and final) and the three actions at work: check in, permission, check out, with the work duration beside them.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card, CardBody, CardHeader, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Spinner } from '@/components/ui/loader';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/utils/api-client';
import { downloadFromApi } from '@/lib/utils/export';
import { formatCurrency } from '@/lib/utils/formatting';
import { formatDate } from '@/lib/utils/dates';

interface Workday {
  employee: { id: number; name: string; employeeNumber: string; designation: string | null; department: string | null; company: string; joined: string | null; workforceOrigin: string | null; employmentType: string | null };
  status: 'Active' | 'Long leave' | 'Exit';
  longLeave: { from: string; to: string; days: number } | null;
  wage: { perDay: number; today: number; week: number; month: number };
  month: { label: string; workingDays: number; workingHours: number };
  today: { status: string; inTime: string | null; outTime: string | null; workedHours: number | null } | null;
  benefits: { bonus: number; incentive: number; arrears: number; increments: { from: string; gross: number; reason: string | null }[] };
  deductions: { period: string; total: number; esi: number; pf: number; other: number; damageOrLoss: number; absenceFromDuty: number; advanceRecovery: number } | null;
  statutory: { pf: string | null; uan: string | null; esi: string | null };
  payslipId: number | null;
  settlement: { id: number; number: string; status: string; net: number } | null;
  permissions: { id: number; date: string; from: string; to: string; minutes: number; reason: string; status: string }[];
}

const ORIGINS = ['State local', 'Migrant'];
const TYPES = ['Permanent', 'Temporary', 'Contract'];
const STATUSES: Workday['status'][] = ['Active', 'Long leave', 'Exit'];
const money = (value: number) => formatCurrency(value, { decimals: 2 });
const clock = (value: string | null) => (value ? value.slice(0, 5) : '--:--');

function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-medium ${on ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-ink-muted'}`} aria-current={on ? 'true' : undefined}>
      {children}
    </span>
  );
}

/** Time since the check-in, ticking each minute while the employee is still in. */
function useElapsed(inTime: string | null | undefined, outTime: string | null | undefined, workedHours: number | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!inTime || outTime) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [inTime, outTime]);
  if (!inTime) return null;
  let minutes: number;
  if (outTime && workedHours !== null && workedHours !== undefined) {
    minutes = Math.round(workedHours * 60);
  } else {
    const [h, m] = inTime.split(':').map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);
    minutes = Math.max(0, Math.round((now - start.getTime()) / 60000));
  }
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

export function MyWorkday() {
  const toast = useToast();
  const [data, setData] = useState<Workday | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(true);
  const [permissionOpen, setPermissionOpen] = useState(false);
  const [permission, setPermission] = useState({ date: new Date().toISOString().slice(0, 10), from: '', to: '', reason: '' });
  const [permissionErrors, setPermissionErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const response = await api.get<Workday | null>('/api/employee/workday');
    if (response.ok) setData(response.data ?? null);
    else toast.error(response.message);
    setLoading(false);
  }, [toast]);
  useEffect(() => { void load(); }, [load]);

  const elapsed = useElapsed(data?.today?.inTime, data?.today?.outTime, data?.today?.workedHours);

  async function punch(action: 'in' | 'out') {
    setBusy(action);
    const response = await api.post('/api/employee/workday/punch', { action });
    setBusy(null);
    if (response.ok) { toast.success(response.message); await load(); } else toast.error(response.message);
  }

  async function sendPermission() {
    setBusy('permission');
    setPermissionErrors({});
    const response = await api.post('/api/employee/permissions', permission);
    setBusy(null);
    if (response.ok) {
      toast.success(response.message);
      setPermissionOpen(false);
      setPermission({ ...permission, from: '', to: '', reason: '' });
      await load();
      return;
    }
    const list = Array.isArray(response.errors) ? response.errors : [];
    const mapped: Record<string, string> = {};
    for (const item of list) mapped[item.field] = item.message;
    setPermissionErrors(Object.keys(mapped).length ? mapped : { reason: response.message });
  }

  async function withdraw(id: number) {
    const response = await api.delete(`/api/employee/permissions/${id}`);
    if (response.ok) { toast.success(response.message); await load(); } else toast.error(response.message);
  }

  /** Opens the phone's share sheet (WhatsApp, e-mail ...) with the slip attached; falls back to a plain download. */
  async function share(url: string, filename: string) {
    setBusy('share');
    try {
      const file = await fetch(url, { credentials: 'same-origin' }).then(async (r) => (r.ok ? new File([await r.blob()], filename, { type: 'application/pdf' }) : null));
      if (!file) { toast.error('The salary slip could not be prepared'); return; }
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      if (nav.canShare?.({ files: [file] })) await nav.share({ files: [file], title: 'Salary slip' });
      else { await downloadFromApi(url, filename); toast.info('Sharing is not available on this device, so the slip was downloaded. Attach it to an e-mail or WhatsApp message.'); }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast.error('The salary slip could not be shared');
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <div className="flex justify-center py-10"><Spinner /></div>;
  if (!data) return null;
  const { employee, wage, month, today, benefits, deductions, statutory } = data;
  const checkedIn = Boolean(today?.inTime);
  const checkedOut = Boolean(today?.outTime);
  const slip = data.payslipId ? `/api/employee/payslips/${data.payslipId}/download` : null;

  return (
    <div className="space-y-5">
      <Card>
        <CardBody>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl font-semibold text-brand-700" aria-hidden>
                {employee.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}
              </span>
              <dl className="space-y-0.5 text-sm">
                <div className="flex gap-2"><dt className="w-28 text-ink-muted">Name</dt><dd className="font-semibold text-ink">{employee.name}</dd></div>
                <div className="flex gap-2"><dt className="w-28 text-ink-muted">ID No.</dt><dd className="text-ink">{employee.employeeNumber}</dd></div>
                <div className="flex gap-2"><dt className="w-28 text-ink-muted">Designation</dt><dd className="text-ink">{employee.designation ?? '-'}</dd></div>
                <div className="flex gap-2"><dt className="w-28 text-ink-muted">Department</dt><dd className="text-ink">{employee.department ?? '-'}</dd></div>
              </dl>
            </div>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Work status">
                {STATUSES.map((status) => <Chip key={status} on={data.status === status}>{status}</Chip>)}
              </div>
              {data.longLeave && <p className="text-xs text-ink-muted">On approved leave {formatDate(data.longLeave.from)} to {formatDate(data.longLeave.to)} ({data.longLeave.days} days)</p>}
            </div>
          </div>
          <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <div>
              <p className="label">Employee status</p>
              <div className="mt-1 flex flex-wrap gap-2">{ORIGINS.map((o) => <Chip key={o} on={employee.workforceOrigin === o}>{o} employee</Chip>)}</div>
            </div>
            <div>
              <p className="label">Employee working status</p>
              <div className="mt-1 flex flex-wrap gap-2">{TYPES.map((t) => <Chip key={t} on={employee.employmentType === t}>{t} employee</Chip>)}</div>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="My wage - today" value={money(wage.today)} hint={`Rate ${money(wage.perDay)} a day`} tone="brand" />
        <StatCard label="My wage - this week" value={money(wage.week)} tone="brand" />
        <StatCard label={`My wage - ${month.label}`} value={money(wage.month)} hint="Earned so far" tone="brand" />
        <StatCard label="Total working days" value={String(month.workingDays)} hint={month.label} tone="violet" />
        <StatCard label="Total working hours" value={month.workingHours.toFixed(1)} hint={month.label} tone="violet" />
      </div>

      <Card>
        <CardHeader title="Today at work" description={today ? `Marked ${today.status}` : 'Not marked yet'} />
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => punch('in')} loading={busy === 'in'} disabled={checkedIn || data.status !== 'Active'}>Check in</Button>
            <Button variant="outline" onClick={() => setPermissionOpen(true)} disabled={data.status !== 'Active'}>Permission</Button>
            <Button variant="outline" onClick={() => punch('out')} loading={busy === 'out'} disabled={!checkedIn || checkedOut}>Check out</Button>
            <div className="ml-auto text-right">
              <p className="label">Work duration</p>
              <p className="text-lg font-semibold text-ink" aria-live="polite">{elapsed ?? '0 h 00 min'}</p>
              <p className="text-xs text-ink-muted">In {clock(today?.inTime ?? null)} - Out {clock(today?.outTime ?? null)}</p>
            </div>
          </div>
          {data.permissions.length > 0 && (
            <ul className="mt-4 divide-y divide-line rounded-lg border border-line text-sm">
              {data.permissions.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span><span className="font-medium text-ink">{formatDate(p.date)}</span> {p.from} - {p.to} ({p.minutes} min) <span className="text-ink-muted">- {p.reason}</span></span>
                  <span className="flex items-center gap-2">
                    <Badge tone={p.status === 'Approved' ? 'success' : p.status === 'Rejected' ? 'danger' : 'warning'}>{p.status}</Badge>
                    {p.status === 'Pending' && <button type="button" className="link text-xs" onClick={() => withdraw(p.id)}>Withdraw</button>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card padded={false}>
        <CardHeader title="Profile" description="Your details, benefits, deductions and statutory numbers"
          action={<Button size="sm" variant="ghost" onClick={() => setShowProfile((v) => !v)} aria-expanded={showProfile}>{showProfile ? 'Hide' : 'View'}</Button>} />
        {showProfile && (
          <CardBody className="grid gap-5 lg:grid-cols-2">
            <section aria-labelledby="wd-benefit">
              <h3 id="wd-benefit" className="text-sm font-semibold text-ink">Benefits</h3>
              <dl className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-ink-muted">Incentive (overtime pay)</dt><dd>{money(benefits.incentive)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-muted">Bonus</dt><dd>{money(benefits.bonus)}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-muted">Arrears</dt><dd>{money(benefits.arrears)}</dd></div>
              </dl>
              <p className="label mt-3">Promotion / increment</p>
              {benefits.increments.length === 0 ? <p className="text-sm text-ink-muted">No revisions on record.</p> : (
                <ul className="mt-1 space-y-1 text-sm">
                  {benefits.increments.map((row, i) => (
                    <li key={i} className="flex justify-between gap-3"><span className="text-ink-muted">{formatDate(row.from)}{row.reason ? ` - ${row.reason}` : ''}</span><span>{money(row.gross)}</span></li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="wd-slip">
              <h3 id="wd-slip" className="text-sm font-semibold text-ink">Salary slip</h3>
              <p className="mt-1 text-xs text-ink-muted">Generated automatically each month when your employer publishes payroll.</p>
              {slip ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" loading={busy === 'download'} onClick={async () => { setBusy('download'); const r = await downloadFromApi(slip, 'salary-slip.pdf'); setBusy(null); if (!r.ok) toast.error(r.message ?? 'Download failed'); }}>Download</Button>
                  <Button size="sm" variant="outline" loading={busy === 'share'} onClick={() => share(slip, 'salary-slip.pdf')}>Share (e-mail / WhatsApp)</Button>
                </div>
              ) : <p className="mt-2 text-sm text-ink-muted">No salary slip has been published yet.</p>}
              <h3 className="mt-5 text-sm font-semibold text-ink">PF / UAN</h3>
              <dl className="mt-1 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-ink-muted">PF number</dt><dd>{statutory.pf ?? '-'}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-muted">UAN</dt><dd>{statutory.uan ?? '-'}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-muted">ESI number</dt><dd>{statutory.esi ?? '-'}</dd></div>
              </dl>
            </section>

            <section aria-labelledby="wd-ded">
              <h3 id="wd-ded" className="text-sm font-semibold text-ink">Total deduction (contribution){deductions ? ` - ${deductions.period}` : ''}</h3>
              {deductions ? (
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><dt className="text-ink-muted">ESI</dt><dd>{money(deductions.esi)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-muted">PF</dt><dd>{money(deductions.pf)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-muted">Other (PT, LWF, TDS)</dt><dd>{money(deductions.other - deductions.damageOrLoss)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-muted">Damage or loss</dt><dd>{money(deductions.damageOrLoss)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-muted">Absence from duty (loss of pay)</dt><dd>{money(deductions.absenceFromDuty)}</dd></div>
                  <div className="flex justify-between"><dt className="text-ink-muted">Recovery of advance / canteen</dt><dd>{money(deductions.advanceRecovery)}</dd></div>
                  <div className="flex justify-between border-t border-line pt-1 font-semibold"><dt>Total deductions</dt><dd>{money(deductions.total)}</dd></div>
                </dl>
              ) : <p className="mt-2 text-sm text-ink-muted">Shown once a payslip is published.</p>}
            </section>

            <section aria-labelledby="wd-ff">
              <h3 id="wd-ff" className="text-sm font-semibold text-ink">Full and final settlement</h3>
              {data.settlement ? (
                <div className="mt-2 space-y-2 text-sm">
                  <p className="text-ink-muted">{data.settlement.number} - {data.settlement.status} - net {money(data.settlement.net)}</p>
                  <Button size="sm" variant="outline" onClick={async () => { const r = await downloadFromApi(`/api/pdf/full-final/${data.settlement!.id}`, `full-final-${data.settlement!.number.replace(/[^a-zA-Z0-9]+/g, '-')}.pdf`); if (!r.ok) toast.error(r.message ?? 'Download failed'); }}>Download</Button>
                </div>
              ) : <p className="mt-2 text-sm text-ink-muted">Available once your settlement is approved.</p>}
            </section>
          </CardBody>
        )}
      </Card>

      <Modal open={permissionOpen} onClose={() => setPermissionOpen(false)} title="Ask for permission" description="Leave the workplace for up to 4 hours. Your employer approves or rejects the request."
        footer={<><Button variant="ghost" onClick={() => setPermissionOpen(false)}>Cancel</Button><Button onClick={sendPermission} loading={busy === 'permission'}>Send request</Button></>}>
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Date" type="date" value={permission.date} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setPermission({ ...permission, date: e.target.value })} error={permissionErrors.date} />
          <Input label="From" type="time" value={permission.from} onChange={(e) => setPermission({ ...permission, from: e.target.value })} error={permissionErrors.from} />
          <Input label="To" type="time" value={permission.to} onChange={(e) => setPermission({ ...permission, to: e.target.value })} error={permissionErrors.to} />
        </div>
        <div className="mt-3"><Textarea label="Reason" value={permission.reason} onChange={(e) => setPermission({ ...permission, reason: e.target.value })} error={permissionErrors.reason} rows={3} /></div>
      </Modal>
    </div>
  );
}
