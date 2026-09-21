import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser, verifyPassword, hashPassword, invalidateAllUserSessions, generateAccessToken, generateRefreshToken, setAuthCookies, createSession } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return apiError("Current and new password are required", 400);
    }

    if (newPassword.length < 8) {
      return apiError("New password must be at least 8 characters", 400);
    }

    const [user] = await db.select().from(users).where(eq(users.id, authUser.userId)).limit(1);
    if (!user) return apiError("User not found", 404);

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) return apiError("Current password is incorrect", 400);

    const newHash = await hashPassword(newPassword);

    await db.update(users).set({
      passwordHash: newHash,
      forcePasswordChange: false,
      updatedAt: new Date(),
    }).where(eq(users.id, user.id));

    // Invalidate all sessions and create new one
    await invalidateAllUserSessions(user.id);

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      employerId: user.employerId,
      auditorId: user.auditorId,
      employeeId: user.employeeId,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);
    await createSession(user.id, refreshToken);
    await setAuthCookies(accessToken, refreshToken);

    return apiResponse({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    return apiError("Failed to change password", 500);
  }
}
