import { NextRequest } from "next/server";
import { db } from "@/db";
import { fullFinalSettlements, employees, users } from "@/db/schema";
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
    const action = body.action;

    const [settlement] = await db.select().from(fullFinalSettlements)
      .where(and(eq(fullFinalSettlements.id, parseInt(id)), eq(fullFinalSettlements.employerId, employerId)))
      .limit(1);
    if (!settlement) return apiError("Settlement not found", 404);

    if (action === "finalize") {
      await db.update(fullFinalSettlements).set({
        status: "finalized", approvedBy: authUser.userId, approvedAt: new Date(), updatedAt: new Date(),
      }).where(eq(fullFinalSettlements.id, settlement.id));

      await db.update(employees).set({ status: "inactive", updatedAt: new Date() }).where(eq(employees.id, settlement.employeeId));

      const [emp] = await db.select().from(employees).where(eq(employees.id, settlement.employeeId)).limit(1);
      if (emp?.userId) {
        await db.update(users).set({ status: "inactive", updatedAt: new Date() }).where(eq(users.id, emp.userId));
      }

      await notifyEmployee(settlement.employeeId, "Settlement finalized", `Your full & final settlement of ₹${settlement.netPayable} has been finalized.`, { type: "success", link: "/employee/fnf-settlement" });

      return apiResponse({ message: "Settlement finalized and employee account deactivated" });
    }

    return apiError("Invalid action", 400);
  } catch {
    return apiError("Failed to finalize settlement", 500);
  }
}
