import { db } from "@/db";
import { healthSafetyAcknowledgements } from "@/db/schema";
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
    const itemId = Number(id);
    const body = await request.json().catch(() => ({}));

    const [record] = await db.select().from(healthSafetyAcknowledgements)
      .where(and(eq(healthSafetyAcknowledgements.id, itemId), eq(healthSafetyAcknowledgements.employeeId, employeeId)))
      .limit(1);
    if (!record) return apiError("Item not found", 404);

    const updated = await updateReturning(healthSafetyAcknowledgements, {
        acknowledgedAt: new Date(),
        signatureData: body.signatureName || "Digitally acknowledged",
        updatedAt: new Date(),
      }, eq(healthSafetyAcknowledgements.id, itemId));

    return apiResponse({ item: updated });
  } catch {
    return apiError("Failed to acknowledge", 500);
  }
}
