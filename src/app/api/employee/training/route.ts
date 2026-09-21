import { db } from "@/db";
import { trainingRecords } from "@/db/schema";
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

    const rows = await db.select().from(trainingRecords)
      .where(eq(trainingRecords.employeeId, employeeId))
      .orderBy(desc(trainingRecords.trainingDate));

    return apiResponse({ trainings: rows });
  } catch {
    return apiError("Failed to fetch training records", 500);
  }
}
