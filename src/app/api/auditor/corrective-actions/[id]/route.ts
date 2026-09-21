import { NextRequest } from "next/server";
import { db } from "@/db";
import { correctiveActions, audits, auditFindings } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { notifyEmployer } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== "auditor") return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile", 400);

    const { id } = await params;
    const caId = parseInt(id);

    const [ca] = await db.select().from(correctiveActions).where(eq(correctiveActions.id, caId)).limit(1);
    if (!ca) return apiError("Corrective action not found", 404);

    const [audit] = await db.select().from(audits).where(eq(audits.id, ca.auditId)).limit(1);
    if (!audit || audit.auditorId !== auditorId) return apiError("Forbidden", 403);

    const body = await request.json();
    const { action } = body;
    if (!["accept", "reopen"].includes(action)) return apiError("Invalid action", 400);

    const newStatus = action === "accept" ? "closed" : "open";
    await db.update(correctiveActions).set({
      status: newStatus,
      completedAt: action === "accept" ? new Date() : null,
      updatedAt: new Date(),
    }).where(eq(correctiveActions.id, caId));

    await db.update(auditFindings).set({
      status: newStatus,
      updatedAt: new Date(),
    }).where(eq(auditFindings.id, ca.findingId));

    await notifyEmployer(
      audit.employerId,
      action === "accept" ? "Corrective action closed" : "Corrective action reopened",
      action === "accept" ? "The auditor accepted your evidence and closed the corrective action." : "The auditor reopened the corrective action — further evidence is needed.",
      { type: action === "accept" ? "success" : "warning", link: "/employer/audit-reports" }
    );

    return apiResponse({ message: `Corrective action ${action === "accept" ? "closed" : "reopened"}` });
  } catch {
    return apiError("Failed to update corrective action", 500);
  }
}
