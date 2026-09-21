import { NextRequest } from "next/server";
import { db } from "@/db";
import { audits, auditFindings, correctiveActions } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { id } = await params;
    const auditId = parseInt(id);

    const [audit] = await db.select().from(audits).where(and(eq(audits.id, auditId), eq(audits.employerId, employerId))).limit(1);
    if (!audit) return apiError("Audit not found", 404);

    const findings = await db.select().from(auditFindings).where(eq(auditFindings.auditId, auditId));
    const findingIds = findings.map((f) => f.id);
    const correctives = findingIds.length
      ? await db.select().from(correctiveActions).where(eq(correctiveActions.auditId, auditId))
      : [];

    return apiResponse({ audit, findings, correctiveActions: correctives });
  } catch {
    return apiError("Failed to fetch audit detail", 500);
  }
}
