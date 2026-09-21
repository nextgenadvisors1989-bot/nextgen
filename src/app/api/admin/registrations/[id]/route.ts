import { NextRequest } from "next/server";
import { db } from "@/db";
import { registrations, employers, auditors } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { notifyEmployer, notifyAuditor } from "@/lib/notifications";
import { logActivity } from "@/lib/audit-log";

export const dynamic = "force-dynamic";

const STAGE_ORDER = ["draft", "pending_documents", "documents_verified", "assessed", "approved", "pending_activation", "active"] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const { id } = await params;
    const body = await request.json();
    const { action, rejectionReason } = body;
    if (!["advance", "reject"].includes(action)) return apiError("Invalid action", 400);

    const [reg] = await db.select().from(registrations).where(eq(registrations.id, parseInt(id))).limit(1);
    if (!reg) return apiError("Registration not found", 404);

    if (action === "reject") {
      if (!rejectionReason) return apiError("Rejection reason is required", 400);
      await db.update(registrations).set({
        status: "rejected", rejectionReason, rejectedAt: new Date(), reviewedBy: authUser.userId, updatedAt: new Date(),
      }).where(eq(registrations.id, reg.id));
      if (reg.entityType === "employer" && reg.entityId) {
        await db.update(employers).set({ status: "rejected" }).where(eq(employers.id, reg.entityId));
        await notifyEmployer(reg.entityId, "Registration rejected", `Your registration was rejected. Reason: ${rejectionReason}`, { type: "error" });
      }
      if (reg.entityType === "auditor" && reg.entityId) {
        await db.update(auditors).set({ status: "rejected" }).where(eq(auditors.id, reg.entityId));
        await notifyAuditor(reg.entityId, "Registration rejected", `Your registration was rejected. Reason: ${rejectionReason}`, { type: "error" });
      }
      await logActivity(authUser.userId, "registration_rejected", "registration", reg.id, { rejectionReason });
      return apiResponse({ message: "Registration rejected" });
    }

    const currentIndex = STAGE_ORDER.indexOf(reg.status as typeof STAGE_ORDER[number]);
    if (currentIndex === -1 || currentIndex === STAGE_ORDER.length - 1) return apiError("Registration is already at its final stage", 400);
    const nextStage = STAGE_ORDER[currentIndex + 1];

    const timestampField: Record<string, Date> = {};
    if (nextStage === "documents_verified") timestampField.verifiedAt = new Date();
    if (nextStage === "assessed") timestampField.assessedAt = new Date();
    if (nextStage === "approved") timestampField.approvedAt = new Date();

    await db.update(registrations).set({
      status: nextStage, reviewedBy: authUser.userId, updatedAt: new Date(), ...timestampField,
    }).where(eq(registrations.id, reg.id));

    if (nextStage === "active") {
      if (reg.entityType === "employer" && reg.entityId) await db.update(employers).set({ status: "active" }).where(eq(employers.id, reg.entityId));
      if (reg.entityType === "auditor" && reg.entityId) await db.update(auditors).set({ status: "active" }).where(eq(auditors.id, reg.entityId));
    }

    const stageLabel = nextStage.replace(/_/g, " ");
    if (reg.entityType === "employer" && reg.entityId) {
      await notifyEmployer(reg.entityId, nextStage === "active" ? "Registration approved — account active" : "Registration updated", `Your registration is now ${stageLabel}.`, { type: nextStage === "active" ? "success" : "info" });
    }
    if (reg.entityType === "auditor" && reg.entityId) {
      await notifyAuditor(reg.entityId, nextStage === "active" ? "Registration approved — account active" : "Registration updated", `Your registration is now ${stageLabel}.`, { type: nextStage === "active" ? "success" : "info" });
    }

    await logActivity(authUser.userId, "registration_advanced", "registration", reg.id, { nextStage });

    return apiResponse({ message: `Registration moved to ${nextStage}`, status: nextStage });
  } catch {
    return apiError("Failed to update registration", 500);
  }
}
