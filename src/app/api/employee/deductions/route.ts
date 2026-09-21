import { db } from "@/db";
import { payrollLines, deductions } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const lines = await db.select({
      id: payrollLines.id,
      month: payrollLines.month,
      year: payrollLines.year,
      pfDeduction: payrollLines.pfDeduction,
      esiDeduction: payrollLines.esiDeduction,
      ptDeduction: payrollLines.ptDeduction,
      messDeduction: payrollLines.messDeduction,
      otherDeductions: payrollLines.otherDeductions,
      totalDeductions: payrollLines.totalDeductions,
    }).from(payrollLines)
      .where(eq(payrollLines.employeeId, employeeId))
      .orderBy(desc(payrollLines.year), desc(payrollLines.month))
      .limit(24);

    const rules = await db.select().from(deductions)
      .where(and(eq(deductions.employeeId, employeeId), eq(deductions.isActive, true)));

    return apiResponse({ monthly: lines, rules });
  } catch {
    return apiError("Failed to fetch deductions", 500);
  }
}
