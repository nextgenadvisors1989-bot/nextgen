import { db } from "@/db";
import { audits, auditTypes, auditors, auditFindings } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const rows = await db.select({
      id: audits.id,
      auditNumber: audits.auditNumber,
      auditDate: audits.auditDate,
      status: audits.status,
      auditTypeName: auditTypes.name,
      auditorFirstName: auditors.firstName,
      auditorLastName: auditors.lastName,
    }).from(audits)
      .innerJoin(auditTypes, eq(audits.auditTypeId, auditTypes.id))
      .innerJoin(auditors, eq(audits.auditorId, auditors.id))
      .where(eq(audits.employerId, employerId))
      .orderBy(desc(audits.auditDate));

    const result = await Promise.all(rows.map(async (a) => {
      const findings = await db.select({
        id: auditFindings.id, severity: auditFindings.severity, status: auditFindings.status,
      }).from(auditFindings).where(eq(auditFindings.auditId, a.id));

      const critical = findings.filter((f) => f.severity === "critical").length;
      const openFindings = findings.filter((f) => f.status !== "closed").length;

      return { ...a, totalFindings: findings.length, criticalFindings: critical, openFindings };
    }));

    return apiResponse({ audits: result });
  } catch {
    return apiError("Failed to fetch compliance register", 500);
  }
}
