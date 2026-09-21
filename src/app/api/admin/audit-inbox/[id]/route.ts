import { NextRequest } from "next/server";
import { db } from "@/db";
import { audits } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { notifyAuditor } from "@/lib/notifications";
import { logActivity } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const { id } = await params;
    const auditId = parseInt(id);
    const body = await request.json();
    const { action, reviewNotes } = body;
    if (!["approve", "reject", "request_revision"].includes(action)) return apiError("Invalid action", 400);

    const [audit] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
    if (!audit) return apiError("Audit not found", 404);

    const statusMap = { approve: "approved", reject: "rejected", request_revision: "revision_requested" } as const;

    await db.update(audits).set({
      status: statusMap[action as keyof typeof statusMap],
      reviewNotes: reviewNotes || null,
      reviewedBy: authUser.userId,
      reviewedAt: new Date(),
      approvedAt: action === "approve" ? new Date() : audit.approvedAt,
      updatedAt: new Date(),
    }).where(eq(audits.id, auditId));

    const notifTitleMap = { approve: "Audit approved", reject: "Audit rejected", request_revision: "Revision requested on your audit" } as const;
    await notifyAuditor(
      audit.auditorId,
      notifTitleMap[action as keyof typeof notifTitleMap],
      reviewNotes || `Your audit ${audit.auditNumber || `#${audit.id}`} was ${statusMap[action as keyof typeof statusMap].replace("_", " ")}.`,
      { type: action === "approve" ? "success" : action === "reject" ? "error" : "warning", link: `/auditor/audits/${audit.id}` }
    );

    await logActivity(authUser.userId, `audit_${action}`, "audit", auditId, { reviewNotes });

    return apiResponse({ message: `Audit ${statusMap[action as keyof typeof statusMap]}` });
  } catch {
    return apiError("Failed to update audit", 500);
  }
}
