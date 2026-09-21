import { NextRequest } from "next/server";
import { db } from "@/db";
import { correctiveActions, audits } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { notifyAuditor } from "@/lib/notifications";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; caId: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { id, caId } = await params;
    const auditId = parseInt(id);
    const correctiveId = parseInt(caId);

    const [audit] = await db.select().from(audits).where(and(eq(audits.id, auditId), eq(audits.employerId, employerId))).limit(1);
    if (!audit) return apiError("Audit not found", 404);

    const [ca] = await db.select().from(correctiveActions).where(and(eq(correctiveActions.id, correctiveId), eq(correctiveActions.auditId, auditId))).limit(1);
    if (!ca) return apiError("Corrective action not found", 404);

    const body = await request.json();
    if (!body.evidenceUrl) return apiError("Evidence URL is required", 400);

    const updated = await updateReturning(correctiveActions, {
      evidenceUrl: body.evidenceUrl,
      notes: body.notes || ca.notes,
      status: "evidence_submitted",
      updatedAt: new Date(),
    }, eq(correctiveActions.id, correctiveId));

    await notifyAuditor(audit.auditorId, "Corrective evidence submitted", `Evidence was submitted for a corrective action on audit ${audit.auditNumber || `#${audit.id}`}.`, { link: "/auditor/corrective-actions" });

    return apiResponse({ correctiveAction: updated });
  } catch {
    return apiError("Failed to submit evidence", 500);
  }
}
