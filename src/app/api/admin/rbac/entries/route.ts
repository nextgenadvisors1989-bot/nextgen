import { NextRequest } from "next/server";
import { db } from "@/db";
import { roles, modules } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const body = await request.json();
    const { kind, name, displayName, description } = body;
    if (!kind || !name) return apiError("Kind and name are required", 400);

    if (kind === "role") {
      const row = await insertReturning(roles, { name, displayName: displayName || name, description: description || null });
      return apiResponse({ role: row }, 201);
    }
    if (kind === "module") {
      const row = await insertReturning(modules, { name, displayName: displayName || name, description: description || null });
      return apiResponse({ module: row }, 201);
    }
    return apiError("Invalid kind", 400);
  } catch {
    return apiError("Failed to create entry", 500);
  }
}
