import { NextRequest } from "next/server";
import { db } from "@/db";
import { digitalCredentials } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, generateId } from "@/lib/utils";
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
    const credId = parseInt(id);
    const [cred] = await db.select().from(digitalCredentials).where(eq(digitalCredentials.id, credId)).limit(1);
    if (!cred) return apiError("Credential not found", 404);

    const body = await request.json();
    const { action } = body;
    if (!["reissue", "suspend", "revoke", "reactivate"].includes(action)) return apiError("Invalid action", 400);

    if (action === "reissue") {
      const digitalVerificationNumber = generateId("DVN", new Date().getFullYear(), Date.now() % 1000000);
      const updated = await updateReturning(digitalCredentials, {
        digitalVerificationNumber,
        qrPayload: JSON.stringify({ ownerType: cred.ownerType, ownerId: cred.ownerId, digitalVerificationNumber }),
        status: "active", lastReissuedAt: new Date(), updatedAt: new Date(),
      }, eq(digitalCredentials.id, credId));
      await notifyOwner(cred.ownerType, cred.ownerId, "Credential reissued", "Your digital credential was reissued with a new verification number.", { type: "info" });
      await logActivity(authUser.userId, "credential_reissued", cred.ownerType, cred.ownerId);
      return apiResponse({ credential: updated });
    }

    const statusMap = { suspend: "inactive", revoke: "revoked", reactivate: "active" } as const;
    const updated = await updateReturning(digitalCredentials, {
      status: statusMap[action as keyof typeof statusMap], updatedAt: new Date(),
    }, eq(digitalCredentials.id, credId));

    const labelMap = { suspend: "suspended", revoke: "revoked", reactivate: "reactivated" } as const;
    await notifyOwner(cred.ownerType, cred.ownerId, `Credential ${labelMap[action as keyof typeof labelMap]}`, `Your digital credential was ${labelMap[action as keyof typeof labelMap]}.`, { type: action === "reactivate" ? "success" : "warning" });
    await logActivity(authUser.userId, `credential_${action}`, cred.ownerType, cred.ownerId);

    return apiResponse({ credential: updated });
  } catch {
    return apiError("Failed to update credential", 500);
  }
}

async function notifyOwner(ownerType: string, ownerId: number, title: string, message: string, opts: { type?: "info" | "success" | "warning" | "error" }) {
  if (ownerType === "employee") await notifyEmployee(ownerId, title, message, opts);
  else if (ownerType === "employer") await notifyEmployer(ownerId, title, message, opts);
  else if (ownerType === "auditor") await notifyAuditor(ownerId, title, message, opts);
}
