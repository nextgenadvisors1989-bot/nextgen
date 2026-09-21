import { NextRequest } from "next/server";
import { db } from "@/db";
import { attendance, employees } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { insertReturning, updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const [today] = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, employeeId), eq(attendance.date, todayStr())))
      .limit(1);

    return apiResponse({ today: today || null });
  } catch {
    return apiError("Failed to fetch today's attendance", 500);
  }
}

export async function POST(request: NextRequest) {
  // action: "clock_in" | "clock_out"
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!emp) return apiError("Employee not found", 404);

    const body = await request.json();
    const action = body.action;
    const date = todayStr();

    const [existing] = await db
      .select()
      .from(attendance)
      .where(and(eq(attendance.employeeId, employeeId), eq(attendance.date, date)))
      .limit(1);

    if (action === "clock_in") {
      if (existing) return apiError("You have already clocked in today", 400);
      const row = await insertReturning(attendance, {
          employeeId,
          employerId: emp.employerId,
          date,
          clockIn: new Date(),
          method: body.method || "manual",
          status: "present",
        });
      return apiResponse({ attendance: row }, 201);
    }

    if (action === "clock_out") {
      if (!existing) return apiError("You haven't clocked in today", 400);
      if (existing.clockOut) return apiError("You have already clocked out today", 400);
      const clockOut = new Date();
      const clockIn = existing.clockIn ? new Date(existing.clockIn) : clockOut;
      const hours = Math.max(0, (clockOut.getTime() - clockIn.getTime()) / (1000 * 60 * 60));
      const overtime = Math.max(0, hours - 8);

      const row = await updateReturning(attendance, {
          clockOut,
          hoursWorked: hours.toFixed(2),
          overtimeHours: overtime.toFixed(2),
          updatedAt: new Date(),
        }, eq(attendance.id, existing.id));
      return apiResponse({ attendance: row });
    }

    return apiError("Invalid action", 400);
  } catch {
    return apiError("Failed to record attendance", 500);
  }
}
