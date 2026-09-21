import { NextRequest } from "next/server";
import { db } from "@/db";
import { payrollLines, payrollRuns, employees, departments, designations } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { id } = await params;
    const runId = parseInt(id);

    const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.employerId, employerId))).limit(1);
    if (!run) return apiError("Payroll run not found", 404);

    const lines = await db.select({
      id: payrollLines.id,
      employeeId: payrollLines.employeeId,
      daysInMonth: payrollLines.daysInMonth,
      daysWorked: payrollLines.daysWorked,
      daysLop: payrollLines.daysLop,
      overtimeHours: payrollLines.overtimeHours,
      basic: payrollLines.basic,
      da: payrollLines.da,
      hra: payrollLines.hra,
      ta: payrollLines.ta,
      overtimeWage: payrollLines.overtimeWage,
      incentive: payrollLines.incentive,
      bonus: payrollLines.bonus,
      grossEarnings: payrollLines.grossEarnings,
      pfDeduction: payrollLines.pfDeduction,
      esiDeduction: payrollLines.esiDeduction,
      ptDeduction: payrollLines.ptDeduction,
      messDeduction: payrollLines.messDeduction,
      otherDeductions: payrollLines.otherDeductions,
      totalDeductions: payrollLines.totalDeductions,
      netWage: payrollLines.netWage,
      bankPaymentStatus: payrollLines.bankPaymentStatus,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employeeNumber: employees.employeeNumber,
      deptName: departments.name,
      desigName: designations.name,
    }).from(payrollLines)
      .innerJoin(employees, eq(payrollLines.employeeId, employees.id))
      .leftJoin(departments, eq(employees.departmentId, departments.id))
      .leftJoin(designations, eq(employees.designationId, designations.id))
      .where(eq(payrollLines.payrollRunId, runId))
      .orderBy(employees.firstName);

    return apiResponse({ run, lines });
  } catch {
    return apiError("Failed to fetch payroll register", 500);
  }
}
