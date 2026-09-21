import { NextRequest } from "next/server";
import { db } from "@/db";
import { complianceCalendar } from "@/db/schema";
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
    const [existing] = await db.select().from(complianceCalendar).where(eq(complianceCalendar.id, parseInt(id))).limit(1);
    if (!existing) return apiError("Calendar entry not found", 404);

    const body = await request.json();
    const updated = await updateReturning(complianceCalendar, {
      status: body.status || "completed",
      completedAt: body.status === "pending" ? null : new Date(),
      updatedAt: new Date(),
    }, eq(complianceCalendar.id, existing.id));

    return apiResponse({ item: updated });
  } catch {
    return apiError("Failed to update calendar entry", 500);
  }
}
