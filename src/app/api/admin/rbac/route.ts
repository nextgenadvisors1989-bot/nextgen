import { NextRequest } from "next/server";
import { db } from "@/db";
import { roles, modules, rolePermissions } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { insertReturning, updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const [roleRows, moduleRows, permissionRows] = await Promise.all([
      db.select().from(roles).orderBy(roles.name),
      db.select().from(modules).orderBy(modules.name),
      db.select().from(rolePermissions),
    ]);

    return apiResponse({ roles: roleRows, modules: moduleRows, permissions: permissionRows });
  } catch {
    return apiError("Failed to fetch RBAC data", 500);
  }
}

export async function POST(request: NextRequest) {
  // Upsert a single role/module permission cell
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const body = await request.json();
    const { roleId, moduleId, action } = body;
    if (!roleId || !moduleId || !action) return apiError("Role, module and action are required", 400);

    const [existing] = await db.select().from(rolePermissions)
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.moduleId, moduleId))).limit(1);

    if (existing) {
      const updated = await updateReturning(rolePermissions, {
        action, updatedAt: new Date(), updatedBy: authUser.userId,
      }, eq(rolePermissions.id, existing.id));
      return apiResponse({ permission: updated });
    }

    const created = await insertReturning(rolePermissions, {
      roleId, moduleId, action, updatedBy: authUser.userId,
    });
    return apiResponse({ permission: created }, 201);
  } catch {
    return apiError("Failed to update permission", 500);
  }
}
