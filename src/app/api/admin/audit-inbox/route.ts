import { NextRequest } from "next/server";
import { db } from "@/db";
import { audits, auditTypes, auditors, employers, auditFindings } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, and, desc, count, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const searchParams = new URL(request.url).searchParams;
    const status = searchParams.get("status");
    const { page, pageSize, offset } = getPagination(searchParams);

    const conditions = [];
    if (status) conditions.push(eq(audits.status, status as "draft" | "submitted" | "under_review" | "revision_requested" | "revised" | "approved" | "rejected" | "closed"));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const [rows, totalCount] = await Promise.all([
      db.select({
        id: audits.id, auditNumber: audits.auditNumber, status: audits.status,
        auditDate: audits.auditDate, submittedAt: audits.submittedAt, pdfUrl: audits.pdfUrl,
        auditTypeName: auditTypes.name, companyName: employers.companyName,
        auditorFirstName: auditors.firstName, auditorLastName: auditors.lastName,
      }).from(audits)
        .innerJoin(auditTypes, eq(audits.auditTypeId, auditTypes.id))
        .innerJoin(employers, eq(audits.employerId, employers.id))
        .innerJoin(auditors, eq(audits.auditorId, auditors.id))
        .where(whereClause)
        .orderBy(desc(audits.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ count: count() }).from(audits).where(whereClause),
    ]);

    const enriched = await Promise.all(rows.map(async (a) => {
      const [f] = await db.select({
        total: sql<number>`count(*)`,
        critical: sql<number>`sum(case when ${auditFindings.severity} = 'critical' then 1 else 0 end)`,
      }).from(auditFindings).where(eq(auditFindings.auditId, a.id));
      return { ...a, findingsCount: f?.total || 0, criticalFindings: f?.critical || 0 };
    }));

    return apiResponse({ audits: enriched, total: totalCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch audit inbox", 500);
  }
}
