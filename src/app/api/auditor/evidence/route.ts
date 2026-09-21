import { db } from "@/db";
import { auditFindings, audits, employers } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, isNotNull, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== "auditor") return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile", 400);

    const rows = await db.select({
      id: auditFindings.id,
      findingNumber: auditFindings.findingNumber,
      evidenceUrl: auditFindings.evidenceUrl,
      createdAt: auditFindings.createdAt,
      companyName: employers.companyName,
      auditNumber: audits.auditNumber,
      auditId: audits.id,
    }).from(auditFindings)
      .innerJoin(audits, eq(auditFindings.auditId, audits.id))
      .innerJoin(employers, eq(audits.employerId, employers.id))
      .where(and(eq(audits.auditorId, auditorId), isNotNull(auditFindings.evidenceUrl)))
      .orderBy(desc(auditFindings.createdAt));

    return apiResponse({ evidence: rows });
  } catch {
    return apiError("Failed to fetch evidence", 500);
  }
}
