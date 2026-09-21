import { db } from "@/db";
import { auditFindings, audits, employers } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, desc } from "drizzle-orm";

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
      description: auditFindings.description,
      severity: auditFindings.severity,
      status: auditFindings.status,
      targetDate: auditFindings.targetDate,
      responsiblePerson: auditFindings.responsiblePerson,
      createdAt: auditFindings.createdAt,
      auditId: audits.id,
      auditNumber: audits.auditNumber,
      companyName: employers.companyName,
    }).from(auditFindings)
      .innerJoin(audits, eq(auditFindings.auditId, audits.id))
      .innerJoin(employers, eq(audits.employerId, employers.id))
      .where(eq(audits.auditorId, auditorId))
      .orderBy(desc(auditFindings.createdAt));

    return apiResponse({ findings: rows });
  } catch {
    return apiError("Failed to fetch findings", 500);
  }
}
