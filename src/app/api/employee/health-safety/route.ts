import { db } from "@/db";
import { healthSafetyAcknowledgements } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const rows = await db.select().from(healthSafetyAcknowledgements)
      .where(eq(healthSafetyAcknowledgements.employeeId, employeeId))
      .orderBy(desc(healthSafetyAcknowledgements.createdAt));

    return apiResponse({ items: rows });
  } catch {
    return apiError("Failed to fetch health & safety items", 500);
  }
}
