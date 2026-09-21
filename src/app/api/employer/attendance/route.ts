import { NextRequest } from "next/server";
import { db } from "@/db";
import { attendance, employees, attendanceCorrections } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const requestedDate = new URL(request.url).searchParams.get("date");
    const [year, month, day] = (requestedDate || new Date().toISOString().slice(0, 10)).split("-").map(Number);
    const date = new Date(year, month - 1, day);

    const rows = await db.select({
      id: attendance.id,
      employeeId: attendance.employeeId,
      date: attendance.date,
      clockIn: attendance.clockIn,
      clockOut: attendance.clockOut,
      hoursWorked: attendance.hoursWorked,
      overtimeHours: attendance.overtimeHours,
      status: attendance.status,
      isLateArrival: attendance.isLateArrival,
      isEarlyDeparture: attendance.isEarlyDeparture,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employeeNumber: employees.employeeNumber,
    }).from(attendance)
      .innerJoin(employees, eq(attendance.employeeId, employees.id))
      .where(and(eq(attendance.employerId, employerId), eq(attendance.date, date)))
      .orderBy(employees.firstName);

    const corrections = await db.select({
      id: attendanceCorrections.id,
      attendanceId: attendanceCorrections.attendanceId,
      employeeId: attendanceCorrections.employeeId,
      requestedClockIn: attendanceCorrections.requestedClockIn,
      requestedClockOut: attendanceCorrections.requestedClockOut,
      reason: attendanceCorrections.reason,
      status: attendanceCorrections.status,
      createdAt: attendanceCorrections.createdAt,
      firstName: employees.firstName,
      lastName: employees.lastName,
    }).from(attendanceCorrections)
      .innerJoin(employees, eq(attendanceCorrections.employeeId, employees.id))
      .where(and(eq(employees.employerId, employerId), eq(attendanceCorrections.status, "pending")))
      .orderBy(desc(attendanceCorrections.createdAt));

    return apiResponse({ attendance: rows, corrections });
  } catch {
    return apiError("Failed to fetch attendance", 500);
  }
}
