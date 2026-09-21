import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditors, auditorRoles, auditorRoleTypes } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

const EDITABLE_FIELDS = ["phone", "state", "district", "languages", "qualification", "experience", "profilePhotoUrl"];

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== "auditor") return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile", 400);

    const [auditor] = await db.select().from(auditors).where(eq(auditors.id, auditorId)).limit(1);
    if (!auditor) return apiError("Auditor not found", 404);

    const roles = await db.select({ name: auditorRoleTypes.name }).from(auditorRoles)
      .innerJoin(auditorRoleTypes, eq(auditorRoles.roleTypeId, auditorRoleTypes.id))
      .where(and(eq(auditorRoles.auditorId, auditorId), eq(auditorRoles.isActive, true)));

    return apiResponse({ auditor, roles: roles.map((r) => r.name) });
  } catch {
    return apiError("Failed to fetch profile", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== "auditor") return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile", 400);

    const body = await request.json();
    const updateData: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) updateData[field] = field === "languages" ? String(body[field]).split(",").map((s: string) => s.trim()) : body[field];
    }

    const updated = await updateReturning(auditors, { ...updateData, updatedAt: new Date() }, eq(auditors.id, auditorId));
    return apiResponse({ auditor: updated });
  } catch {
    return apiError("Failed to update profile", 500);
  }
}
