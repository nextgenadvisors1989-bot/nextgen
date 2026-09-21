import { NextRequest } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, and, desc, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    const searchParams = new URL(request.url).searchParams;
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const { page, pageSize, offset } = getPagination(searchParams);

    const conditions = [eq(notifications.userId, authUser.userId)];
    if (unreadOnly) conditions.push(eq(notifications.isRead, false));

    const [rows, totalCount, unreadCount] = await Promise.all([
      db.select().from(notifications).where(and(...conditions)).orderBy(desc(notifications.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(notifications).where(and(...conditions)),
      db.select({ count: count() }).from(notifications).where(and(eq(notifications.userId, authUser.userId), eq(notifications.isRead, false))),
    ]);

    return apiResponse({ notifications: rows, total: totalCount[0]?.count || 0, unreadCount: unreadCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch notifications", 500);
  }
}
