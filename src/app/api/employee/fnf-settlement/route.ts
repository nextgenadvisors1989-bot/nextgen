import { db } from "@/db";
import { fullFinalSettlements } from "@/db/schema";
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

    const [settlement] = await db.select().from(fullFinalSettlements)
      .where(eq(fullFinalSettlements.employeeId, employeeId))
      .orderBy(desc(fullFinalSettlements.createdAt))
      .limit(1);

    return apiResponse({ settlement: settlement || null });
  } catch {
    return apiError("Failed to fetch settlement", 500);
  }
}
