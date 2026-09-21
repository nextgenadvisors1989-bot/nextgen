import { NextRequest } from "next/server";
import { db } from "@/db";
import { complianceCalendar, employers } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, asc } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const rows = await db.select({
      id: complianceCalendar.id, employerId: complianceCalendar.employerId, title: complianceCalendar.title,
      description: complianceCalendar.description, dueDate: complianceCalendar.dueDate, frequency: complianceCalendar.frequency,
      status: complianceCalendar.status, assignedTo: complianceCalendar.assignedTo, reminderDays: complianceCalendar.reminderDays,
      companyName: employers.companyName,
    }).from(complianceCalendar)
      .leftJoin(employers, eq(complianceCalendar.employerId, employers.id))
      .orderBy(asc(complianceCalendar.dueDate));

    return apiResponse({ items: rows });
  } catch {
    return apiError("Failed to fetch compliance calendar", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const body = await request.json();
    const { employerId, title, description, dueDate, frequency, assignedTo, reminderDays } = body;
    if (!title || !dueDate) return apiError("Title and due date are required", 400);

    const item = await insertReturning(complianceCalendar, {
      employerId: employerId || null, title, description: description || null, dueDate,
      frequency: frequency || null, assignedTo: assignedTo || null, reminderDays: reminderDays ?? 7,
      status: "pending", createdBy: authUser.userId,
    });

    return apiResponse({ item }, 201);
  } catch {
    return apiError("Failed to create calendar entry", 500);
  }
}
