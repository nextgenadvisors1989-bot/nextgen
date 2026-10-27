'use client';

/**
 * Statutory registers — bonus, gratuity and full-and-final settlement.
 *
 * Three obligations an Indian establishment cannot skip, on one screen:
 *
 *  * **Bonus** under the Payment of Bonus Act — 8.33% statutory minimum on
 *    eligible wages (₹7,000 a month or the notified ceiling), computed from the
 *    days actually paid in the accounting year.
 *  * **Gratuity** under the Payment of Gratuity Act — 15 days' wages per
 *    completed year of service on the last drawn basic + DA, on the five-year
 *    eligibility rule, capped at ₹20 lakh.
 *  * **Full and final settlement** — the part-month salary, leave encashment from
 *    the ledger, gratuity, less notice and other recoveries.
 *
 * Each register computes from live data and stores what it computed, so a
 * settlement prepared in March is the same document in December.
 */
import { useState } from 'react';
import { Card, StatCard } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/table';
import { Filters } from '@/components/ui/filters';
import { Input, Textarea } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { SearchInput } from '@/components/ui/search-input';
import { useToast } from '@/components/ui/toast';
import { useList } from '@/lib/utils/use-list';
import { api } from '@/lib/utils/api-client';
import { formatCurrency, formatNumber } from '@/lib/utils/formatting';
import { formatDate } from '@/lib/utils/dates';
import { BONUS_TYPES, SETTLEMENT_STATUSES } from '@/lib/validations/payroll.validation';

interface BonusRow {
  id: number; employee_name: string; employee_number: string; company_name: string;
  bonus_year: number; bonus_type: string; eligible_wages: number; bonus_percent: number;
  bonus_amount: number; paid_days: number; payment_status: string; payment_date: string | null;
}

interface GratuityRow {
  id: number; employee_name: string; employee_number: string; company_name: string;
  service_from: string; service_to: string; total_service_years: number;
  last_drawn_wages: number; basic_plus_da: number; gratuity_amount: number;
  is_statutory_eligible: boolean; payment_status: string; payment_date: string | null;
}

interface SettlementRow {
  id: number; settlement_number: string; employee_name: string; employee_number: string;
  company_name: string; last_working_day: string | null; total_earnings: number;
  total_deductions: number; net_settlement_amount: number; status: string;
  payment_date: string | null; approved_at: string | null;
}

interface EmployeeOption { value: string; label: string }

