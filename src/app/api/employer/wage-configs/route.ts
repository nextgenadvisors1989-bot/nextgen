import { NextRequest } from "next/server";
import { db } from "@/db";
import { wageConfigs, employees } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, desc } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const rows = await db.select({
      id: wageConfigs.id,
      employeeId: wageConfigs.employeeId,
      name: wageConfigs.name,
      basic: wageConfigs.basic,
      da: wageConfigs.da,
      hra: wageConfigs.hra,
      ta: wageConfigs.ta,
      otherAllowances: wageConfigs.otherAllowances,
      grossWage: wageConfigs.grossWage,
      pfPercentage: wageConfigs.pfPercentage,
      esiPercentage: wageConfigs.esiPercentage,
      ptAmount: wageConfigs.ptAmount,
      overtimeMultiplier: wageConfigs.overtimeMultiplier,
      isActive: wageConfigs.isActive,
      effectiveFrom: wageConfigs.effectiveFrom,
      employeeFirstName: employees.firstName,
      employeeLastName: employees.lastName,
      employeeNumber: employees.employeeNumber,
    }).from(wageConfigs)
      .leftJoin(employees, eq(wageConfigs.employeeId, employees.id))
      .where(eq(wageConfigs.employerId, employerId))
      .orderBy(desc(wageConfigs.effectiveFrom));

    return apiResponse({ wageConfigs: rows });
  } catch {
    return apiError("Failed to fetch wage configurations", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const body = await request.json();
    const { employeeId, name, basic, da, hra, ta, otherAllowances, pfPercentage, esiPercentage, ptAmount, overtimeMultiplier, effectiveFrom } = body;
    if (!basic) return apiError("Basic wage is required", 400);

    if (employeeId) {
      const [emp] = await db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.employerId, employerId))).limit(1);
      if (!emp) return apiError("Employee not found in your company", 404);
      // Deactivate any previous active config for this employee
      await db.update(wageConfigs).set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(wageConfigs.employeeId, employeeId), eq(wageConfigs.isActive, true)));
    }

    const grossWage = [basic, da, hra, ta, otherAllowances].reduce((sum: number, v) => sum + parseFloat(v || "0"), 0);

    const config = await insertReturning(wageConfigs, {
      employerId,
      employeeId: employeeId || null,
      name: name || null,
      basic, da: da || "0", hra: hra || "0", ta: ta || "0", otherAllowances: otherAllowances || "0",
      grossWage: grossWage.toString(),
      pfPercentage: pfPercentage || "12", esiPercentage: esiPercentage || "0.75",
      ptAmount: ptAmount || "0", overtimeMultiplier: overtimeMultiplier || "1.5",
      effectiveFrom: effectiveFrom || new Date().toISOString().slice(0, 10),
      isActive: true,
      createdBy: authUser.userId,
    });

    return apiResponse({ wageConfig: config }, 201);
  } catch {
    return apiError("Failed to create wage configuration", 500);
  }
}
