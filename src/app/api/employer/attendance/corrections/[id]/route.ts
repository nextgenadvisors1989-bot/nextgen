import { NextRequest } from "next/server";
import { db } from "@/db";
import { attendanceCorrections, attendance } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { notifyEmployee } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);

    const { id } = await params;
    const correctionId = parseInt(id);
    const body = await request.json();
    const { action, reviewNotes } = body;
    if (!["approve", "reject"].includes(action)) return apiError("Invalid action", 400);

    const [correction] = await db.select().from(attendanceCorrections).where(eq(attendanceCorrections.id, correctionId)).limit(1);
    if (!correction) return apiError("Correction request not found", 404);

    await db.update(attendanceCorrections).set({
      status: action === "approve" ? "approved" : "rejected",
      reviewedBy: authUser.userId,
      reviewedAt: new Date(),
      reviewNotes: reviewNotes || null,
      updatedAt: new Date(),
    }).where(eq(attendanceCorrections.id, correctionId));

    if (action === "approve") {
      const updateData: Record<string, unknown> = { approvedBy: authUser.userId, updatedAt: new Date() };
      if (correction.requestedClockIn) updateData.clockIn = correction.requestedClockIn;
      if (correction.requestedClockOut) updateData.clockOut = correction.requestedClockOut;
      await db.update(attendance).set(updateData).where(eq(attendance.id, correction.attendanceId));
    }

    await notifyEmployee(
      correction.employeeId,
      `Attendance correction ${action}d`,
      action === "approve" ? "Your attendance correction request was approved." : "Your attendance correction request was rejected.",
      { type: action === "approve" ? "success" : "warning", link: "/employee/attendance" }
    );

    return apiResponse({ message: `Correction request ${action}d` });
  } catch {
    return apiError("Failed to process correction request", 500);
  }
}
