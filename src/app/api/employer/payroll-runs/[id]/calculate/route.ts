import { NextRequest } from "next/server";
import { db } from "@/db";
import { payrollRuns, payrollLines, employees, wageConfigs, attendance, leaveRequests } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, sql, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { id } = await params;
    const runId = parseInt(id);

    const [run] = await db.select().from(payrollRuns)
      .where(and(eq(payrollRuns.id, runId), eq(payrollRuns.employerId, employerId)))
      .limit(1);
    if (!run) return apiError("Payroll run not found", 404);
    if (run.status === "locked" || run.status === "paid") return apiError("Payroll is locked and cannot be recalculated", 400);

    // Fetch all active employees
    const emps = await db.select().from(employees)
      .where(and(eq(employees.employerId, employerId), eq(employees.status, "active"), sql`${employees.deletedAt} IS NULL`));

    // Get days in month
    const daysInMonth = new Date(run.year, run.month, 0).getDate();

    // Delete existing lines
    await db.delete(payrollLines).where(and(eq(payrollLines.payrollRunId, runId)));

    let totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployerPf = 0, totalEmployerEsi = 0;

    for (const emp of emps) {
      // Get wage config
      const [wageConfig] = await db.select().from(wageConfigs)
        .where(and(eq(wageConfigs.employeeId, emp.id), eq(wageConfigs.isActive, true)))
        .limit(1);

      const basic = parseFloat(wageConfig?.basic?.toString() || "0");
      const da = parseFloat(wageConfig?.da?.toString() || "0");
      const hra = parseFloat(wageConfig?.hra?.toString() || "0");
      const ta = parseFloat(wageConfig?.ta?.toString() || "0");
      const pfPct = parseFloat(wageConfig?.pfPercentage?.toString() || "12");
      const esiPct = parseFloat(wageConfig?.esiPercentage?.toString() || "0.75");
      const ptAmt = parseFloat(wageConfig?.ptAmount?.toString() || "0");

      // Count attendance
      const attendanceCount = await db.select({ count: count() }).from(attendance)
        .where(and(
          eq(attendance.employeeId, emp.id),
          sql`EXTRACT(MONTH FROM ${attendance.date}::date) = ${run.month}`,
          sql`EXTRACT(YEAR FROM ${attendance.date}::date) = ${run.year}`,
          sql`${attendance.status} = 'present'`,
        ));

      const daysWorked = Math.min(attendanceCount[0]?.count || daysInMonth, daysInMonth);
      const daysLop = daysInMonth - daysWorked;

      // Proportional calculation
      const factor = daysWorked / daysInMonth;
      const earnedBasic = Math.round(basic * factor * 100) / 100;
      const earnedDa = Math.round(da * factor * 100) / 100;
      const earnedHra = Math.round(hra * factor * 100) / 100;
      const earnedTa = Math.round(ta * factor * 100) / 100;
      const grossEarnings = earnedBasic + earnedDa + earnedHra + earnedTa;

      const pfDeduction = Math.round((earnedBasic * pfPct / 100) * 100) / 100;
      const esiDeduction = grossEarnings <= 21000 ? Math.round((grossEarnings * esiPct / 100) * 100) / 100 : 0;
      const totalDeds = pfDeduction + esiDeduction + ptAmt;
      const netWage = grossEarnings - totalDeds;
      const empPf = Math.round((earnedBasic * 13 / 100) * 100) / 100;
      const empEsi = grossEarnings <= 21000 ? Math.round((grossEarnings * 3.25 / 100) * 100) / 100 : 0;

      await db.insert(payrollLines).values({
        payrollRunId: runId,
        employeeId: emp.id,
        employerId,
        month: run.month,
        year: run.year,
        daysInMonth,
        daysWorked: daysWorked.toString(),
        daysLop: daysLop.toString(),
        basic: earnedBasic.toString(),
        da: earnedDa.toString(),
        hra: earnedHra.toString(),
        ta: earnedTa.toString(),
        grossEarnings: grossEarnings.toString(),
        pfDeduction: pfDeduction.toString(),
        esiDeduction: esiDeduction.toString(),
        ptDeduction: ptAmt.toString(),
        totalDeductions: totalDeds.toString(),
        netWage: netWage.toString(),
        employerPf: empPf.toString(),
        employerEsi: empEsi.toString(),
      });

      totalGross += grossEarnings;
      totalDeductions += totalDeds;
      totalNet += netWage;
      totalEmployerPf += empPf;
      totalEmployerEsi += empEsi;
    }

    await db.update(payrollRuns).set({
      status: "calculated",
      totalGross: totalGross.toString(),
      totalDeductions: totalDeductions.toString(),
      totalNet: totalNet.toString(),
      totalEmployerPf: totalEmployerPf.toString(),
      totalEmployerEsi: totalEmployerEsi.toString(),
      processedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(payrollRuns.id, runId));

    return apiResponse({ message: "Payroll calculated successfully", totalGross, totalNet, employeeCount: emps.length });
  } catch (err) {
    console.error("Payroll calculate error:", err);
    return apiError("Failed to calculate payroll", 500);
  }
}
