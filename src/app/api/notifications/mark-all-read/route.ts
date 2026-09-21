import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    await db.update(notifications).set({
      isRead: true, readAt: new Date(),
    }).where(and(eq(notifications.userId, authUser.userId), eq(notifications.isRead, false)));

    return apiResponse({ message: "All notifications marked as read" });
  } catch {
    return apiError("Failed to update notifications", 500);
  }
}
