import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditTypes, auditTypeRoles } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin", "auditor"]);
    const { id } = await params;
    const [at] = await db.select().from(auditTypes).where(eq(auditTypes.id, parseInt(id))).limit(1);
    if (!at) return apiError("Audit type not found", 404);
    const roles = await db.select().from(auditTypeRoles).where(eq(auditTypeRoles.auditTypeId, at.id));
    return apiResponse({ auditType: { ...at, roles } });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to fetch audit type", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { id } = await params;
    const body = await request.json();
    const { roleTypeIds, ...updateData } = body;

    await db.update(auditTypes).set({ ...updateData, updatedAt: new Date() }).where(eq(auditTypes.id, parseInt(id)));

    if (roleTypeIds !== undefined) {
      await db.delete(auditTypeRoles).where(eq(auditTypeRoles.auditTypeId, parseInt(id)));
      if (roleTypeIds.length > 0) {
        await db.insert(auditTypeRoles).values(roleTypeIds.map((rid: number) => ({ auditTypeId: parseInt(id), roleTypeId: rid })));
      }
    }

    return apiResponse({ message: "Audit type updated" });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to update audit type", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { id } = await params;
    await db.update(auditTypes).set({ isActive: false, updatedAt: new Date() }).where(eq(auditTypes.id, parseInt(id)));
    return apiResponse({ message: "Audit type deactivated" });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to deactivate audit type", 500);
  }
}
