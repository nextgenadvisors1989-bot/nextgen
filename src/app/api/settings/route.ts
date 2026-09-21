import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiError, apiResponse } from "@/lib/utils";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    const [user] = await db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, authUser.userId))
      .limit(1);

    if (!user) return apiError("User not found", 404);

    return apiResponse({
      user,
      preferences: {
        theme: "light",
        emailAlerts: true,
        pushAlerts: true,
        weeklyDigest: true,
      },
    });
  } catch (error) {
    console.error("Settings fetch error:", error);
    return apiError("Failed to fetch settings", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.firstName !== undefined) updateData.firstName = String(body.firstName);
    if (body.lastName !== undefined) updateData.lastName = String(body.lastName);
    if (body.phone !== undefined) updateData.phone = String(body.phone);

    if (Object.keys(updateData).length > 0) {
      await db.update(users).set({ ...updateData, updatedAt: new Date() }).where(eq(users.id, authUser.userId));
    }

    return apiResponse({ saved: true, preferences: {
      theme: body.theme || "light",
      emailAlerts: body.emailAlerts ?? true,
      pushAlerts: body.pushAlerts ?? true,
      weeklyDigest: body.weeklyDigest ?? true,
    } });
  } catch (error) {
    console.error("Settings save error:", error);
    return apiError("Failed to save settings", 500);
  }
}
