import { db } from "@/db";
import { payrollLines, benefits } from "@/db/schema";
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
      incentive: payrollLines.incentive,
      bonus: payrollLines.bonus,
      overtimeWage: payrollLines.overtimeWage,
    }).from(payrollLines)
      .where(eq(payrollLines.employeeId, employeeId))
      .orderBy(desc(payrollLines.year), desc(payrollLines.month))
      .limit(24);

    const rules = await db.select().from(benefits)
      .where(and(eq(benefits.employeeId, employeeId), eq(benefits.isActive, true)));

    return apiResponse({ monthly: lines, rules });
  } catch {
    return apiError("Failed to fetch benefits", 500);
  }
}
