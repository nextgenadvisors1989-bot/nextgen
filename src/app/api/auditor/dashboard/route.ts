import { NextRequest } from "next/server";
import { db } from "@/db";
import { audits, auditorAssignments, auditFindings, correctiveActions, auditors } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, count, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["auditor", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile associated", 400);

    const [
      assignedCompanies,
      pendingAudits,
      draftAudits,
      submittedAudits,
      openFindings,
      openCAs,
    ] = await Promise.all([
      db.select({ count: count() }).from(auditorAssignments).where(and(eq(auditorAssignments.auditorId, auditorId), eq(auditorAssignments.isActive, true))),
      db.select({ count: count() }).from(audits).where(and(eq(audits.auditorId, auditorId), sql`${audits.status} IN ('submitted', 'under_review', 'revision_requested')`)),
      db.select({ count: count() }).from(audits).where(and(eq(audits.auditorId, auditorId), eq(audits.status, "draft"))),
      db.select({ count: count() }).from(audits).where(and(eq(audits.auditorId, auditorId), sql`${audits.status} IN ('submitted', 'approved', 'closed')` )),
      db.select({ count: count() }).from(auditFindings).where(sql`${auditFindings.auditId} IN (SELECT id FROM audits WHERE auditor_id = ${auditorId}) AND ${auditFindings.status} = 'open'`),
      db.select({ count: count() }).from(correctiveActions).where(sql`${correctiveActions.auditId} IN (SELECT id FROM audits WHERE auditor_id = ${auditorId}) AND ${correctiveActions.status} = 'open'`),
    ]);

    return apiResponse({
      stats: {
        assignedCompanies: assignedCompanies[0]?.count || 0,
        pendingAudits: pendingAudits[0]?.count || 0,
        draftAudits: draftAudits[0]?.count || 0,
        submittedAudits: submittedAudits[0]?.count || 0,
        openFindings: openFindings[0]?.count || 0,
        openCorrectiveActions: openCAs[0]?.count || 0,
      },
    });
  } catch (err) {
    console.error(err);
    return apiError("Failed to fetch auditor dashboard", 500);
  }
}
