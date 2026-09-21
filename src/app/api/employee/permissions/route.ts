import { NextRequest } from "next/server";
import { db } from "@/db";
import { permissionRequests, employees } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, desc, count } from "drizzle-orm";
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
      db.select().from(permissionRequests).where(eq(permissionRequests.employeeId, employeeId))
        .orderBy(desc(permissionRequests.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(permissionRequests).where(eq(permissionRequests.employeeId, employeeId)),
    ]);

    return apiResponse({ requests: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch permission requests", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!emp) return apiError("Employee not found", 404);

    const body = await request.json();
    const { type, date, fromTime, toTime, reason } = body;
    if (!type || !date) return apiError("Type and date are required", 400);

    const row = await insertReturning(permissionRequests, {
      employeeId,
      employerId: emp.employerId,
      type,
      date,
      fromTime: fromTime || null,
      toTime: toTime || null,
      reason: reason || null,
      status: "pending",
    });

    await notifyEmployer(emp.employerId, "New permission request", `${emp.firstName} ${emp.lastName || ""} requested ${type.replace(/_/g, " ")} on ${date}.`, { link: "/employer/permissions" });

    return apiResponse({ request: row }, 201);
  } catch {
    return apiError("Failed to submit permission request", 500);
  }
}
