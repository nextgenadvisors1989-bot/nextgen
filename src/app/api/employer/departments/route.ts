import { NextRequest } from "next/server";
import { db } from "@/db";
import { departments } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, isNull } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const rows = await db.select().from(departments)
      .where(and(eq(departments.employerId, employerId), isNull(departments.deletedAt)))
      .orderBy(departments.name);

    return apiResponse({ departments: rows });
  } catch (err) {
    return apiError("Failed to fetch departments", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);

    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const body = await request.json();
    const { name, description } = body;
    if (!name) return apiError("Name is required", 400);

    const dept = await insertReturning(departments, { employerId, name, description });
    return apiResponse({ department: dept }, 201);
  } catch (err) {
    return apiError("Failed to create department", 500);
  }
}
