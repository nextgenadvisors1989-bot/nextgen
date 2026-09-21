import { NextRequest } from "next/server";
import { db } from "@/db";
import { documentUploads, employees, employers, auditors } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, and, desc, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const searchParams = new URL(request.url).searchParams;
    const status = searchParams.get("status");
    const ownerType = searchParams.get("ownerType");
    const { page, pageSize, offset } = getPagination(searchParams);

    const conditions = [];
    if (status) conditions.push(eq(documentUploads.status, status as "pending" | "verified" | "rejected" | "expired"));
    if (ownerType) conditions.push(eq(documentUploads.ownerType, ownerType));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, totalCount] = await Promise.all([
      db.select().from(documentUploads).where(whereClause).orderBy(desc(documentUploads.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(documentUploads).where(whereClause),
    ]);

    const enriched = await Promise.all(rows.map(async (d) => {
      let ownerName = "-";
      if (d.ownerType === "employee") {
        const [e] = await db.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, d.ownerId)).limit(1);
        ownerName = e ? `${e.firstName} ${e.lastName || ""}` : "-";
      } else if (d.ownerType === "employer") {
        const [e] = await db.select({ companyName: employers.companyName }).from(employers).where(eq(employers.id, d.ownerId)).limit(1);
        ownerName = e?.companyName || "-";
      } else if (d.ownerType === "auditor") {
        const [a] = await db.select({ firstName: auditors.firstName, lastName: auditors.lastName }).from(auditors).where(eq(auditors.id, d.ownerId)).limit(1);
        ownerName = a ? `${a.firstName} ${a.lastName || ""}` : "-";
      }
      return { ...d, ownerName };
    }));

    return apiResponse({ documents: enriched, total: totalCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch documents", 500);
  }
}
