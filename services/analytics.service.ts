/**
 * Platform-wide analytics aggregates for the Reports & Analytics screen.
 *
 * The audit figures come from `audit-report.service.reportCharts()`; this
 * service supplies the other three lenses the same screen carries — the
 * payroll disbursement trend, the workforce spread and the compliance
 * register's status mix — each reading the live tables the modules write to,
 * so a chart is never a cached copy of the truth.
 */
import { query, type RowDataPacket } from '@/lib/db/mysql';
import { documentStats } from '@/repositories/compliance.repository';

export interface PayrollTrendRow {
  period: string;      // 'YYYY-MM'
  runs: number;
  net: number;         // net wages disbursed
  employees: number;   // employees paid
}

/** Payroll runs per month over the trailing window, newest last. */
export async function payrollTrend(months = 6): Promise<PayrollTrendRow[]> {
  const rows = await query<{ period: string; runs: number; net: number; employees: number } & RowDataPacket>(
    `SELECT DATE_FORMAT(STR_TO_DATE(CONCAT(pr.year, '-', pr.month, '-01'), '%Y-%m-%d'), '%Y-%m') AS period,
            COUNT(*) AS runs,
            COALESCE(SUM(pr.total_net), 0) AS net,
            COALESCE(SUM(pr.total_employees), 0) AS employees
       FROM payroll_runs pr
      WHERE pr.deleted_at IS NULL
        AND pr.status IN ('Approved', 'Locked', 'Paid')
        AND STR_TO_DATE(CONCAT(pr.year, '-', pr.month, '-01'), '%Y-%m-%d')
            >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL ${Math.max(1, Math.min(months, 24))} MONTH)
      GROUP BY pr.year, pr.month, period
      ORDER BY pr.year ASC, pr.month ASC`,
    []
  );
  return rows.map((row) => ({
    period: String(row.period),
    runs: Number(row.runs ?? 0),
    net: Number(row.net ?? 0),
    employees: Number(row.employees ?? 0),
  }));
}

export interface WorkforceRow {
  name: string;
  value: number;
}

/** Active headcount by department, biggest first, capped so the chart stays legible. */
export async function workforceByDepartment(limit = 10): Promise<WorkforceRow[]> {
  const rows = await query<{ name: string; total: number } & RowDataPacket>(
    `SELECT COALESCE(NULLIF(emp.department, ''), 'Unassigned') AS name, COUNT(*) AS total
       FROM employees emp
      WHERE emp.deleted_at IS NULL AND emp.status = 'active'
      GROUP BY name
      ORDER BY total DESC, name ASC
      LIMIT ${Math.max(1, Math.min(limit, 25))}`,
    []
  );
  return rows.map((row) => ({ name: String(row.name), value: Number(row.total ?? 0) }));
}

/** The compliance register counted by its derived status. */
export async function complianceStatusMix() {
  const stats = await documentStats();
  return {
    valid: Number(stats?.valid ?? 0),
    expiringSoon: Number(stats?.expiringSoon ?? 0),
    expired: Number(stats?.expired ?? 0),
    total: Number(stats?.total ?? 0),
  };
}

/** One call for the page: every non-audit chart the analytics screen draws. */
export async function platformCharts() {
  const [payroll, workforce, compliance] = await Promise.all([
    payrollTrend(6),
    workforceByDepartment(10),
    complianceStatusMix(),
  ]);
  return { payroll, workforce, compliance };
}
