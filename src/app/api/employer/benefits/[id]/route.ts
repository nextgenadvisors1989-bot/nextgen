import { NextRequest } from "next/server";
import { db } from "@/db";
import { benefits } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const { id } = await params;
    const body = await request.json();
    const [existing] = await db.select().from(benefits).where(and(eq(benefits.id, parseInt(id)), eq(benefits.employerId, employerId))).limit(1);
    if (!existing) return apiError("Benefit not found", 404);

    const updated = await updateReturning(benefits, {
      isActive: body.isActive ?? existing.isActive, updatedAt: new Date(),
    }, eq(benefits.id, existing.id));

    return apiResponse({ benefit: updated });
  } catch {
    return apiError("Failed to update benefit", 500);
  }
}
