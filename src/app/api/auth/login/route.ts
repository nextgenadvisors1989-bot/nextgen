import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  setAuthCookies,
  createSession,
} from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return apiError("Email and password are required", 400);
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (!user) {
      return apiError("Invalid credentials. Please check your email and password.", 401);
    }

    const passwordValid = await verifyPassword(password, user.passwordHash);
    if (!passwordValid) {
      return apiError("Invalid credentials. Please check your email and password.", 401);
    }

    // Check account status
    if (user.status === "pending_verification") {
      return apiError("Please verify your email address before logging in.", 403);
    }
    if (user.status === "pending") {
      return apiError("Your account is pending approval by an administrator.", 403);
    }
    if (user.status === "suspended") {
      return apiError("Your account has been suspended. Please contact support.", 403);
    }
    if (user.status === "rejected") {
      return apiError("Your account registration has been rejected.", 403);
    }
    if (user.status === "inactive") {
      return apiError("Your account is inactive. Please contact support.", 403);
    }
    if (user.status === "pending_activation") {
      return apiError("Your account is pending activation. Please complete setup.", 403);
    }

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

    await createSession(
      user.id,
      refreshToken,
      request.headers.get("x-forwarded-for") || undefined,
      request.headers.get("user-agent") || undefined
    );

    await setAuthCookies(accessToken, refreshToken);

    // Update last login
    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id));

    return apiResponse({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        status: user.status,
        forcePasswordChange: user.forcePasswordChange,
        employerId: user.employerId,
        auditorId: user.auditorId,
        employeeId: user.employeeId,
      },
    });
  } catch (err) {
    console.error("Login error:", err);
    return apiError("An error occurred during login.", 500);
  }
}
