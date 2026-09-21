import { db } from "@/db";
import { audits, auditFindings, correctiveActions, employers } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== "auditor") return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile", 400);

    const byCompany = await db.select({
      companyName: employers.companyName,
      totalAudits: sql<number>`count(distinct ${audits.id})`,
      submittedAudits: sql<number>`sum(case when ${audits.status} in ('submitted','approved','closed') then 1 else 0 end)`,
    }).from(audits)
      .innerJoin(employers, eq(audits.employerId, employers.id))
      .where(eq(audits.auditorId, auditorId))
      .groupBy(employers.companyName);

    const byMonth = await db.select({
      month: sql<string>`date_format(${audits.auditDate}, '%Y-%m')`,
      count: sql<number>`count(*)`,
    }).from(audits)
      .where(eq(audits.auditorId, auditorId))
      .groupBy(sql`date_format(${audits.auditDate}, '%Y-%m')`)
      .orderBy(sql`date_format(${audits.auditDate}, '%Y-%m') desc`)
      .limit(12);

    const [findingSummary] = await db.select({
      total: sql<number>`count(*)`,
      open: sql<number>`sum(case when ${auditFindings.status} = 'open' then 1 else 0 end)`,
      closed: sql<number>`sum(case when ${auditFindings.status} = 'closed' then 1 else 0 end)`,
      critical: sql<number>`sum(case when ${auditFindings.severity} = 'critical' then 1 else 0 end)`,
    }).from(auditFindings)
      .innerJoin(audits, eq(auditFindings.auditId, audits.id))
      .where(eq(audits.auditorId, auditorId));

    const [caSummary] = await db.select({
      total: sql<number>`count(*)`,
      overdue: sql<number>`sum(case when ${correctiveActions.status} != 'closed' and ${correctiveActions.dueDate} < curdate() then 1 else 0 end)`,
    }).from(correctiveActions)
      .innerJoin(audits, eq(correctiveActions.auditId, audits.id))
      .where(eq(audits.auditorId, auditorId));

    return apiResponse({ byCompany, byMonth, findingSummary, caSummary });
  } catch {
    return apiError("Failed to generate reports", 500);
  }
}
