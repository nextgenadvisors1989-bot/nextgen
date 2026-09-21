import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditors, users, auditorRoles, auditorRoleTypes } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { id } = await params;

    const [auditor] = await db.select().from(auditors).where(eq(auditors.id, parseInt(id))).limit(1);
    if (!auditor) return apiError("Auditor not found", 404);

    const roles = await db
      .select({ id: auditorRoles.id, roleTypeId: auditorRoles.roleTypeId, name: auditorRoleTypes.name, isActive: auditorRoles.isActive })
      .from(auditorRoles)
      .innerJoin(auditorRoleTypes, eq(auditorRoles.roleTypeId, auditorRoleTypes.id))
      .where(eq(auditorRoles.auditorId, auditor.id));

    return apiResponse({ auditor: { ...auditor, roles } });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to fetch auditor", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await requireRole(["super_admin", "admin"]);
    const { id } = await params;
    const body = await request.json();

    const auditorId = parseInt(id);
    const [existing] = await db.select().from(auditors).where(eq(auditors.id, auditorId)).limit(1);
    if (!existing) return apiError("Auditor not found", 404);

    const { roleTypeIds, ...updateData } = body;

    await db.update(auditors).set({
      ...updateData,
      updatedAt: new Date(),
    }).where(eq(auditors.id, auditorId));

    // Update roles if provided
    if (roleTypeIds !== undefined) {
      await db.delete(auditorRoles).where(eq(auditorRoles.auditorId, auditorId));
      if (roleTypeIds.length > 0) {
        await db.insert(auditorRoles).values(
          roleTypeIds.map((roleTypeId: number) => ({
            auditorId,
            roleTypeId,
            assignedBy: authUser.userId,
          }))
        );
      }
    }

    // Sync status to user
    if (updateData.status && existing.userId) {
      const userStatus = updateData.status === "active" ? "active" : 
                        updateData.status === "suspended" ? "suspended" : 
                        "pending_activation";
      await db.update(users).set({ status: userStatus, updatedAt: new Date() }).where(eq(users.id, existing.userId));
    }

    return apiResponse({ message: "Auditor updated successfully" });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    console.error("Update auditor error:", err);
    return apiError("Failed to update auditor", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { id } = await params;

    const auditorId = parseInt(id);
    const [existing] = await db.select().from(auditors).where(eq(auditors.id, auditorId)).limit(1);
    if (!existing) return apiError("Auditor not found", 404);

    // Soft delete
    await db.update(auditors).set({ deletedAt: new Date(), status: "inactive" }).where(eq(auditors.id, auditorId));
    if (existing.userId) {
      await db.update(users).set({ status: "inactive" }).where(eq(users.id, existing.userId));
    }

    return apiResponse({ message: "Auditor deactivated successfully" });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to deactivate auditor", 500);
  }
}