export function StatutoryRegisters() {
  const { success, error: errorToast } = useToast();
  const [tab, setTab] = useState('bonus');
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [bonusOpen, setBonusOpen] = useState(false);
  const [gratuityOpen, setGratuityOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);

  const bonus = useList<BonusRow>({
    endpoint: '/api/admin/payroll/bonus',
    initialFilters: { search: '', year: String(new Date().getFullYear() - 1) },
    initialLimit: 10,
    enabled: tab === 'bonus',
  });
  const gratuity = useList<GratuityRow>({
    endpoint: '/api/admin/payroll/gratuity',
    initialFilters: { search: '', status: 'all' },
    initialLimit: 10,
    enabled: tab === 'gratuity',
  });
  const settlements = useList<SettlementRow>({
    endpoint: '/api/admin/payroll/settlements',
    initialFilters: { search: '', status: 'all' },
    initialLimit: 10,
    enabled: tab === 'settlements',
  });

  const [bonusForm, setBonusForm] = useState({
    employee_ids: [] as string[], bonus_year: String(new Date().getFullYear() - 1),
    bonus_type: 'Statutory Bonus', bonus_percent: '', payment_date: '', remarks: '',
  });
  const [gratuityForm, setGratuityForm] = useState({
    employee_id: '', service_from: '', service_to: new Date().toISOString().slice(0, 10),
    last_drawn_wages: '', payment_date: '', calculation_note: '',
  });
  const [settlementForm, setSettlementForm] = useState({
    employee_id: '', resignation_date: '', relieving_date: '',
    last_working_day: '', notice_period_days: '30', notice_period_served_days: '30',
    advance_recovery: '', other_deductions: '', remarks: '',
  });

  const loadEmployees = async () => {
    if (employees.length) return;
    const result = await api.get<{ id: number; name: string; employee_number: string }[]>('/api/admin/employees?limit=200&status=active');
    const rows = Array.isArray(result.data) ? result.data : [];
    setEmployees(rows.map((row) => ({ value: String(row.id), label: `${row.employee_number} — ${row.name}` })));
  };

  const saveBonus = async () => {
    try {
      const result = await api.post<{ created: unknown[]; total: number }>('/api/admin/payroll/bonus', {
        employee_ids: bonusForm.employee_ids.map(Number),
        bonus_year: Number(bonusForm.bonus_year),
        bonus_type: bonusForm.bonus_type,
        bonus_percent: bonusForm.bonus_percent ? Number(bonusForm.bonus_percent) : undefined,
        payment_date: bonusForm.payment_date || undefined,
        remarks: bonusForm.remarks || undefined,
      });
      success(result.message);
      setBonusOpen(false);
      bonus.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    }
  };

  const saveGratuity = async () => {
    try {
      const result = await api.post('/api/admin/payroll/gratuity', {
        employee_id: Number(gratuityForm.employee_id),
        service_from: gratuityForm.service_from,
        service_to: gratuityForm.service_to,
        last_drawn_wages: gratuityForm.last_drawn_wages ? Number(gratuityForm.last_drawn_wages) : undefined,
        payment_date: gratuityForm.payment_date || undefined,
        calculation_note: gratuityForm.calculation_note || undefined,
      });
      success(result.message);
      setGratuityOpen(false);
      gratuity.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    }
  };

  const saveSettlement = async () => {
    try {
      const result = await api.post('/api/admin/payroll/settlements', {
        employee_id: Number(settlementForm.employee_id),
        resignation_date: settlementForm.resignation_date || undefined,
        relieving_date: settlementForm.relieving_date || undefined,
        last_working_day: settlementForm.last_working_day || undefined,
        notice_period_days: Number(settlementForm.notice_period_days || 0),
        notice_period_served_days: Number(settlementForm.notice_period_served_days || 0),
        advance_recovery: settlementForm.advance_recovery ? Number(settlementForm.advance_recovery) : undefined,
        other_deductions: settlementForm.other_deductions ? Number(settlementForm.other_deductions) : undefined,
        remarks: settlementForm.remarks || undefined,
      });
      success(result.message);
      setSettlementOpen(false);
      settlements.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    }
  };

  const moveSettlement = async (row: SettlementRow, status: string) => {
    try {
      const result = await api.post(`/api/admin/payroll/settlements/${row.id}/status`, { status });
      success(result.message);
      settlements.refresh();
    } catch (failure) {
      errorToast((failure as Error).message);
    }
  };

  const bonusTotal = (bonus.extra.total ?? 0) as number;
  const gratuityTotal = (gratuity.extra.total ?? 0) as number;
  const settlementTotal = (settlements.extra.total ?? 0) as number;

  const bonusColumns: Column<BonusRow>[] = [
    { key: 'employee_name', header: 'Employee', render: (row) => (
      <div className="min-w-[170px]"><div className="text-ink">{row.employee_name}</div><div className="text-xs text-ink-muted">{row.employee_number} · {row.company_name}</div></div>
    ) },
    { key: 'bonus_year', header: 'Bonus year', align: 'center', render: (row) => row.bonus_year },
    { key: 'bonus_type', header: 'Type', render: (row) => <span className="text-ink-muted">{row.bonus_type}</span> },
    { key: 'eligible_wages', header: 'Eligible wages', align: 'right', render: (row) => formatCurrency(row.eligible_wages) },
    { key: 'bonus_percent', header: '%', align: 'center', render: (row) => `${formatNumber(row.bonus_percent)}%` },
    { key: 'bonus_amount', header: 'Bonus', align: 'right', render: (row) => <span className="font-medium text-ink">{formatCurrency(row.bonus_amount)}</span> },
    { key: 'paid_days', header: 'Paid days', align: 'center', render: (row) => formatNumber(row.paid_days) },
    { key: 'payment_status', header: 'Status', align: 'center', render: (row) => <Badge tone={row.payment_status === 'Paid' ? 'success' : 'default'}>{row.payment_status}</Badge> },
  ];

  const gratuityColumns: Column<GratuityRow>[] = [
    { key: 'employee_name', header: 'Employee', render: (row) => (
      <div className="min-w-[170px]"><div className="text-ink">{row.employee_name}</div><div className="text-xs text-ink-muted">{row.employee_number} · {row.company_name}</div></div>
    ) },
    { key: 'service', header: 'Service', render: (row) => <span className="text-ink-muted">{formatDate(row.service_from)} → {formatDate(row.service_to)}</span> },
    { key: 'total_service_years', header: 'Years', align: 'center', render: (row) => formatNumber(row.total_service_years) },
    { key: 'last_drawn_wages', header: 'Last drawn (Basic + DA)', align: 'right', render: (row) => formatCurrency(row.last_drawn_wages) },
    { key: 'gratuity_amount', header: 'Gratuity', align: 'right', render: (row) => <span className="font-medium text-ink">{formatCurrency(row.gratuity_amount)}</span> },
    { key: 'is_statutory_eligible', header: 'Eligibility', align: 'center', render: (row) => (
      <Badge tone={row.is_statutory_eligible ? 'success' : 'warning'}>{row.is_statutory_eligible ? 'Five years met' : 'Under five years'}</Badge>
    ) },
    { key: 'payment_status', header: 'Status', align: 'center', render: (row) => <Badge tone={row.payment_status === 'Paid' ? 'success' : 'default'}>{row.payment_status}</Badge> },
  ];

  const settlementColumns: Column<SettlementRow>[] = [
    { key: 'settlement_number', header: 'Settlement', render: (row) => (
      <div className="min-w-[130px]"><div className="font-medium text-ink">{row.settlement_number}</div><div className="text-xs text-ink-muted">Last day {formatDate(row.last_working_day)}</div></div>
    ) },
    { key: 'employee_name', header: 'Employee', render: (row) => (
      <div className="min-w-[170px]"><div className="text-ink">{row.employee_name}</div><div className="text-xs text-ink-muted">{row.employee_number} · {row.company_name}</div></div>
    ) },
    { key: 'total_earnings', header: 'Payable', align: 'right', render: (row) => formatCurrency(row.total_earnings) },
    { key: 'total_deductions', header: 'Recoveries', align: 'right', render: (row) => formatCurrency(row.total_deductions) },
    { key: 'net_settlement_amount', header: 'Net settlement', align: 'right', render: (row) => <span className="font-medium text-ink">{formatCurrency(row.net_settlement_amount)}</span> },
    { key: 'status', header: 'Status', align: 'center', render: (row) => (
      <Badge tone={row.status === 'Paid' ? 'success' : row.status === 'Approved' ? 'info' : row.status === 'Cancelled' ? 'danger' : 'default'}>{row.status}</Badge>
    ) },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      width: 190,
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {row.status === 'Draft' ? <Button size="sm" variant="ghost" onClick={() => moveSettlement(row, 'Submitted')}>Submit</Button> : null}
          {row.status === 'Submitted' ? <Button size="sm" variant="ghost" onClick={() => moveSettlement(row, 'Approved')}>Approve</Button> : null}
          {row.status === 'Approved' ? <Button size="sm" variant="ghost" onClick={() => moveSettlement(row, 'Paid')}>Mark paid</Button> : null}
          <a href={`/api/pdf/full-final/${row.id}`} target="_blank" rel="noreferrer" className="rounded-md px-3 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-surface-muted">PDF</a>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Bonus recorded" value={formatCurrency(bonusTotal)} hint={`${formatNumber((bonus.extra.count ?? 0) as number)} employee record(s)`} />
        <StatCard label="Gratuity recorded" value={formatCurrency(gratuityTotal)} hint={`${formatNumber((gratuity.extra.eligible ?? 0) as number)} statutory-eligible`} />
        <StatCard label="Settlements net" value={formatCurrency(settlementTotal)} hint={`${formatNumber((settlements.extra.count ?? 0) as number)} settlement(s)`} />
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="flex flex-wrap items-center gap-1">
            {[
              { key: 'bonus', label: 'Bonus register' },
              { key: 'gratuity', label: 'Gratuity register' },
              { key: 'settlements', label: 'Full & final settlements' },
            ].map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => setTab(entry.key)}
                className={
                  tab === entry.key
                    ? 'border-b-2 border-accent px-3 py-2 text-[13px] font-semibold text-ink'
                    : 'border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-ink-muted hover:text-ink'
                }
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {tab === 'bonus' ? <Button size="sm" onClick={async () => { await loadEmployees(); setBonusOpen(true); }}>Compute bonus</Button> : null}
            {tab === 'gratuity' ? <Button size="sm" onClick={async () => { await loadEmployees(); setGratuityOpen(true); }}>Compute gratuity</Button> : null}
            {tab === 'settlements' ? <Button size="sm" onClick={async () => { await loadEmployees(); setSettlementOpen(true); }}>Prepare settlement</Button> : null}
          </div>
        </div>

        {tab === 'bonus' ? (
          <>
            <Filters
              definitions={[
                { key: 'search', type: 'search', placeholder: 'Search employee' },
                { key: 'year', type: 'select', label: 'Every bonus year', options: [0, 1, 2, 3].map((offset) => new Date().getFullYear() - 1 - offset).map((value) => ({ value: String(value), label: String(value) })) },
                { key: 'status', type: 'select', label: 'Every payment status', options: ['Pending', 'Paid'].map((value) => ({ value, label: value })) },
              ]}
              values={bonus.filters}
              onChange={bonus.setFilter}
              onClear={bonus.clearFilters}
            />
            <DataTable columns={bonusColumns} data={bonus.data} loading={bonus.loading} rowKey={(row) => row.id}
              emptyTitle="No bonus recorded" emptySubtitle="Compute the statutory bonus for the accounting year — 8.33% of eligible wages at the minimum, on the days actually paid." />
          </>
        ) : null}

        {tab === 'gratuity' ? (
          <>
            <Filters
              definitions={[
                { key: 'search', type: 'search', placeholder: 'Search employee' },
                { key: 'status', type: 'select', label: 'Every payment status', options: ['Pending', 'Paid'].map((value) => ({ value, label: value })) },
              ]}
              values={gratuity.filters}
              onChange={gratuity.setFilter}
              onClear={gratuity.clearFilters}
            />
            <DataTable columns={gratuityColumns} data={gratuity.data} loading={gratuity.loading} rowKey={(row) => row.id}
              emptyTitle="No gratuity recorded" emptySubtitle="Compute gratuity at exit: 15 days' wages per completed year of service on the last drawn basic + DA." />
          </>
        ) : null}

        {tab === 'settlements' ? (
          <>
            <Filters
              definitions={[
                { key: 'search', type: 'search', placeholder: 'Search settlement or employee' },
                { key: 'status', type: 'select', label: 'Every status', options: SETTLEMENT_STATUSES.map((value) => ({ value, label: value })) },
              ]}
              values={settlements.filters}
              onChange={settlements.setFilter}
              onClear={settlements.clearFilters}
            />
            <DataTable columns={settlementColumns} data={settlements.data} loading={settlements.loading} rowKey={(row) => row.id}
              emptyTitle="No settlements prepared" emptySubtitle="Prepare the full and final settlement when an employee leaves: part-month salary, leave encashment, gratuity, less recoveries." />
          </>
        ) : null}
      </Card>

      {bonusOpen ? (
        <Modal
          open
          onClose={() => setBonusOpen(false)}
          title="Compute bonus"
          description="Bonus is computed per employee from the days paid in the accounting year and the wage ceiling (₹7,000 a month, or the notified figure). An employee who already has a record for the year is reported as skipped."
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setBonusOpen(false)}>Cancel</Button>
              <Button onClick={saveBonus}>Compute bonus</Button>
            </div>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Bonus year" type="number" value={bonusForm.bonus_year} onChange={(event) => setBonusForm({ ...bonusForm, bonus_year: event.target.value })} helper="The accounting year the bonus relates to" />
              <Select label="Bonus type" value={bonusForm.bonus_type} onChange={(value) => setBonusForm({ ...bonusForm, bonus_type: value })} options={BONUS_TYPES.map((value) => ({ value, label: value }))} />
              <Input label="Percentage" type="number" value={bonusForm.bonus_percent} onChange={(event) => setBonusForm({ ...bonusForm, bonus_percent: event.target.value })} helper="Leave blank for the statutory minimum of 8.33%" />
              <Input label="Payment date" type="date" value={bonusForm.payment_date} onChange={(event) => setBonusForm({ ...bonusForm, payment_date: event.target.value })} />
            </div>
            <div>
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Employees ({bonusForm.employee_ids.length} selected)</label>
              <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-line p-2">
                {employees.map((option) => (
                  <label key={option.value} className="flex items-center gap-2 rounded-md px-2 py-1 text-[13px] text-ink hover:bg-surface-muted">
                    <input
                      type="checkbox"
                      checked={bonusForm.employee_ids.includes(option.value)}
                      onChange={() => setBonusForm({
                        ...bonusForm,
                        employee_ids: bonusForm.employee_ids.includes(option.value)
                          ? bonusForm.employee_ids.filter((value) => value !== option.value)
                          : [...bonusForm.employee_ids, option.value],
                      })}
                    />
                    {option.label}
                  </label>
                ))}
                {employees.length ? null : <p className="p-2 text-[13px] text-ink-muted">No active employees to list.</p>}
              </div>
              <button
                type="button"
                className="mt-2 text-[13px] text-accent hover:underline"
                onClick={() => setBonusForm({ ...bonusForm, employee_ids: employees.map((option) => option.value) })}
              >
                Select every employee
              </button>
            </div>
            <Textarea label="Remarks" rows={2} value={bonusForm.remarks} onChange={(event) => setBonusForm({ ...bonusForm, remarks: event.target.value })} />
          </div>
        </Modal>
      ) : null}

      {gratuityOpen ? (
        <Modal
          open
          onClose={() => setGratuityOpen(false)}
          title="Compute gratuity"
          description="Gratuity is 15 days' wages for every completed year of service on the last drawn basic + DA, payable once five years of service are complete (or on death / disablement)."
          size="lg"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setGratuityOpen(false)}>Cancel</Button>
              <Button onClick={saveGratuity}>Compute gratuity</Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Employee</label>
              <SearchInput
                value={employees.find((option) => option.value === gratuityForm.employee_id)?.label ?? ''}
                onChange={(value) => {
                  const match = employees.find((option) => option.label === value)
                    ?? employees.find((option) => option.label.toLowerCase().includes(value.toLowerCase()));
                  setGratuityForm({ ...gratuityForm, employee_id: match?.value ?? '' });
                }}
                placeholder="Search by name or employee code"
              />
            </div>
            <Input label="Service from" type="date" value={gratuityForm.service_from} onChange={(event) => setGratuityForm({ ...gratuityForm, service_from: event.target.value })} />
            <Input label="Service to" type="date" value={gratuityForm.service_to} onChange={(event) => setGratuityForm({ ...gratuityForm, service_to: event.target.value })} />
            <Input label="Last drawn wages (Basic + DA)" type="number" value={gratuityForm.last_drawn_wages} onChange={(event) => setGratuityForm({ ...gratuityForm, last_drawn_wages: event.target.value })} helper="Leave blank to take the employee's live structure" />
            <Input label="Payment date" type="date" value={gratuityForm.payment_date} onChange={(event) => setGratuityForm({ ...gratuityForm, payment_date: event.target.value })} />
            <Textarea label="Calculation note" rows={2} value={gratuityForm.calculation_note} onChange={(event) => setGratuityForm({ ...gratuityForm, calculation_note: event.target.value })} className="sm:col-span-2" />
          </div>
        </Modal>
      ) : null}

      {settlementOpen ? (
        <Modal
          open
          onClose={() => setSettlementOpen(false)}
          title="Prepare a full and final settlement"
          description="The engine proposes the part-month salary, the leave encashment from the ledger and the statutory gratuity, and recovers the unserved notice where a notice period was short. Overwrite any figure with the employee's actuals."
          size="xl"
          footer={
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSettlementOpen(false)}>Cancel</Button>
              <Button onClick={saveSettlement}>Prepare settlement</Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-[13px] font-medium text-ink">Employee</label>
              <SearchInput
                value={employees.find((option) => option.value === settlementForm.employee_id)?.label ?? ''}
                onChange={(value) => {
                  const match = employees.find((option) => option.label === value)
                    ?? employees.find((option) => option.label.toLowerCase().includes(value.toLowerCase()));
                  setSettlementForm({ ...settlementForm, employee_id: match?.value ?? '' });
                }}
                placeholder="Search by name or employee code"
              />
            </div>
            <Input label="Resignation date" type="date" value={settlementForm.resignation_date} onChange={(event) => setSettlementForm({ ...settlementForm, resignation_date: event.target.value })} />
            <Input label="Relieving date" type="date" value={settlementForm.relieving_date} onChange={(event) => setSettlementForm({ ...settlementForm, relieving_date: event.target.value })} />
            <Input label="Last working day" type="date" value={settlementForm.last_working_day} onChange={(event) => setSettlementForm({ ...settlementForm, last_working_day: event.target.value })} helper="Salary is paid up to this day" />
            <Input label="Notice period (days)" type="number" value={settlementForm.notice_period_days} onChange={(event) => setSettlementForm({ ...settlementForm, notice_period_days: event.target.value })} />
            <Input label="Notice served (days)" type="number" value={settlementForm.notice_period_served_days} onChange={(event) => setSettlementForm({ ...settlementForm, notice_period_served_days: event.target.value })} helper="The shortfall is recovered from the settlement" />
            <Input label="Advance recovery" type="number" value={settlementForm.advance_recovery} onChange={(event) => setSettlementForm({ ...settlementForm, advance_recovery: event.target.value })} />
            <Input label="Other recoveries" type="number" value={settlementForm.other_deductions} onChange={(event) => setSettlementForm({ ...settlementForm, other_deductions: event.target.value })} />
            <Textarea label="Remarks" rows={2} value={settlementForm.remarks} onChange={(event) => setSettlementForm({ ...settlementForm, remarks: event.target.value })} className="sm:col-span-2" />
          </div>
          <p className="mt-3 text-[13px] text-ink-muted">
            Paying the settlement marks the employee&apos;s record as resigned. The settlement number, the earnings and the recoveries are
            stored as they were computed.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}
