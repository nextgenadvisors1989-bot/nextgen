import { NextRequest } from "next/server";
import { db } from "@/db";
import { leaveRequests, leaveBalances } from "@/db/schema";
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
    const body = await request.json();
    const { action, rejectionReason } = body;

    if (!["approve", "reject"].includes(action)) return apiError("Invalid action", 400);

    const [lr] = await db.select().from(leaveRequests)
      .where(and(eq(leaveRequests.id, parseInt(id)), eq(leaveRequests.employerId, employerId)))
      .limit(1);

    if (!lr) return apiError("Leave request not found", 404);
    if (lr.status !== "pending") return apiError("Leave request is not pending", 400);

    await db.update(leaveRequests).set({
      status: action === "approve" ? "approved" : "rejected",
      approvedBy: authUser.userId,
      approvedAt: new Date(),
      rejectionReason: action === "reject" ? rejectionReason : null,
      updatedAt: new Date(),
    }).where(eq(leaveRequests.id, lr.id));

    // Update leave balance if approved
    if (action === "approve") {
      const year = new Date(lr.fromDate).getFullYear();
      const [bal] = await db.select().from(leaveBalances)
        .where(and(eq(leaveBalances.employeeId, lr.employeeId), eq(leaveBalances.leaveType, lr.leaveType), eq(leaveBalances.year, year)))
        .limit(1);
      if (bal) {
        const newUsed = parseFloat(bal.used?.toString() || "0") + parseFloat(lr.days?.toString() || "0");
        const newBalance = parseFloat(bal.balance?.toString() || "0") - parseFloat(lr.days?.toString() || "0");
        await db.update(leaveBalances).set({ used: newUsed.toString(), balance: Math.max(0, newBalance).toString(), updatedAt: new Date() }).where(eq(leaveBalances.id, bal.id));
      }
    }

    await notifyEmployee(
      lr.employeeId,
      `Leave request ${action}d`,
      action === "approve" ? `Your ${lr.leaveType} leave from ${lr.fromDate} to ${lr.toDate} was approved.` : `Your ${lr.leaveType} leave request was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
      { type: action === "approve" ? "success" : "warning", link: "/employee/leave" }
    );

    return apiResponse({ message: `Leave request ${action}d successfully` });
  } catch (err) {
    return apiError("Failed to process leave request", 500);
  }
}
