import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditorRoleTypes } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["super_admin", "admin", "auditor"]);
    const rows = await db.select().from(auditorRoleTypes).where(eq(auditorRoleTypes.isActive, true)).orderBy(auditorRoleTypes.name);
    return apiResponse({ roleTypes: rows });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to fetch role types", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(["super_admin", "admin"]);
    const body = await request.json();
    const { name, description } = body;
    if (!name) return apiError("Name is required", 400);

    const row = await insertReturning(auditorRoleTypes, { name, description });
    return apiResponse({ roleType: row }, 201);
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to create role type", 500);
  }
}
