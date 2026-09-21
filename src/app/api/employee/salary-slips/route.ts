import { NextRequest } from "next/server";
import { db } from "@/db";
import { salarySlips, payrollLines } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, desc, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const { page, pageSize, offset } = getPagination(new URL(request.url).searchParams);

    const [rows, totalCount] = await Promise.all([
      db.select({
        id: salarySlips.id,
        month: salarySlips.month,
        year: salarySlips.year,
        pdfUrl: salarySlips.pdfUrl,
        generatedAt: salarySlips.generatedAt,
        grossEarnings: payrollLines.grossEarnings,
        totalDeductions: payrollLines.totalDeductions,
        netWage: payrollLines.netWage,
        bankPaymentStatus: payrollLines.bankPaymentStatus,
      }).from(salarySlips)
        .leftJoin(payrollLines, eq(salarySlips.payrollLineId, payrollLines.id))
        .where(eq(salarySlips.employeeId, employeeId))
        .orderBy(desc(salarySlips.year), desc(salarySlips.month))
        .limit(pageSize).offset(offset),
      db.select({ count: count() }).from(salarySlips).where(eq(salarySlips.employeeId, employeeId)),
    ]);

    return apiResponse({ slips: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch salary slips", 500);
  }
}
