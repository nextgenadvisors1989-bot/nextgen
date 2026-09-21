import { NextRequest } from "next/server";
import { db } from "@/db";
import { audits, auditFindings, correctiveActions } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, count } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== "auditor") return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile", 400);

    const { id } = await params;
    const auditId = parseInt(id);
    const [audit] = await db.select().from(audits).where(and(eq(audits.id, auditId), eq(audits.auditorId, auditorId))).limit(1);
    if (!audit) return apiError("Audit not found", 404);

    const findings = await db.select().from(auditFindings).where(eq(auditFindings.auditId, auditId)).orderBy(auditFindings.createdAt);
    const correctives = await db.select().from(correctiveActions).where(eq(correctiveActions.auditId, auditId));

    return apiResponse({ findings, correctiveActions: correctives });
  } catch {
    return apiError("Failed to fetch findings", 500);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || authUser.role !== "auditor") return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile", 400);

    const { id } = await params;
    const auditId = parseInt(id);
    const [audit] = await db.select().from(audits).where(and(eq(audits.id, auditId), eq(audits.auditorId, auditorId))).limit(1);
    if (!audit) return apiError("Audit not found", 404);

    const body = await request.json();
    const { description, riskCategory, severity, legalRequirement, responsiblePerson, targetDate, correctiveAction, evidenceUrl } = body;
    if (!description) return apiError("Finding description is required", 400);

    const existingCount = await db.select({ count: count() }).from(auditFindings).where(eq(auditFindings.auditId, auditId));
    const findingNumber = `${audit.auditNumber || "AUD"}-F${(existingCount[0]?.count || 0) + 1}`;

    const finding = await insertReturning(auditFindings, {
      auditId, findingNumber, description,
      riskCategory: riskCategory || null, severity: severity || "medium",
      legalRequirement: legalRequirement || null, responsiblePerson: responsiblePerson || null,
      targetDate: targetDate || null, correctiveAction: correctiveAction || null,
      evidenceUrl: evidenceUrl || null, status: "open",
      createdBy: authUser.userId,
    });

    let correctiveRow = null;
    if (correctiveAction) {
      const ca = await insertReturning(correctiveActions, {
        findingId: finding.id, auditId,
        description: correctiveAction, assignedTo: responsiblePerson || null, dueDate: targetDate || null,
        status: "open", createdBy: authUser.userId,
      });
      correctiveRow = ca;
    }

    return apiResponse({ finding, correctiveAction: correctiveRow }, 201);
  } catch {
    return apiError("Failed to create finding", 500);
  }
}
