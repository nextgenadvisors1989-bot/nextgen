import { NextRequest } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    const { id } = await params;
    const [existing] = await db.select().from(notifications)
      .where(and(eq(notifications.id, parseInt(id)), eq(notifications.userId, authUser.userId))).limit(1);
    if (!existing) return apiError("Notification not found", 404);

    const updated = await updateReturning(notifications, {
      isRead: true, readAt: new Date(),
    }, eq(notifications.id, existing.id));

    return apiResponse({ notification: updated });
  } catch {
    return apiError("Failed to update notification", 500);
  }
}
