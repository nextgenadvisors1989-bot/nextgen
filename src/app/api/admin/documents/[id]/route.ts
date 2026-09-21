import { NextRequest } from "next/server";
import { db } from "@/db";
import { documentUploads } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { notifyEmployee, notifyEmployer, notifyAuditor } from "@/lib/notifications";
import { logActivity } from "@/lib/audit-log";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const { id } = await params;
    const docId = parseInt(id);
    const body = await request.json();
    const { action, rejectionReason, expiryDate } = body;
    if (!["verify", "reject", "request_reupload", "mark_expired"].includes(action)) return apiError("Invalid action", 400);
    if (action === "reject" && !rejectionReason) return apiError("Rejection reason is required", 400);

    const [doc] = await db.select().from(documentUploads).where(eq(documentUploads.id, docId)).limit(1);
    if (!doc) return apiError("Document not found", 404);

    const statusMap = { verify: "verified", reject: "rejected", request_reupload: "rejected", mark_expired: "expired" } as const;

    const updated = await updateReturning(documentUploads, {
      status: statusMap[action as keyof typeof statusMap],
      verifiedBy: authUser.userId,
      verifiedAt: new Date(),
      rejectionReason: action === "reject" || action === "request_reupload" ? (rejectionReason || "Re-upload requested") : null,
      expiryDate: expiryDate || doc.expiryDate,
      updatedAt: new Date(),
    }, eq(documentUploads.id, docId));

    const verb = action === "verify" ? "verified" : action === "mark_expired" ? "marked expired" : "rejected";
    const notifTitle = `Document ${verb}`;
    const notifMsg = `Your ${doc.documentType} was ${verb}.${rejectionReason ? ` Note: ${rejectionReason}` : ""}`;
    const notifOpts = { type: action === "verify" ? "success" as const : "warning" as const };
    if (doc.ownerType === "employee") await notifyEmployee(doc.ownerId, notifTitle, notifMsg, notifOpts);
    else if (doc.ownerType === "employer") await notifyEmployer(doc.ownerId, notifTitle, notifMsg, notifOpts);
    else if (doc.ownerType === "auditor") await notifyAuditor(doc.ownerId, notifTitle, notifMsg, notifOpts);

    await logActivity(authUser.userId, `document_${action}`, doc.ownerType, doc.ownerId, { documentType: doc.documentType });

    return apiResponse({ document: updated });
  } catch {
    return apiError("Failed to update document", 500);
  }
}
