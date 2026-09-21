import { db } from "@/db";
import { employers, employees, audits, auditFindings, payrollLines } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { sql, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole(["super_admin", "admin"]);

    const [byEmployeeType, byAuditStatus, byFindingSeverity, monthlyPayroll, topCompanies] = await Promise.all([
      db.select({ type: employees.employeeType, count: sql<number>`count(*)` }).from(employees).groupBy(employees.employeeType),
      db.select({ status: audits.status, count: sql<number>`count(*)` }).from(audits).groupBy(audits.status),
      db.select({ severity: auditFindings.severity, count: sql<number>`count(*)` }).from(auditFindings).groupBy(auditFindings.severity),
      db.select({
        month: sql<string>`date_format(${payrollLines.createdAt}, '%Y-%m')`,
        totalNet: sql<string>`sum(${payrollLines.netWage})`,
      }).from(payrollLines).groupBy(sql`date_format(${payrollLines.createdAt}, '%Y-%m')`).orderBy(sql`date_format(${payrollLines.createdAt}, '%Y-%m') desc`).limit(6),
      db.select({
        companyName: employers.companyName,
        employeeCount: sql<number>`(select count(*) from ${employees} where ${employees.employerId} = ${employers.id})`,
        auditCount: sql<number>`(select count(*) from ${audits} where ${audits.employerId} = ${employers.id})`,
      }).from(employers).where(eq(employers.status, "active")).limit(10),
    ]);

    return apiResponse({ byEmployeeType, byAuditStatus, byFindingSeverity, monthlyPayroll, topCompanies });
  } catch {
    return apiError("Failed to generate reports", 500);
  }
}
