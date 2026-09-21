import { NextRequest } from "next/server";
import { db } from "@/db";
import { systemAuditLog, users } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, and, desc, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const searchParams = new URL(request.url).searchParams;
    const entityType = searchParams.get("entityType");
    const { page, pageSize, offset } = getPagination(searchParams);

    const conditions = [];
    if (entityType) conditions.push(eq(systemAuditLog.entityType, entityType));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, totalCount] = await Promise.all([
      db.select({
        id: systemAuditLog.id, action: systemAuditLog.action, entityType: systemAuditLog.entityType,
        entityId: systemAuditLog.entityId, newData: systemAuditLog.newData, createdAt: systemAuditLog.createdAt,
        userEmail: users.email, userRole: users.role,
      }).from(systemAuditLog)
        .leftJoin(users, eq(systemAuditLog.userId, users.id))
        .where(whereClause)
        .orderBy(desc(systemAuditLog.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ count: count() }).from(systemAuditLog).where(whereClause),
    ]);

    return apiResponse({ logs: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch audit log", 500);
  }
}
