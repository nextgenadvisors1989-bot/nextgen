import { NextRequest } from "next/server";
import { db } from "@/db";
import { permissionRequests, attendance } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { notifyEmployee } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { id } = await params;
    const reqId = parseInt(id);
    const body = await request.json();
    const { action, rejectionReason } = body;
    if (!["approve", "reject"].includes(action)) return apiError("Invalid action", 400);

    const [permReq] = await db.select().from(permissionRequests)
      .where(and(eq(permissionRequests.id, reqId), eq(permissionRequests.employerId, employerId)))
      .limit(1);
    if (!permReq) return apiError("Permission request not found", 404);
    if (permReq.status !== "pending") return apiError("Request is not pending", 400);

    await db.update(permissionRequests).set({
      status: action === "approve" ? "approved" : "rejected",
      approvedBy: authUser.userId,
      approvedAt: new Date(),
      rejectionReason: action === "reject" ? rejectionReason : null,
      updatedAt: new Date(),
    }).where(eq(permissionRequests.id, reqId));

    if (action === "approve" && (permReq.type === "late_arrival" || permReq.type === "early_departure")) {
      const [att] = await db.select().from(attendance)
        .where(and(eq(attendance.employeeId, permReq.employeeId), eq(attendance.date, permReq.date)))
        .limit(1);
      if (att) {
        await db.update(attendance).set({
          isLateArrival: permReq.type === "late_arrival" ? false : att.isLateArrival,
          isEarlyDeparture: permReq.type === "early_departure" ? false : att.isEarlyDeparture,
          remarks: `Permission approved: ${permReq.reason || ""}`,
          updatedAt: new Date(),
        }).where(eq(attendance.id, att.id));
      }
    }

    await notifyEmployee(
      permReq.employeeId,
      `Permission request ${action}d`,
      action === "approve" ? `Your ${permReq.type.replace(/_/g, " ")} request for ${permReq.date} was approved.` : `Your ${permReq.type.replace(/_/g, " ")} request was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
      { type: action === "approve" ? "success" : "warning", link: "/employee/permissions" }
    );

    return apiResponse({ message: `Permission request ${action}d` });
  } catch {
    return apiError("Failed to process request", 500);
  }
}
