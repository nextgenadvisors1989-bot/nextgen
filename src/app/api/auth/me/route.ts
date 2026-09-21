import { NextRequest } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) {
      return apiError("Unauthorized", 401);
    }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        status: users.status,
        forcePasswordChange: users.forcePasswordChange,
        employerId: users.employerId,
        auditorId: users.auditorId,
        employeeId: users.employeeId,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, authUser.userId))
      .limit(1);

    if (!user) {
      return apiError("User not found", 404);
    }

    return apiResponse({ user });
  } catch (err) {
    console.error("Me error:", err);
    return apiError("Failed to fetch user", 500);
  }
}
