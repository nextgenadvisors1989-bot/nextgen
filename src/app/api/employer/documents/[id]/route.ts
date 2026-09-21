import { NextRequest } from "next/server";
import { db } from "@/db";
import { documentUploads } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { notifyEmployee } from "@/lib/notifications";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { id } = await params;
    const docId = parseInt(id);
    const body = await request.json();
    const { action, rejectionReason, expiryDate } = body;
    if (!["verify", "reject"].includes(action)) return apiError("Invalid action", 400);
    if (action === "reject" && !rejectionReason) return apiError("Rejection reason is required", 400);

    const [doc] = await db.select().from(documentUploads)
      .where(and(eq(documentUploads.id, docId), eq(documentUploads.employerId, employerId)))
      .limit(1);
    if (!doc) return apiError("Document not found", 404);

    const updated = await updateReturning(documentUploads, {
      status: action === "verify" ? "verified" : "rejected",
      verifiedBy: authUser.userId,
      verifiedAt: new Date(),
      rejectionReason: action === "reject" ? rejectionReason : null,
      expiryDate: expiryDate || doc.expiryDate,
      updatedAt: new Date(),
    }, eq(documentUploads.id, docId));

    if (doc.ownerType === "employee") {
      await notifyEmployee(
        doc.ownerId,
        `Document ${action === "verify" ? "verified" : "rejected"}`,
        action === "verify" ? `Your ${doc.documentType} was verified.` : `Your ${doc.documentType} was rejected.${rejectionReason ? ` Reason: ${rejectionReason}` : ""}`,
        { type: action === "verify" ? "success" : "warning", link: "/employee/documents" }
      );
    }

    return apiResponse({ document: updated });
  } catch {
    return apiError("Failed to update document", 500);
  }
}
