import { NextRequest } from "next/server";
import { clearAuthCookies, invalidateSession } from "@/lib/auth";
import { apiResponse } from "@/lib/utils";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get("refresh_token")?.value;
    if (refreshToken) {
      await invalidateSession(refreshToken);
    }
    await clearAuthCookies();
    return apiResponse({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    await clearAuthCookies();
    return apiResponse({ message: "Logged out" });
  }
}
