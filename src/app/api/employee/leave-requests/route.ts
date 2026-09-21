import { NextRequest } from "next/server";
import { db } from "@/db";
import { leaveRequests, leaveBalances, employees } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, and, desc, count } from "drizzle-orm";
import { notifyEmployer } from "@/lib/notifications";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const { page, pageSize, offset } = getPagination(new URL(request.url).searchParams);
    const [rows, totalCount] = await Promise.all([
      db.select().from(leaveRequests)
        .where(eq(leaveRequests.employeeId, employeeId))
        .orderBy(desc(leaveRequests.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ count: count() }).from(leaveRequests).where(eq(leaveRequests.employeeId, employeeId)),
    ]);

    return apiResponse({ leaveRequests: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch leave requests", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const body = await request.json();
    const { leaveType, fromDate, toDate, reason } = body;
    if (!leaveType || !fromDate || !toDate) return apiError("Leave type, from date and to date are required", 400);

    // Get employee to find employer
    const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!emp) return apiError("Employee not found", 404);

    // Calculate days
    const from = new Date(fromDate);
    const to = new Date(toDate);
    const diff = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    if (diff <= 0) return apiError("Invalid date range", 400);

    const lr = await insertReturning(leaveRequests, {
      employeeId,
      employerId: emp.employerId,
      leaveType,
      fromDate,
      toDate,
      days: diff.toString(),
      reason,
      status: "pending",
    });

    await notifyEmployer(emp.employerId, "New leave request", `${emp.firstName} ${emp.lastName || ""} applied for ${diff} day(s) of ${leaveType} leave.`, { link: "/employer/leave" });

    return apiResponse({ leaveRequest: lr }, 201);
  } catch (err) {
    console.error(err);
    return apiError("Failed to submit leave request", 500);
  }
}
