import { NextRequest } from "next/server";
import { db } from "@/db";
import { attendance } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, and, desc, count, gte, lte } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const searchParams = new URL(request.url).searchParams;
    const { page, pageSize, offset } = getPagination(searchParams);
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    const conditions = [eq(attendance.employeeId, employeeId)];
    if (month && year) {
      const start = `${year}-${month.padStart(2, "0")}-01`;
      const endDate = new Date(Number(year), Number(month), 0).getDate();
      const end = `${year}-${month.padStart(2, "0")}-${String(endDate).padStart(2, "0")}`;
      conditions.push(gte(attendance.date, start), lte(attendance.date, end));
    }

    const [rows, totalCount] = await Promise.all([
      db.select().from(attendance).where(and(...conditions))
        .orderBy(desc(attendance.date)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(attendance).where(and(...conditions)),
    ]);

    return apiResponse({ attendance: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch attendance", 500);
  }
}
