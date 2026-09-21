import { NextRequest } from "next/server";
import { db } from "@/db";
import { legalActs } from "@/db/schema";
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
    const [existing] = await db.select().from(legalActs).where(eq(legalActs.id, parseInt(id))).limit(1);
    if (!existing) return apiError("Legal act not found", 404);

    const body = await request.json();
    const updated = await updateReturning(legalActs, {
      isActive: body.isActive ?? existing.isActive, updatedAt: new Date(),
    }, eq(legalActs.id, existing.id));

    return apiResponse({ act: updated });
  } catch {
    return apiError("Failed to update legal act", 500);
  }
}
