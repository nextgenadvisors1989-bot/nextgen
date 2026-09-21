import { db } from "@/db";
import { employees, attendance, payrollLines, leaveRequests, audits, departments } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, sql, gte } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [byDept, attendanceTrend, monthlyPayroll, leaveByType, auditStatus] = await Promise.all([
      db.select({
        department: sql<string>`coalesce(${departments.name}, 'Unassigned')`,
        count: sql<number>`count(*)`,
      }).from(employees)
        .leftJoin(departments, eq(employees.departmentId, departments.id))
        .where(eq(employees.employerId, employerId))
        .groupBy(sql`coalesce(${departments.name}, 'Unassigned')`),
      db.select({
        date: attendance.date,
        present: sql<number>`sum(case when ${attendance.status} = 'present' then 1 else 0 end)`,
      }).from(attendance).where(and(eq(attendance.employerId, employerId), gte(attendance.date, thirtyDaysAgo)))
        .groupBy(attendance.date).orderBy(attendance.date),
      db.select({
        month: sql<string>`date_format(${payrollLines.createdAt}, '%Y-%m')`,
        totalNet: sql<string>`sum(${payrollLines.netWage})`,
        totalGross: sql<string>`sum(${payrollLines.grossEarnings})`,
      }).from(payrollLines).innerJoin(employees, eq(payrollLines.employeeId, employees.id))
        .where(eq(employees.employerId, employerId))
        .groupBy(sql`date_format(${payrollLines.createdAt}, '%Y-%m')`)
        .orderBy(sql`date_format(${payrollLines.createdAt}, '%Y-%m') desc`).limit(6),
      db.select({ type: leaveRequests.leaveType, count: sql<number>`count(*)` }).from(leaveRequests)
        .where(eq(leaveRequests.employerId, employerId)).groupBy(leaveRequests.leaveType),
      db.select({ status: audits.status, count: sql<number>`count(*)` }).from(audits)
        .where(eq(audits.employerId, employerId)).groupBy(audits.status),
    ]);

    return apiResponse({ byDept, attendanceTrend, monthlyPayroll, leaveByType, auditStatus });
  } catch {
    return apiError("Failed to generate reports", 500);
  }
}
