import { NextRequest } from "next/server";
import { db } from "@/db";
import { leaveRequests, employees } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, and, desc, count, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { searchParams } = new URL(request.url);
    const { page, pageSize, offset } = getPagination(searchParams);
    const status = searchParams.get("status") || "";

    let whereClause = sql`${leaveRequests.employerId} = ${employerId}`;
    if (status) whereClause = sql`${whereClause} AND ${leaveRequests.status} = ${status}`;

    const [rows, totalCount] = await Promise.all([
      db.select({
        id: leaveRequests.id,
        employeeId: leaveRequests.employeeId,
        leaveType: leaveRequests.leaveType,
        fromDate: leaveRequests.fromDate,
        toDate: leaveRequests.toDate,
        days: leaveRequests.days,
        reason: leaveRequests.reason,
        status: leaveRequests.status,
        approvedAt: leaveRequests.approvedAt,
        rejectionReason: leaveRequests.rejectionReason,
        createdAt: leaveRequests.createdAt,
        empFirstName: employees.firstName,
        empLastName: employees.lastName,
        empNumber: employees.employeeNumber,
      }).from(leaveRequests)
        .leftJoin(employees, eq(leaveRequests.employeeId, employees.id))
        .where(whereClause)
        .orderBy(desc(leaveRequests.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ count: count() }).from(leaveRequests).where(whereClause),
    ]);

    return apiResponse({ leaveRequests: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch (err) {
    return apiError("Failed to fetch leave requests", 500);
  }
}
