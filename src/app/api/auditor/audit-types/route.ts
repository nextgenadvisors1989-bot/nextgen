import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditTypes, auditTypeRoles, auditorRoles } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["auditor", "admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;

    let rows;
    if (auditorId && authUser.role === "auditor") {
      // Get auditor's active role type IDs
      const auditorRoleRows = await db.select({ roleTypeId: auditorRoles.roleTypeId })
        .from(auditorRoles)
        .where(and(eq(auditorRoles.auditorId, auditorId), eq(auditorRoles.isActive, true)));

      if (auditorRoleRows.length === 0) {
        // Return all active audit types if no specific roles
        rows = await db.select({ id: auditTypes.id, name: auditTypes.name, category: auditTypes.category, description: auditTypes.description })
          .from(auditTypes).where(eq(auditTypes.isActive, true));
      } else {
        const roleTypeIds = auditorRoleRows.map(r => r.roleTypeId);
        // Get audit types that match auditor's roles OR have no role restrictions
        const auditTypeIds = await db.select({ auditTypeId: auditTypeRoles.auditTypeId })
          .from(auditTypeRoles)
          .where(sql`${auditTypeRoles.roleTypeId} = ANY(${sql`ARRAY[${sql.join(roleTypeIds.map(id => sql`${id}`), sql`, `)}]`})`);
        
        const restrictedIds = auditTypeIds.map(r => r.auditTypeId);
        if (restrictedIds.length > 0) {
          rows = await db.select({ id: auditTypes.id, name: auditTypes.name, category: auditTypes.category, description: auditTypes.description })
            .from(auditTypes)
            .where(and(eq(auditTypes.isActive, true), sql`${auditTypes.id} = ANY(${sql`ARRAY[${sql.join(restrictedIds.map(id => sql`${id}`), sql`, `)}]`})`));
        } else {
          rows = await db.select({ id: auditTypes.id, name: auditTypes.name, category: auditTypes.category, description: auditTypes.description })
            .from(auditTypes).where(eq(auditTypes.isActive, true));
        }
      }
    } else {
      rows = await db.select({ id: auditTypes.id, name: auditTypes.name, category: auditTypes.category, description: auditTypes.description })
        .from(auditTypes).where(eq(auditTypes.isActive, true));
    }

    return apiResponse({ auditTypes: rows });
  } catch (err) {
    console.error(err);
    return apiError("Failed to fetch audit types", 500);
  }
}
