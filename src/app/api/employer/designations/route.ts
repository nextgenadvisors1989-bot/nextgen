import { NextRequest } from "next/server";
import { db } from "@/db";
import { designations } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { desc } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const rows = await db.select().from(designations).orderBy(designations.name);
    return apiResponse({ designations: rows });
  } catch {
    return apiError("Failed to fetch designations", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager", "admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const body = await request.json();
    if (!body.name) return apiError("Name is required", 400);
    const desig = await insertReturning(designations, { name: body.name, departmentId: body.departmentId, gradeId: body.gradeId });
    return apiResponse({ designation: desig }, 201);
  } catch {
    return apiError("Failed to create designation", 500);
  }
}
