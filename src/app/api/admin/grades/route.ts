import { NextRequest } from "next/server";
import { db } from "@/db";
import { grades } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { desc } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const rows = await db.select().from(grades).orderBy(desc(grades.createdAt));
    return apiResponse({ grades: rows });
  } catch {
    return apiError("Failed to fetch grades", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const body = await request.json();
    const { name, description } = body;
    if (!name) return apiError("Grade name is required", 400);

    const grade = await insertReturning(grades, { name, description: description || null });
    return apiResponse({ grade }, 201);
  } catch {
    return apiError("Failed to create grade", 500);
  }
}
