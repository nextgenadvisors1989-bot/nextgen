/** Aggregates the figures rendered by each panel's dashboard. */
import { query, queryOne, type RowDataPacket } from '@/lib/db/mysql';
import { MONTH_NAMES } from '@/lib/utils/dates';
import type { AdminDashboardData } from '@/components/dashboards/admin-dashboard';
import type { AuditorDashboardData } from '@/components/dashboards/auditor-dashboard';
import type { EmployerDashboardData } from '@/components/dashboards/employer-dashboard';
import type { EmployeeDashboardData } from '@/components/dashboards/employee-dashboard';
import type { VerifierDashboardData } from '@/components/dashboards/verifier-dashboard';

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const [stats] = await query<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM employers WHERE deleted_at IS NULL) AS totalEmployers,
       (SELECT COUNT(*) FROM employers WHERE deleted_at IS NULL AND status = 'active') AS activeEmployers,
       (SELECT COUNT(*) FROM auditors WHERE deleted_at IS NULL AND status = 'active') AS totalAuditors,
       (SELECT COUNT(*) FROM employees WHERE deleted_at IS NULL) AS totalEmployees,
       (SELECT COUNT(*) FROM audit_assignments WHERE deleted_at IS NULL AND status NOT IN ('Approved','Cancelled')) AS activeAudits,
       (SELECT COUNT(*) FROM audit_assignments WHERE deleted_at IS NULL AND status = 'Overdue') AS overdueAudits,
       (SELECT COUNT(*) FROM audit_reports WHERE deleted_at IS NULL AND status IN ('Submitted','Under Review')) AS pendingVerification,
       (SELECT COUNT(*) FROM audit_reports WHERE deleted_at IS NULL AND status = 'Approved'
          AND MONTH(approved_at) = ? AND YEAR(approved_at) = ?) AS approvedThisMonth,
       (SELECT COUNT(*) FROM compliance_documents WHERE deleted_at IS NULL AND expiry_date IS NOT NULL
          AND DATEDIFF(expiry_date, CURDATE()) BETWEEN 0 AND 90) AS expiringDocuments,
       (SELECT COUNT(*) FROM payroll_runs WHERE deleted_at IS NULL AND month = ? AND year = ?) AS payrollRunsThisMonth,
       (SELECT COALESCE(SUM(total_net), 0) FROM payroll_runs WHERE deleted_at IS NULL
          AND status IN ('Approved','Locked','Paid') AND year = ?) AS payrollNetTotal`,
    [month, year, month, year, year]
  );

  const auditStatusBreakdown = await query<{ status: string; total: number } & RowDataPacket>(
    `SELECT status, COUNT(*) AS total
       FROM audit_assignments
      WHERE deleted_at IS NULL
      GROUP BY status
      ORDER BY total DESC`
  );

  const recentAssignments = await query<AdminDashboardData['recentAssignments'][number] & RowDataPacket>(
    `SELECT aa.id, aa.assignment_number, aa.audit_title, e.company_name, a.name AS auditor_name,
            aa.status, aa.priority, aa.due_date, aa.progress_percent
       FROM audit_assignments aa
       JOIN employers e ON e.id = aa.employer_id
       JOIN auditors a ON a.id = aa.auditor_id
      WHERE aa.deleted_at IS NULL
      ORDER BY aa.created_at DESC
      LIMIT 8`
  );

  const recentActivity = await query<AdminDashboardData['recentActivity'][number] & RowDataPacket>(
    `SELECT id, description, user_name, module, created_at
       FROM activity_logs
      ORDER BY created_at DESC
      LIMIT 10`
  );

  const complianceAlerts = await query<AdminDashboardData['complianceAlerts'][number] & RowDataPacket>(
    `SELECT cd.id, cd.document_name, e.company_name, cd.expiry_date, cd.compliance_status,
            DATEDIFF(cd.expiry_date, CURDATE()) AS days_to_expiry
       FROM compliance_documents cd
       JOIN employers e ON e.id = cd.employer_id
      WHERE cd.deleted_at IS NULL AND cd.expiry_date IS NOT NULL
        AND DATEDIFF(cd.expiry_date, CURDATE()) BETWEEN 0 AND 90
      ORDER BY cd.expiry_date ASC
      LIMIT 6`
  );

  const topAuditors = await query<AdminDashboardData['topAuditors'][number] & RowDataPacket>(
    `SELECT a.id, a.name,
            SUM(aa.status = 'Approved') AS completed,
            SUM(aa.status NOT IN ('Approved','Cancelled')) AS pending,
            SUM(aa.status = 'Overdue') AS overdue
       FROM auditors a
       LEFT JOIN audit_assignments aa ON aa.auditor_id = a.id AND aa.deleted_at IS NULL
      WHERE a.deleted_at IS NULL
      GROUP BY a.id, a.name
      ORDER BY completed DESC, pending DESC
      LIMIT 5`
  );

  return {
    stats: {
      totalEmployers: Number(stats?.totalEmployers ?? 0),
      activeEmployers: Number(stats?.activeEmployers ?? 0),
      totalAuditors: Number(stats?.totalAuditors ?? 0),
      totalEmployees: Number(stats?.totalEmployees ?? 0),
      activeAudits: Number(stats?.activeAudits ?? 0),
      overdueAudits: Number(stats?.overdueAudits ?? 0),
      pendingVerification: Number(stats?.pendingVerification ?? 0),
      approvedThisMonth: Number(stats?.approvedThisMonth ?? 0),
      expiringDocuments: Number(stats?.expiringDocuments ?? 0),
      payrollRunsThisMonth: Number(stats?.payrollRunsThisMonth ?? 0),
      payrollNetTotal: Number(stats?.payrollNetTotal ?? 0),
    },
    auditStatusBreakdown: auditStatusBreakdown.map((row) => ({ status: row.status, total: Number(row.total) })),
    recentAssignments,
    recentActivity,
    complianceAlerts: complianceAlerts.map((row) => ({ ...row, days_to_expiry: Number(row.days_to_expiry) })),
    topAuditors: topAuditors.map((row) => ({
      id: Number(row.id),
      name: String(row.name),
      completed: Number(row.completed ?? 0),
      pending: Number(row.pending ?? 0),
      overdue: Number(row.overdue ?? 0),
    })),
  };
}

/** Employer-panel dashboard figures. */
export async function getEmployerDashboardData(employerId: number) {
  const company = await queryOne<RowDataPacket>(
    'SELECT company_name, employer_code FROM employers WHERE id = ? AND deleted_at IS NULL LIMIT 1',
    [employerId]
  );

  const [stats] = await query<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM employees WHERE employer_id = ? AND deleted_at IS NULL) AS totalEmployees,
       (SELECT COUNT(*) FROM employees WHERE employer_id = ? AND deleted_at IS NULL AND status = 'active') AS activeEmployees,
       (SELECT COUNT(*) FROM company_units WHERE employer_id = ? AND deleted_at IS NULL) AS totalUnits,
       (SELECT COUNT(*) FROM departments WHERE employer_id = ? AND deleted_at IS NULL) AS totalDepartments,
       (SELECT COUNT(*) FROM audit_assignments WHERE employer_id = ? AND deleted_at IS NULL) AS totalAudits,
       (SELECT COUNT(*) FROM audit_assignments WHERE employer_id = ? AND deleted_at IS NULL
          AND status NOT IN ('Approved','Cancelled')) AS openAudits,
       (SELECT COUNT(*) FROM compliance_documents WHERE employer_id = ? AND deleted_at IS NULL) AS totalDocuments,
       (SELECT COUNT(*) FROM compliance_documents WHERE employer_id = ? AND deleted_at IS NULL AND expiry_date IS NOT NULL
          AND DATEDIFF(expiry_date, CURDATE()) BETWEEN 0 AND 90) AS expiringDocuments,
       (SELECT COUNT(*) FROM compliance_documents WHERE employer_id = ? AND deleted_at IS NULL AND expiry_date IS NOT NULL
          AND expiry_date < CURDATE()) AS expiredDocuments,
       (SELECT COALESCE(SUM(net_pay), 0) FROM payslips WHERE employer_id = ? AND deleted_at IS NULL
          AND is_published = 1 AND MONTH(period_from) = MONTH(CURDATE()) AND YEAR(period_from) = YEAR(CURDATE())) AS currentMonthNet`,
    Array.from({ length: 10 }, () => employerId)
  );

  const upcomingAudits = await query<EmployerDashboardData['upcomingAudits'][number] & RowDataPacket>(
    `SELECT aa.id, aa.assignment_number, aa.audit_title, aa.status, aa.priority, aa.start_date, aa.due_date,
            a.name AS auditor_name, aa.progress_percent
       FROM audit_assignments aa
       JOIN auditors a ON a.id = aa.auditor_id
      WHERE aa.employer_id = ? AND aa.deleted_at IS NULL AND aa.status NOT IN ('Approved','Cancelled')
      ORDER BY aa.due_date ASC
      LIMIT 6`,
    [employerId]
  );

  const expiringDocuments = await query<EmployerDashboardData['expiringDocuments'][number] & RowDataPacket>(
    `SELECT id, document_name, document_type, expiry_date, compliance_status,
            DATEDIFF(expiry_date, CURDATE()) AS days_to_expiry
       FROM compliance_documents
      WHERE employer_id = ? AND deleted_at IS NULL AND expiry_date IS NOT NULL
        AND DATEDIFF(expiry_date, CURDATE()) <= 90
      ORDER BY expiry_date ASC
      LIMIT 6`,
    [employerId]
  );

  const departmentHeadcount = await query<EmployerDashboardData['departmentHeadcount'][number] & RowDataPacket>(
    `SELECT COALESCE(d.department_name, e.department, 'Unassigned') AS department_name, COUNT(*) AS total
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.employer_id = ? AND e.deleted_at IS NULL AND e.status = 'active'
      GROUP BY department_name
      ORDER BY total DESC
      LIMIT 8`,
    [employerId]
  );

  return {
    companyName: String(company?.company_name ?? 'Your Company'),
    employerCode: String(company?.employer_code ?? ''),
    stats: {
      totalEmployees: Number(stats?.totalEmployees ?? 0),
      activeEmployees: Number(stats?.activeEmployees ?? 0),
      totalUnits: Number(stats?.totalUnits ?? 0),
      totalDepartments: Number(stats?.totalDepartments ?? 0),
      totalAudits: Number(stats?.totalAudits ?? 0),
      openAudits: Number(stats?.openAudits ?? 0),
      totalDocuments: Number(stats?.totalDocuments ?? 0),
      expiringDocuments: Number(stats?.expiringDocuments ?? 0),
      expiredDocuments: Number(stats?.expiredDocuments ?? 0),
      currentMonthNet: Number(stats?.currentMonthNet ?? 0),
    },
    upcomingAudits,
    expiringDocuments: expiringDocuments.map((row) => ({ ...row, days_to_expiry: Number(row.days_to_expiry) })),
    departmentHeadcount: departmentHeadcount.map((row) => ({ department_name: String(row.department_name), total: Number(row.total) })),
  };
}

