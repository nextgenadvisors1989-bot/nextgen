import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditors, users } from "@/db/schema";
import { requireRole, hashPassword } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { id } = await params;
    const auditorId = parseInt(id);

    const [auditor] = await db.select().from(auditors).where(eq(auditors.id, auditorId)).limit(1);
    if (!auditor) return apiError("Auditor not found", 404);
    if (!auditor.userId) return apiError("This auditor has no login account yet", 400);

    const body = await request.json();
    let newPassword: string = body.newPassword;

    // Admin can type an exact password, or leave blank to auto-generate a fresh one
    if (!newPassword) {
      newPassword = `Audit@${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    } else if (newPassword.length < 8) {
      return apiError("Password must be at least 8 characters", 400);
    }

    const passwordHash = await hashPassword(newPassword);
    await db.update(users).set({
      passwordHash, forcePasswordChange: true, updatedAt: new Date(),
    }).where(eq(users.id, auditor.userId));

    return apiResponse({ message: "Password reset successfully", newPassword });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to reset password", 500);
  }
}
