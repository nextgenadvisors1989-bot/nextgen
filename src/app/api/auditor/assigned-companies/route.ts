import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditorAssignments, employers } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["auditor", "admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const auditorId = authUser.auditorId;
    if (!auditorId) return apiError("No auditor profile", 400);

    const rows = await db.select({
      assignmentId: auditorAssignments.id,
      employerId: employers.id,
      companyName: employers.companyName,
      email: employers.email,
      state: employers.state,
      industry: employers.industry,
      startDate: auditorAssignments.startDate,
      endDate: auditorAssignments.endDate,
    }).from(auditorAssignments)
      .innerJoin(employers, eq(auditorAssignments.employerId, employers.id))
      .where(and(eq(auditorAssignments.auditorId, auditorId), eq(auditorAssignments.isActive, true)));

    return apiResponse({ companies: rows });
  } catch {
    return apiError("Failed to fetch assigned companies", 500);
  }
}
