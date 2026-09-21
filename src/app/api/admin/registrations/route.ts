import { NextRequest } from "next/server";
import { db } from "@/db";
import { registrations, employers, auditors } from "@/db/schema";
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
    const status = searchParams.get("status");
    const { page, pageSize, offset } = getPagination(searchParams);

    const conditions = [];
    if (entityType) conditions.push(eq(registrations.entityType, entityType));
    if (status) conditions.push(eq(registrations.status, status as "draft" | "pending_documents" | "documents_verified" | "assessed" | "approved" | "pending_activation" | "active" | "rejected" | "suspended"));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, totalCount] = await Promise.all([
      db.select().from(registrations).where(whereClause).orderBy(desc(registrations.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(registrations).where(whereClause),
    ]);

    const enriched = await Promise.all(rows.map(async (r) => {
      let name = "-";
      if (r.entityType === "employer" && r.entityId) {
        const [e] = await db.select({ companyName: employers.companyName }).from(employers).where(eq(employers.id, r.entityId)).limit(1);
        name = e?.companyName || "-";
      } else if (r.entityType === "auditor" && r.entityId) {
        const [a] = await db.select({ firstName: auditors.firstName, lastName: auditors.lastName }).from(auditors).where(eq(auditors.id, r.entityId)).limit(1);
        name = a ? `${a.firstName} ${a.lastName || ""}` : "-";
      }
      return { ...r, entityName: name };
    }));

    return apiResponse({ registrations: enriched, total: totalCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch registrations", 500);
  }
}
