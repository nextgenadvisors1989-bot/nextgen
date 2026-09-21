import { NextRequest } from "next/server";
import { db } from "@/db";
import { payrollRuns, payrollLines, salarySlips } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { notifyEmployee } from "@/lib/notifications";
import { getMonthName } from "@/lib/utils";

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
    if (run.status === "locked" || run.status === "paid") return apiError("Payroll already finalized", 400);
    if (run.status !== "calculated") return apiError("Payroll must be calculated before finalizing", 400);

    // Lock payroll
    await db.update(payrollRuns).set({
      status: "locked",
      approvedAt: new Date(),
      lockedAt: new Date(),
      approvedBy: authUser.userId,
      updatedAt: new Date(),
    }).where(eq(payrollRuns.id, runId));

    // Generate salary slips
    const lines = await db.select().from(payrollLines).where(eq(payrollLines.payrollRunId, runId));
    for (const line of lines) {
      await db.insert(salarySlips).values({
        payrollLineId: line.id,
        employeeId: line.employeeId,
        employerId,
        month: run.month,
        year: run.year,
        generatedAt: new Date(),
      });

      await notifyEmployee(
        line.employeeId,
        "Salary slip available",
        `Your salary slip for ${getMonthName(run.month)} ${run.year} is ready — net pay ₹${line.netWage}.`,
        { type: "success", link: "/employee/salary-slips" }
      );
    }

    return apiResponse({ message: "Payroll finalized and salary slips generated" });
  } catch (err) {
    console.error(err);
    return apiError("Failed to finalize payroll", 500);
  }
}
