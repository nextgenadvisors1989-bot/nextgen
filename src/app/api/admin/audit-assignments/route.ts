import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditorAssignments, auditors, employers } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, desc } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const rows = await db.select({
      id: auditorAssignments.id,
      auditorId: auditorAssignments.auditorId,
      employerId: auditorAssignments.employerId,
      startDate: auditorAssignments.startDate,
      endDate: auditorAssignments.endDate,
      isActive: auditorAssignments.isActive,
      notes: auditorAssignments.notes,
      auditorFirstName: auditors.firstName,
      auditorLastName: auditors.lastName,
      companyName: employers.companyName,
    }).from(auditorAssignments)
      .innerJoin(auditors, eq(auditorAssignments.auditorId, auditors.id))
      .innerJoin(employers, eq(auditorAssignments.employerId, employers.id))
      .orderBy(desc(auditorAssignments.createdAt));

    return apiResponse({ assignments: rows });
  } catch {
    return apiError("Failed to fetch assignments", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const body = await request.json();
    const { auditorId, employerId, startDate, endDate, notes } = body;
    if (!auditorId || !employerId) return apiError("Auditor and employer are required", 400);

    const assignment = await insertReturning(auditorAssignments, {
      auditorId, employerId, startDate: startDate || null, endDate: endDate || null,
      notes: notes || null, isActive: true, assignedBy: authUser.userId,
    });

    return apiResponse({ assignment }, 201);
  } catch {
    return apiError("Failed to create assignment", 500);
  }
}
