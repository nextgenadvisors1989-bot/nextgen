import { db } from "@/db";
import { audits, auditTypes, auditors, auditFindings } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, desc, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const rows = await db.select({
      id: audits.id,
      auditNumber: audits.auditNumber,
      auditDate: audits.auditDate,
      status: audits.status,
      pdfUrl: audits.pdfUrl,
      submittedAt: audits.submittedAt,
      auditTypeName: auditTypes.name,
      auditorFirstName: auditors.firstName,
      auditorLastName: auditors.lastName,
    }).from(audits)
      .innerJoin(auditTypes, eq(audits.auditTypeId, auditTypes.id))
      .innerJoin(auditors, eq(audits.auditorId, auditors.id))
      .where(and(eq(audits.employerId, employerId), sql`${audits.status} != 'draft'`))
      .orderBy(desc(audits.submittedAt));

    return apiResponse({ audits: rows });
  } catch {
    return apiError("Failed to fetch audit reports", 500);
  }
}
