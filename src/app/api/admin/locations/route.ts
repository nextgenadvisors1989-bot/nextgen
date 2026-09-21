import { NextRequest } from "next/server";
import { db } from "@/db";
import { locations } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { desc } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const rows = await db.select().from(locations).orderBy(desc(locations.createdAt));
    return apiResponse({ locations: rows });
  } catch {
    return apiError("Failed to fetch locations", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const body = await request.json();
    const { state, district, city, pincode } = body;
    if (!state) return apiError("State is required", 400);

    const location = await insertReturning(locations, {
      state, district: district || null, city: city || null, pincode: pincode || null,
    });

    return apiResponse({ location }, 201);
  } catch {
    return apiError("Failed to create location", 500);
  }
}
