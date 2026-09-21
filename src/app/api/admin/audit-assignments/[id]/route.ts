import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditorAssignments } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const { id } = await params;
    const body = await request.json();
    const [existing] = await db.select().from(auditorAssignments).where(eq(auditorAssignments.id, parseInt(id))).limit(1);
    if (!existing) return apiError("Assignment not found", 404);

    const updated = await updateReturning(auditorAssignments, {
      isActive: body.isActive ?? existing.isActive, updatedAt: new Date(),
    }, eq(auditorAssignments.id, existing.id));

    return apiResponse({ assignment: updated });
  } catch {
    return apiError("Failed to update assignment", 500);
  }
}
