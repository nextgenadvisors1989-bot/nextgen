import { NextRequest } from "next/server";
import { db } from "@/db";
import { audits, auditRevisions, auditTypes, employers, auditors } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, count } from "drizzle-orm";
import { notifyAdmins, notifyEmployer } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== "auditor") return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile", 400);

    const { id } = await params;
    const [audit] = await db.select().from(audits)
      .where(and(eq(audits.id, parseInt(id)), eq(audits.auditorId, auditorId)))
      .limit(1);
    if (!audit) return apiError("Audit not found", 404);
    if (audit.status !== "draft" && audit.status !== "revision_requested") {
      return apiError("Audit cannot be submitted in current status", 400);
    }

    // Save revision
    const revCount = await db.select({ count: count() }).from(auditRevisions).where(eq(auditRevisions.auditId, parseInt(id)));
    await db.insert(auditRevisions).values({
      auditId: parseInt(id),
      revisionNumber: (revCount[0]?.count || 0) + 1,
      formData: audit.formData,
      notes: audit.notes,
      createdBy: authUser.userId,
    });

    await db.update(audits).set({
      status: "submitted",
      submittedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(audits.id, parseInt(id)));

    const [auditType] = await db.select({ name: auditTypes.name }).from(auditTypes).where(eq(auditTypes.id, audit.auditTypeId)).limit(1);
    const [employer] = await db.select({ companyName: employers.companyName }).from(employers).where(eq(employers.id, audit.employerId)).limit(1);
    const [auditor] = await db.select({ firstName: auditors.firstName, lastName: auditors.lastName }).from(auditors).where(eq(auditors.id, auditorId)).limit(1);

    await notifyAdmins(
      "Audit submitted",
      `${auditor?.firstName || "An auditor"} ${auditor?.lastName || ""} submitted a ${auditType?.name || "audit"} for ${employer?.companyName || "a company"}.`,
      { link: "/admin/audit-inbox" }
    );
    await notifyEmployer(
      audit.employerId,
      "New audit submitted",
      `A ${auditType?.name || "audit"} was submitted for your company and is pending Admin review.`,
      { link: "/employer/audit-reports" }
    );

    return apiResponse({ message: "Audit submitted successfully" });
  } catch (err) {
    return apiError("Failed to submit audit", 500);
  }
}
