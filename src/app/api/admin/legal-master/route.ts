import { NextRequest } from "next/server";
import { db } from "@/db";
import { legalActs } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { desc } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    const rows = await db.select().from(legalActs).orderBy(desc(legalActs.createdAt));
    return apiResponse({ acts: rows });
  } catch {
    return apiError("Failed to fetch legal acts", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const body = await request.json();
    const { name, shortName, description, applicableStates } = body;
    if (!name) return apiError("Act name is required", 400);

    const act = await insertReturning(legalActs, {
      name, shortName: shortName || null, description: description || null,
      applicableStates: applicableStates ? applicableStates.split(",").map((s: string) => s.trim()) : null,
      isActive: true, createdBy: authUser.userId,
    });

    return apiResponse({ act }, 201);
  } catch {
    return apiError("Failed to create legal act", 500);
  }
}
