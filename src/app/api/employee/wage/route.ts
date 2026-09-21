import { db } from "@/db";
import { wageConfigs, payrollLines } from "@/db/schema";
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

    // Prefer an employee-specific wage config, fall back to employer-wide default
    const [empConfig] = await db.select().from(wageConfigs)
      .where(and(eq(wageConfigs.employeeId, employeeId), eq(wageConfigs.isActive, true)))
      .orderBy(desc(wageConfigs.effectiveFrom)).limit(1);

    const [latestLine] = await db.select().from(payrollLines)
      .where(eq(payrollLines.employeeId, employeeId))
      .orderBy(desc(payrollLines.year), desc(payrollLines.month)).limit(1);

    return apiResponse({ wageConfig: empConfig || null, latestPayroll: latestLine || null });
  } catch {
    return apiError("Failed to fetch wage details", 500);
  }
}
