import { NextRequest } from "next/server";
import { db } from "@/db";
import { payrollRuns, payrollLines, employees, wageConfigs, attendance, leaveRequests } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { page, pageSize, offset } = getPagination(new URL(request.url).searchParams);
    const [rows, totalCount] = await Promise.all([
      db.select().from(payrollRuns).where(eq(payrollRuns.employerId, employerId)).orderBy(desc(payrollRuns.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(payrollRuns).where(eq(payrollRuns.employerId, employerId)),
    ]);
    return apiResponse({ payrollRuns: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch (err) {
    return apiError("Failed to fetch payroll runs", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const body = await request.json();
    const { month, year } = body;
    if (!month || !year) return apiError("Month and year are required", 400);

    // Check if payroll already exists for this month/year
    const existing = await db.select({ id: payrollRuns.id }).from(payrollRuns)
      .where(and(eq(payrollRuns.employerId, employerId), eq(payrollRuns.month, parseInt(month)), eq(payrollRuns.year, parseInt(year))))
      .limit(1);
    if (existing.length > 0) return apiError("Payroll already exists for this month/year", 400);

    const payrollRun = await insertReturning(payrollRuns, {
      employerId,
      month: parseInt(month),
      year: parseInt(year),
      status: "draft",
      createdBy: authUser.userId,
    });

    return apiResponse({ payrollRun }, 201);
  } catch (err) {
    console.error(err);
    return apiError("Failed to create payroll run", 500);
  }
}
