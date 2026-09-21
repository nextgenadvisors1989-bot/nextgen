import { NextRequest } from "next/server";
import { db } from "@/db";
import { fullFinalSettlements, employees, leaveBalances, wageConfigs, deductions } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, desc } from "drizzle-orm";
import { notifyEmployee } from "@/lib/notifications";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const rows = await db.select({
      id: fullFinalSettlements.id,
      employeeId: fullFinalSettlements.employeeId,
      lastWorkingDate: fullFinalSettlements.lastWorkingDate,
      pendingWage: fullFinalSettlements.pendingWage,
      leaveEncashment: fullFinalSettlements.leaveEncashment,
      gratuity: fullFinalSettlements.gratuity,
      bonus: fullFinalSettlements.bonus,
      deductions: fullFinalSettlements.deductions,
      netPayable: fullFinalSettlements.netPayable,
      status: fullFinalSettlements.status,
      createdAt: fullFinalSettlements.createdAt,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employeeNumber: employees.employeeNumber,
    }).from(fullFinalSettlements)
      .innerJoin(employees, eq(fullFinalSettlements.employeeId, employees.id))
      .where(eq(fullFinalSettlements.employerId, employerId))
      .orderBy(desc(fullFinalSettlements.createdAt));

    return apiResponse({ settlements: rows });
  } catch {
    return apiError("Failed to fetch settlements", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const body = await request.json();
    const { employeeId, lastWorkingDate, reasonForLeaving, noticePeriodDays, noticePeriodServed } = body;
    if (!employeeId || !lastWorkingDate) return apiError("Employee and last working date are required", 400);

    const [emp] = await db.select().from(employees).where(and(eq(employees.id, employeeId), eq(employees.employerId, employerId))).limit(1);
    if (!emp) return apiError("Employee not found in your company", 404);

    const [existing] = await db.select().from(fullFinalSettlements)
      .where(and(eq(fullFinalSettlements.employeeId, employeeId), eq(fullFinalSettlements.employerId, employerId)))
      .limit(1);
    if (existing) return apiError("An exit process has already been initiated for this employee", 400);

    // Auto-calculate pending components
    const [wageConfig] = await db.select().from(wageConfigs)
      .where(and(eq(wageConfigs.employeeId, employeeId), eq(wageConfigs.isActive, true))).limit(1);
    const dailyWage = wageConfig ? parseFloat(wageConfig.grossWage || "0") / 30 : 0;

    const lwd = new Date(lastWorkingDate);
    const pendingDays = lwd.getDate();
    const pendingWage = Math.round(dailyWage * pendingDays * 100) / 100;

    const year = lwd.getFullYear();
    const balances = await db.select().from(leaveBalances)
      .where(and(eq(leaveBalances.employeeId, employeeId), eq(leaveBalances.year, year)));
    const totalLeaveBalance = balances.reduce((sum, b) => sum + parseFloat(b.balance?.toString() || "0"), 0);
    const leaveEncashment = Math.round(dailyWage * totalLeaveBalance * 100) / 100;

    const activeDeductions = await db.select().from(deductions)
      .where(and(eq(deductions.employeeId, employeeId), eq(deductions.isActive, true)));
    const totalDeductions = activeDeductions.reduce((sum, d) => sum + parseFloat(d.value?.toString() || "0"), 0);

    const noticeShortfall = Math.max(0, (noticePeriodDays || 0) - (noticePeriodServed || 0));
    const noticeShortfallDeduction = Math.round(dailyWage * noticeShortfall * 100) / 100;

    const netPayable = pendingWage + leaveEncashment - totalDeductions - noticeShortfallDeduction;

    const settlement = await insertReturning(fullFinalSettlements, {
      employeeId, employerId,
      lastWorkingDate, reasonForLeaving: reasonForLeaving || null,
      noticePeriodDays: noticePeriodDays || 0, noticePeriodServed: noticePeriodServed || 0,
      noticePeriodShortfall: noticeShortfall,
      pendingWage: pendingWage.toString(), leaveEncashment: leaveEncashment.toString(),
      gratuity: "0", bonus: "0",
      deductions: (totalDeductions + noticeShortfallDeduction).toString(),
      netPayable: netPayable.toString(),
      status: "draft",
      createdBy: authUser.userId,
    });

    await notifyEmployee(employeeId, "Exit process initiated", `Your full & final settlement has been calculated for last working date ${lastWorkingDate}.`, { link: "/employee/fnf-settlement" });

    return apiResponse({ settlement }, 201);
  } catch {
    return apiError("Failed to initiate exit", 500);
  }
}
