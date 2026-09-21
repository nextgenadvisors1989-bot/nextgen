import { db } from "@/db";
import { trainingRecords } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and } from "drizzle-orm";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const { id } = await params;
    const trainingId = Number(id);

    const [record] = await db.select().from(trainingRecords)
      .where(and(eq(trainingRecords.id, trainingId), eq(trainingRecords.employeeId, employeeId)))
      .limit(1);
    if (!record) return apiError("Training record not found", 404);

    const updated = await updateReturning(trainingRecords, { status: "completed", updatedAt: new Date() }, eq(trainingRecords.id, trainingId));

    return apiResponse({ training: updated });
  } catch {
    return apiError("Failed to acknowledge training", 500);
  }
}
