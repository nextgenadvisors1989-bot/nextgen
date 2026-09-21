import { NextRequest } from "next/server";
import { db } from "@/db";
import { shifts } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const rows = await db.select().from(shifts).where(eq(shifts.employerId, employerId)).orderBy(shifts.startTime);
    return apiResponse({ shifts: rows });
  } catch {
    return apiError("Failed to fetch shifts", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const body = await request.json();
    const { name, startTime, endTime, breakMinutes, workingHours } = body;
    if (!name || !startTime || !endTime) return apiError("Name, start time and end time are required", 400);

    const shift = await insertReturning(shifts, {
      employerId, name, startTime, endTime,
      breakMinutes: breakMinutes ?? 30,
      workingHours: workingHours ?? null,
    });

    return apiResponse({ shift }, 201);
  } catch {
    return apiError("Failed to create shift", 500);
  }
}
