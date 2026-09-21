import { NextRequest } from "next/server";
import { db } from "@/db";
import { permissionRequests, employees } from "@/db/schema";
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
    const status = searchParams.get("status");
    const { page, pageSize, offset } = getPagination(searchParams);

    const conditions = [eq(permissionRequests.employerId, employerId)];
    if (status) conditions.push(eq(permissionRequests.status, status));

    const [rows, totalCount] = await Promise.all([
      db.select({
        id: permissionRequests.id,
        employeeId: permissionRequests.employeeId,
        type: permissionRequests.type,
        date: permissionRequests.date,
        fromTime: permissionRequests.fromTime,
        toTime: permissionRequests.toTime,
        reason: permissionRequests.reason,
        status: permissionRequests.status,
        createdAt: permissionRequests.createdAt,
        firstName: employees.firstName,
        lastName: employees.lastName,
        employeeNumber: employees.employeeNumber,
      }).from(permissionRequests)
        .innerJoin(employees, eq(permissionRequests.employeeId, employees.id))
        .where(and(...conditions))
        .orderBy(desc(permissionRequests.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ count: count() }).from(permissionRequests).where(and(...conditions)),
    ]);

    return apiResponse({ requests: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch permission requests", 500);
  }
}
