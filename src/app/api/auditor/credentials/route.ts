import { db } from "@/db";
import { digitalCredentials, auditors, auditorRoles, auditorRoleTypes } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== "auditor") return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile", 400);

    const [auditor] = await db.select().from(auditors).where(eq(auditors.id, auditorId)).limit(1);
    const [credential] = await db.select().from(digitalCredentials)
      .where(and(eq(digitalCredentials.ownerType, "auditor"), eq(digitalCredentials.ownerId, auditorId)))
      .limit(1);
    const roles = await db.select({ name: auditorRoleTypes.name }).from(auditorRoles)
      .innerJoin(auditorRoleTypes, eq(auditorRoles.roleTypeId, auditorRoleTypes.id))
      .where(and(eq(auditorRoles.auditorId, auditorId), eq(auditorRoles.isActive, true)));

    return apiResponse({ auditor: auditor || null, credential: credential || null, roles: roles.map((r) => r.name) });
  } catch {
    return apiError("Failed to fetch credentials", 500);
  }
}
