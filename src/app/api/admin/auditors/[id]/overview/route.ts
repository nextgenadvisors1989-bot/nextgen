import { db } from "@/db";
import { auditorAssignments, employers, audits, auditTypes, auditorRoles, auditorRoleTypes } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { id } = await params;
    const auditorId = parseInt(id);

    const roles = await db.select({ id: auditorRoleTypes.id, name: auditorRoleTypes.name }).from(auditorRoles)
      .innerJoin(auditorRoleTypes, eq(auditorRoles.roleTypeId, auditorRoleTypes.id))
      .where(eq(auditorRoles.auditorId, auditorId));

    const assignments = await db.select({
      id: auditorAssignments.id,
      employerId: auditorAssignments.employerId,
      companyName: employers.companyName,
      industry: employers.industry,
      state: employers.state,
      startDate: auditorAssignments.startDate,
      endDate: auditorAssignments.endDate,
      isActive: auditorAssignments.isActive,
    }).from(auditorAssignments)
      .innerJoin(employers, eq(auditorAssignments.employerId, employers.id))
      .where(eq(auditorAssignments.auditorId, auditorId))
      .orderBy(desc(auditorAssignments.createdAt));

    const auditList = await db.select({
      id: audits.id,
      auditNumber: audits.auditNumber,
      status: audits.status,
      auditDate: audits.auditDate,
      submittedAt: audits.submittedAt,
      companyName: employers.companyName,
      auditTypeName: auditTypes.name,
    }).from(audits)
      .innerJoin(employers, eq(audits.employerId, employers.id))
      .innerJoin(auditTypes, eq(audits.auditTypeId, auditTypes.id))
      .where(eq(audits.auditorId, auditorId))
      .orderBy(desc(audits.createdAt))
      .limit(100);

    return apiResponse({ roles, assignments, audits: auditList });
  } catch {
    return apiError("Failed to fetch auditor overview", 500);
  }
}
