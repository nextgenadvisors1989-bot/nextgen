import { NextRequest } from "next/server";
import { db } from "@/db";
import { salarySlips, payrollLines, employees } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, and, desc, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const searchParams = new URL(request.url).searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const { page, pageSize, offset } = getPagination(searchParams);

    const conditions = [eq(salarySlips.employerId, employerId)];
    if (month) conditions.push(eq(salarySlips.month, Number(month)));
    if (year) conditions.push(eq(salarySlips.year, Number(year)));

    const [rows, totalCount] = await Promise.all([
      db.select({
        id: salarySlips.id,
        month: salarySlips.month,
        year: salarySlips.year,
        pdfUrl: salarySlips.pdfUrl,
        generatedAt: salarySlips.generatedAt,
        netWage: payrollLines.netWage,
        bankPaymentStatus: payrollLines.bankPaymentStatus,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeNumber: employees.employeeNumber,
        email: employees.email,
      }).from(salarySlips)
        .innerJoin(employees, eq(salarySlips.employeeId, employees.id))
        .leftJoin(payrollLines, eq(salarySlips.payrollLineId, payrollLines.id))
        .where(and(...conditions))
        .orderBy(desc(salarySlips.year), desc(salarySlips.month))
        .limit(pageSize).offset(offset),
      db.select({ count: count() }).from(salarySlips).where(and(...conditions)),
    ]);

    return apiResponse({ slips: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch salary slips", 500);
  }
}
