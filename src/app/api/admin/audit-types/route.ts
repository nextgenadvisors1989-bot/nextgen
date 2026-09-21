import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditTypes, auditTypeRoles, auditorRoleTypes } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, desc, count, sql } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["super_admin", "admin", "auditor"]);
    const { searchParams } = new URL(request.url);
    const { page, pageSize, offset } = getPagination(searchParams);

    const [rows, totalCount] = await Promise.all([
      db.select().from(auditTypes).orderBy(desc(auditTypes.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(auditTypes),
    ]);

    return apiResponse({ auditTypes: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to fetch audit types", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireRole(["super_admin", "admin"]);
    const body = await request.json();
    const { name, category, description, formSchema, validityDays, roleTypeIds } = body;
    if (!name) return apiError("Name is required", 400);

    const auditType = await insertReturning(auditTypes, {
      name, category, description,
      formSchema: formSchema || { sections: [] },
      validityDays: validityDays ? parseInt(validityDays) : undefined,
      createdBy: authUser.userId,
    });

    if (roleTypeIds && roleTypeIds.length > 0) {
      await db.insert(auditTypeRoles).values(
        roleTypeIds.map((id: number) => ({ auditTypeId: auditType.id, roleTypeId: id }))
      );
    }

    return apiResponse({ auditType }, 201);
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to create audit type", 500);
  }
}
