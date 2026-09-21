import { NextRequest } from "next/server";
import { db } from "@/db";
import { payrollLines, payrollRuns } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

const EDITABLE = ["incentive", "bonus", "otherDeductions", "messDeduction"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { id, lineId } = await params;
    const runId = parseInt(id);
    const lineIdNum = parseInt(lineId);

    const [run] = await db.select().from(payrollRuns).where(and(eq(payrollRuns.id, runId), eq(payrollRuns.employerId, employerId))).limit(1);
    if (!run) return apiError("Payroll run not found", 404);
    if (run.status === "locked" || run.status === "paid") return apiError("Payroll is locked and cannot be edited", 400);

    const [line] = await db.select().from(payrollLines).where(and(eq(payrollLines.id, lineIdNum), eq(payrollLines.payrollRunId, runId))).limit(1);
    if (!line) return apiError("Payroll line not found", 404);

    const body = await request.json();
    const updateData: Record<string, string> = {};
    for (const f of EDITABLE) if (body[f] !== undefined) updateData[f] = String(body[f]);

    const merged = { ...line, ...updateData };
    const gross = Number(merged.basic ?? 0) + Number(merged.da ?? 0) + Number(merged.hra ?? 0) + Number(merged.ta ?? 0) + Number(merged.overtimeWage ?? 0) + Number(merged.incentive ?? 0) + Number(merged.bonus ?? 0);
    const totalDeductions = Number(merged.pfDeduction ?? 0) + Number(merged.esiDeduction ?? 0) + Number(merged.ptDeduction ?? 0) + Number(merged.messDeduction ?? 0) + Number(merged.otherDeductions ?? 0);
    const netWage = gross - totalDeductions;

    const updated = await updateReturning(payrollLines, {
      ...updateData,
      grossEarnings: gross.toFixed(2),
      totalDeductions: totalDeductions.toFixed(2),
      netWage: netWage.toFixed(2),
      updatedAt: new Date(),
    }, eq(payrollLines.id, lineIdNum));

    return apiResponse({ line: updated });
  } catch {
    return apiError("Failed to update payroll line", 500);
  }
}
