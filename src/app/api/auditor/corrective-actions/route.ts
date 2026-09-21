import { db } from "@/db";
import { correctiveActions, audits, employers, auditFindings } from "@/db/schema";
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
      id: correctiveActions.id,
      findingId: correctiveActions.findingId,
      auditId: correctiveActions.auditId,
      description: correctiveActions.description,
      assignedTo: correctiveActions.assignedTo,
      dueDate: correctiveActions.dueDate,
      status: correctiveActions.status,
      evidenceUrl: correctiveActions.evidenceUrl,
      notes: correctiveActions.notes,
      companyName: employers.companyName,
      auditNumber: audits.auditNumber,
      findingDescription: auditFindings.description,
    }).from(correctiveActions)
      .innerJoin(audits, eq(correctiveActions.auditId, audits.id))
      .innerJoin(employers, eq(audits.employerId, employers.id))
      .innerJoin(auditFindings, eq(correctiveActions.findingId, auditFindings.id))
      .where(eq(audits.auditorId, auditorId))
      .orderBy(desc(correctiveActions.createdAt));

    return apiResponse({ correctiveActions: rows });
  } catch {
    return apiError("Failed to fetch corrective actions", 500);
  }
}