/** Auditor-panel dashboard figures. */
export async function getAuditorDashboardData(auditorId: number) {
  const [stats] = await query<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM audit_assignments WHERE auditor_id = ? AND deleted_at IS NULL
          AND status NOT IN ('Approved','Cancelled')) AS openAudits,
       (SELECT COUNT(*) FROM audit_assignments WHERE auditor_id = ? AND deleted_at IS NULL
          AND status IN ('Not Started','In Progress','Draft Saved')) AS inProgress,
       (SELECT COUNT(*) FROM audit_assignments WHERE auditor_id = ? AND deleted_at IS NULL AND status = 'Submitted') AS submitted,
       (SELECT COUNT(*) FROM audit_assignments WHERE auditor_id = ? AND deleted_at IS NULL AND status = 'Overdue') AS overdue,
       (SELECT COUNT(*) FROM audit_assignments WHERE auditor_id = ? AND deleted_at IS NULL AND status = 'Approved') AS approved,
       (SELECT COUNT(*) FROM audit_assignments WHERE auditor_id = ? AND deleted_at IS NULL
          AND status = 'Approved' AND MONTH(completed_at) = MONTH(CURDATE()) AND YEAR(completed_at) = YEAR(CURDATE())) AS approvedThisMonth`,
    Array.from({ length: 6 }, () => auditorId)
  );

  const assignments = await query<AuditorDashboardData['assignments'][number] & RowDataPacket>(
    `SELECT aa.id, aa.assignment_number, aa.audit_title, aa.status, aa.priority, aa.start_date, aa.due_date,
            aa.progress_percent, e.company_name, DATEDIFF(aa.due_date, CURDATE()) AS days_remaining
       FROM audit_assignments aa
       JOIN employers e ON e.id = aa.employer_id
      WHERE aa.auditor_id = ? AND aa.deleted_at IS NULL
        AND aa.status NOT IN ('Approved','Cancelled')
      ORDER BY FIELD(aa.priority, 'Urgent','High','Medium','Low'), aa.due_date ASC
      LIMIT 10`,
    [auditorId]
  );

  const recentReports = await query<AuditorDashboardData['recentReports'][number] & RowDataPacket>(
    `SELECT ar.id, ar.report_number, ar.audit_title, ar.status, ar.submitted_at, ar.score_percentage,
            e.company_name
       FROM audit_reports ar
       JOIN employers e ON e.id = ar.employer_id
      WHERE ar.auditor_id = ? AND ar.deleted_at IS NULL
      ORDER BY ar.submitted_at DESC
      LIMIT 6`,
    [auditorId]
  );

  const upcomingMeetings = await query<AuditorDashboardData['upcomingMeetings'][number] & RowDataPacket>(
    `SELECT ce.id, ce.title, ce.start_datetime, ce.location, ce.event_type
       FROM calendar_events ce
      WHERE ce.auditor_id = ? AND ce.deleted_at IS NULL AND ce.start_datetime >= NOW()
      ORDER BY ce.start_datetime ASC
      LIMIT 5`,
    [auditorId]
  );

  return {
    stats: {
      openAudits: Number(stats?.openAudits ?? 0),
      inProgress: Number(stats?.inProgress ?? 0),
      submitted: Number(stats?.submitted ?? 0),
      overdue: Number(stats?.overdue ?? 0),
      approved: Number(stats?.approved ?? 0),
      approvedThisMonth: Number(stats?.approvedThisMonth ?? 0),
    },
    assignments: assignments.map((row) => ({ ...row, days_remaining: row.days_remaining === null ? null : Number(row.days_remaining) })),
    recentReports,
    upcomingMeetings,
    currentMonth: `${MONTH_NAMES[new Date().getMonth()]} ${new Date().getFullYear()}`,
  };
}

/** Verifier-panel dashboard figures. */
export async function getVerifierDashboardData(userId: number) {
  const [stats] = await query<RowDataPacket>(
    `SELECT
       (SELECT COUNT(*) FROM verifier_assignments WHERE verifier_id = ? AND status IN ('pending','in_review')) AS pending,
       (SELECT COUNT(*) FROM verifier_assignments WHERE verifier_id = ? AND status = 'completed') AS completed,
       (SELECT COUNT(*) FROM verifier_comments WHERE verifier_id = ? AND action = 'approved') AS approved,
       (SELECT COUNT(*) FROM verifier_comments WHERE verifier_id = ? AND action = 'rejected') AS rejected,
       (SELECT COUNT(*) FROM verifier_comments WHERE verifier_id = ? AND action = 'returned') AS returned`,
    [userId, userId, userId, userId, userId]
  );

  const queue = await query<VerifierDashboardData['queue'][number] & RowDataPacket>(
    `SELECT va.id AS assignment_id, va.status AS verification_status, va.assigned_at, va.due_date,
            ar.id AS report_id, ar.report_number, ar.audit_title, ar.status, ar.score_percentage,
            ar.submitted_at, e.company_name, a.name AS auditor_name
       FROM verifier_assignments va
       JOIN audit_reports ar ON ar.id = va.report_id
       JOIN employers e ON e.id = ar.employer_id
       LEFT JOIN auditors a ON a.id = ar.auditor_id
      WHERE va.verifier_id = ? AND va.status IN ('pending','in_review')
      ORDER BY ar.submitted_at ASC
      LIMIT 10`,
    [userId]
  );

  return {
    stats: {
      pending: Number(stats?.pending ?? 0),
      completed: Number(stats?.completed ?? 0),
      approved: Number(stats?.approved ?? 0),
      rejected: Number(stats?.rejected ?? 0),
      returned: Number(stats?.returned ?? 0),
    },
    queue,
  };
}

/** Employee self-service dashboard figures. */
export async function getEmployeeDashboardData(employeeId: number, employerId: number) {
  const [employee] = await query<RowDataPacket>(
    `SELECT e.id, e.name, e.employee_number, e.designation, e.date_of_joining, e.photo,
            e.bank_name, e.pf_number, e.esi_number, e.uan,
            COALESCE(d.department_name, e.department) AS department
       FROM employees e
       LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.id = ? AND e.deleted_at IS NULL
      LIMIT 1`,
    [employeeId]
  );

  const [attendance] = await query<RowDataPacket>(
    `SELECT
       SUM(status = 'Present') AS present,
       SUM(status = 'Absent') AS absent,
       SUM(status = 'Leave') AS leaveCount,
       SUM(status = 'Half Day') AS halfDay,
       SUM(status = 'On Duty') AS od,
       SUM(status = 'Week Off') AS weekOff,
       SUM(status = 'Holiday') AS holiday,
       COUNT(*) AS total
     FROM attendance
     WHERE employee_id = ? AND deleted_at IS NULL
       AND MONTH(attendance_date) = MONTH(CURDATE()) AND YEAR(attendance_date) = YEAR(CURDATE())`,
    [employeeId]
  );

  const leaveBalances = await query<EmployeeDashboardData['leaveBalances'][number] & RowDataPacket>(
    `SELECT lt.code AS leave_type, lt.name AS leave_name, ll.opening_balance, ll.accrued,
            ll.availed, ll.closing_balance
       FROM leave_ledgers ll
       JOIN leave_types lt ON lt.id = ll.leave_type_id
      WHERE ll.employee_id = ? AND ll.deleted_at IS NULL
      ORDER BY lt.id ASC`,
    [employeeId]
  );

  const latestPayslip = await queryOne<RowDataPacket>(
    `SELECT id, payslip_number, month, year, net_pay, gross_earnings, total_deductions,
            is_published, payment_status, period_from, period_to
       FROM payslips
      WHERE employee_id = ? AND deleted_at IS NULL AND is_published = 1
      ORDER BY year DESC, month DESC
      LIMIT 1`,
    [employeeId]
  );

  const documents = await query<EmployeeDashboardData['documents'][number] & RowDataPacket>(
    `SELECT id, document_name, document_type, expiry_date, is_verified
       FROM employee_documents
      WHERE employee_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 6`,
    [employeeId]
  );

  const [checklist] = await query<RowDataPacket>(
    // The personal-file checklist is a plain tick-list: one row per item with an
    // `is_checked` flag. It carries no status column and no soft delete, so the
    // completed count is simply the ticked rows.
    `SELECT (SELECT COUNT(*) FROM personal_file_checklist_items) AS total,
            (SELECT COUNT(*) FROM employee_file_checklist fc
              WHERE fc.employee_id = ? AND fc.is_checked = 1) AS submitted`,
    [employeeId]
  );

  const upcomingHolidays = await query<EmployeeDashboardData['upcomingHolidays'][number] & RowDataPacket>(
    `SELECT holiday_name, holiday_date, holiday_type
       FROM holidays
      WHERE deleted_at IS NULL AND (employer_id IS NULL OR employer_id = ?)
        AND holiday_date >= CURDATE()
      ORDER BY holiday_date ASC
      LIMIT 5`,
    [employerId]
  );

  return {
    employee: {
      id: Number(employee?.id ?? employeeId),
      name: String(employee?.name ?? ''),
      employee_number: String(employee?.employee_number ?? ''),
      designation: (employee?.designation as string | null) ?? null,
      department: (employee?.department as string | null) ?? null,
      date_of_joining: (employee?.date_of_joining as string | null) ?? null,
      photo: (employee?.photo as string | null) ?? null,
      bank_name: (employee?.bank_name as string | null) ?? null,
      pf_number: (employee?.pf_number as string | null) ?? null,
      esi_number: (employee?.esi_number as string | null) ?? null,
      uan: (employee?.uan as string | null) ?? null,
    },
    attendance: {
      present: Number(attendance?.present ?? 0),
      absent: Number(attendance?.absent ?? 0),
      leave: Number(attendance?.leaveCount ?? 0),
      halfDay: Number(attendance?.halfDay ?? 0),
      od: Number(attendance?.od ?? 0),
      weekOff: Number(attendance?.weekOff ?? 0),
      holiday: Number(attendance?.holiday ?? 0),
      total: Number(attendance?.total ?? 0),
    },
    leaveBalances: leaveBalances.map((row) => ({
      leave_type: String(row.leave_type),
      leave_name: String(row.leave_name),
      opening_balance: row.opening_balance as string,
      accrued: row.accrued as string,
      availed: row.availed as string,
      closing_balance: row.closing_balance as string,
    })),
    latestPayslip: latestPayslip
      ? {
          id: Number(latestPayslip.id),
          payslip_number: String(latestPayslip.payslip_number),
          month: Number(latestPayslip.month),
          year: Number(latestPayslip.year),
          net_pay: latestPayslip.net_pay as string,
          gross_earnings: latestPayslip.gross_earnings as string,
          total_deductions: latestPayslip.total_deductions as string,
          is_published: Number(latestPayslip.is_published),
          payment_status: String(latestPayslip.payment_status),
          period_from: String(latestPayslip.period_from),
          period_to: String(latestPayslip.period_to),
        }
      : null,
    documents,
    checklist: { total: Number(checklist?.total ?? 0), submitted: Number(checklist?.submitted ?? 0) },
    upcomingHolidays,
  };
}
