import { NextRequest } from "next/server";
import { db } from "@/db";
import { attendance, attendanceCorrections } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const body = await request.json();
    const { attendanceId, requestedClockIn, requestedClockOut, reason } = body;
    if (!attendanceId || !reason) return apiError("Attendance record and reason are required", 400);

    const [record] = await db.select().from(attendance)
      .where(and(eq(attendance.id, attendanceId), eq(attendance.employeeId, employeeId)))
      .limit(1);
    if (!record) return apiError("Attendance record not found", 404);

    const correction = await insertReturning(attendanceCorrections, {
      attendanceId,
      employeeId,
      requestedClockIn: requestedClockIn ? new Date(requestedClockIn) : null,
      requestedClockOut: requestedClockOut ? new Date(requestedClockOut) : null,
      reason,
      status: "pending",
    });

    return apiResponse({ correction }, 201);
  } catch {
    return apiError("Failed to submit correction request", 500);
  }
}
