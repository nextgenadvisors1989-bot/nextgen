import { NextRequest } from "next/server";
import { db } from "@/db";
import { audits, auditTypes, employers, auditRevisions } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["auditor", "admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const { id } = await params;
    const auditorId = authUser.auditorId;

    const query = db.select({
      id: audits.id,
      auditNumber: audits.auditNumber,
      status: audits.status,
      auditDate: audits.auditDate,
      formData: audits.formData,
      signatureData: audits.signatureData,
      notes: audits.notes,
      reviewNotes: audits.reviewNotes,
      submittedAt: audits.submittedAt,
      createdAt: audits.createdAt,
      auditTypeId: audits.auditTypeId,
      employerId: audits.employerId,
      auditorId: audits.auditorId,
      formSchema: auditTypes.formSchema,
      auditTypeName: auditTypes.name,
      companyName: employers.companyName,
    }).from(audits)
      .leftJoin(auditTypes, eq(audits.auditTypeId, auditTypes.id))
      .leftJoin(employers, eq(audits.employerId, employers.id));

    let result;
    if (auditorId && authUser.role === "auditor") {
      const rows = await query.where(and(eq(audits.id, parseInt(id)), eq(audits.auditorId, auditorId))).limit(1);
      result = rows[0];
    } else {
      const rows = await query.where(eq(audits.id, parseInt(id))).limit(1);
      result = rows[0];
    }

    if (!result) return apiError("Audit not found", 404);
    return apiResponse({ audit: result });
  } catch (err) {
    return apiError("Failed to fetch audit", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== "auditor") return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile", 400);

    const { id } = await params;
    const body = await request.json();

    const [audit] = await db.select().from(audits)
      .where(and(eq(audits.id, parseInt(id)), eq(audits.auditorId, auditorId)))
      .limit(1);
    if (!audit) return apiError("Audit not found", 404);
    if (audit.status !== "draft" && audit.status !== "revision_requested") {
      return apiError("Audit cannot be edited in current status", 400);
    }

    const { formData, auditDate, notes, signatureData } = body;
    await db.update(audits).set({
      formData: formData !== undefined ? formData : audit.formData,
      auditDate: auditDate || audit.auditDate,
      notes: notes !== undefined ? notes : audit.notes,
      signatureData: signatureData || audit.signatureData,
      updatedAt: new Date(),
    }).where(eq(audits.id, parseInt(id)));

    return apiResponse({ message: "Audit saved" });
  } catch (err) {
    return apiError("Failed to update audit", 500);
  }
}
