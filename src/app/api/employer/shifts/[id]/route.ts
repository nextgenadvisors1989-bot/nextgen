import { NextRequest } from "next/server";
import { db } from "@/db";
import { shifts } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { id } = await params;
    const shiftId = parseInt(id);
    const body = await request.json();

    const [existing] = await db.select().from(shifts).where(and(eq(shifts.id, shiftId), eq(shifts.employerId, employerId))).limit(1);
    if (!existing) return apiError("Shift not found", 404);

    const allowed = ["name", "startTime", "endTime", "breakMinutes", "workingHours", "isActive"];
    const updateData: Record<string, unknown> = {};
    for (const f of allowed) if (body[f] !== undefined) updateData[f] = body[f];

    const updated = await updateReturning(shifts, { ...updateData, updatedAt: new Date() }, eq(shifts.id, shiftId));
    return apiResponse({ shift: updated });
  } catch {
    return apiError("Failed to update shift", 500);
  }
}
