import { NextRequest } from "next/server";
import { db } from "@/db";
import { audits, auditTypes, employers, auditorAssignments, auditorRoles, auditTypeRoles } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination, generateId } from "@/lib/utils";
import { eq, and, desc, count, sql } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["auditor", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile associated", 400);

    const { searchParams } = new URL(request.url);
    const { page, pageSize, offset } = getPagination(searchParams);
    const status = searchParams.get("status") || "";

    let whereClause = sql`${audits.auditorId} = ${auditorId}`;
    if (status) whereClause = sql`${whereClause} AND ${audits.status} = ${status}`;

    const [rows, totalCount] = await Promise.all([
      db.select({
        id: audits.id,
        auditNumber: audits.auditNumber,
        status: audits.status,
        auditDate: audits.auditDate,
        submittedAt: audits.submittedAt,
        createdAt: audits.createdAt,
        auditTypeName: auditTypes.name,
        companyName: employers.companyName,
      }).from(audits)
        .leftJoin(auditTypes, eq(audits.auditTypeId, auditTypes.id))
        .leftJoin(employers, eq(audits.employerId, employers.id))
        .where(whereClause)
        .orderBy(desc(audits.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ count: count() }).from(audits).where(whereClause),
    ]);

    return apiResponse({ audits: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch (err) {
    return apiError("Failed to fetch audits", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== "auditor") return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile associated", 400);

    const body = await request.json();
    const { auditTypeId, employerId, auditDate } = body;
    if (!auditTypeId || !employerId) return apiError("Audit type and employer are required", 400);

    // Verify auditor is assigned to this employer
    const [assignment] = await db.select().from(auditorAssignments)
      .where(and(eq(auditorAssignments.auditorId, auditorId), eq(auditorAssignments.employerId, parseInt(employerId)), eq(auditorAssignments.isActive, true)))
      .limit(1);
    if (!assignment) return apiError("You are not assigned to audit this company", 403);

    // Verify auditor has the role for this audit type
    const auditTypeRoleRows = await db.select().from(auditTypeRoles)
      .where(eq(auditTypeRoles.auditTypeId, parseInt(auditTypeId)));
    
    if (auditTypeRoleRows.length > 0) {
      const auditRoleTypeIds = auditTypeRoleRows.map(r => r.roleTypeId);
      const auditorRoleRows = await db.select().from(auditorRoles)
        .where(and(eq(auditorRoles.auditorId, auditorId), eq(auditorRoles.isActive, true)));
      const auditorRoleTypeIds = auditorRoleRows.map(r => r.roleTypeId);
      const hasRole = auditRoleTypeIds.some(id => auditorRoleTypeIds.includes(id));
      if (!hasRole) return apiError("You do not have the required role for this audit type", 403);
    }

    const year = new Date().getFullYear();
    const countRow = await db.select({ count: count() }).from(audits);
    const seq = (countRow[0]?.count || 0) + 1;
    const auditNumber = generateId("AUD-AUDIT", year, seq);

    const newAudit = await insertReturning(audits, {
      auditNumber,
      auditTypeId: parseInt(auditTypeId),
      auditorId,
      employerId: parseInt(employerId),
      assignmentId: assignment.id,
      status: "draft",
      auditDate,
      formData: {},
      createdBy: authUser.userId,
    });

    return apiResponse({ audit: newAudit }, 201);
  } catch (err) {
    console.error(err);
    return apiError("Failed to create audit", 500);
  }
}
