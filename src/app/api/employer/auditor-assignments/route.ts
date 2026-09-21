import { db } from "@/db";
import { auditorAssignments, auditors, auditorRoles, auditorRoleTypes, audits } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const assignments = await db.select({
      id: auditorAssignments.id,
      auditorId: auditorAssignments.auditorId,
      startDate: auditorAssignments.startDate,
      endDate: auditorAssignments.endDate,
      isActive: auditorAssignments.isActive,
      notes: auditorAssignments.notes,
      auditorFirstName: auditors.firstName,
      auditorLastName: auditors.lastName,
      organization: auditors.organization,
      assessorNumber: auditors.assessorNumber,
    }).from(auditorAssignments)
      .innerJoin(auditors, eq(auditorAssignments.auditorId, auditors.id))
      .where(eq(auditorAssignments.employerId, employerId));

    // Attach roles and audit counts per auditor
    const result = await Promise.all(assignments.map(async (a) => {
      const roles = await db.select({ name: auditorRoleTypes.name }).from(auditorRoles)
        .innerJoin(auditorRoleTypes, eq(auditorRoles.roleTypeId, auditorRoleTypes.id))
        .where(and(eq(auditorRoles.auditorId, a.auditorId), eq(auditorRoles.isActive, true)));

      const [completedCount] = await db.select({ count: sql<number>`count(*)` }).from(audits)
        .where(and(eq(audits.auditorId, a.auditorId), eq(audits.employerId, employerId), eq(audits.status, "approved")));

      const [upcoming] = await db.select({ auditDate: audits.auditDate }).from(audits)
        .where(and(eq(audits.auditorId, a.auditorId), eq(audits.employerId, employerId), eq(audits.status, "draft")))
        .orderBy(audits.auditDate).limit(1);

      return { ...a, roles: roles.map((r) => r.name), completedAudits: completedCount?.count || 0, upcomingAuditDate: upcoming?.auditDate || null };
    }));

    return apiResponse({ assignments: result });
  } catch {
    return apiError("Failed to fetch auditor assignments", 500);
  }
}
