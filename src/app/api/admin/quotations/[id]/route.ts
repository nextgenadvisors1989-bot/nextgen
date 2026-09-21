import { NextRequest } from "next/server";
import { db } from "@/db";
import { quotations } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = ["draft", "sent", "accepted", "rejected", "expired"];

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const { id } = await params;
    const body = await request.json();
    if (!ALLOWED_STATUSES.includes(body.status)) return apiError("Invalid status", 400);

    const [existing] = await db.select().from(quotations).where(eq(quotations.id, parseInt(id))).limit(1);
    if (!existing) return apiError("Quotation not found", 404);

    const updated = await updateReturning(quotations, {
      status: body.status, updatedAt: new Date(),
    }, eq(quotations.id, existing.id));

    return apiResponse({ quotation: updated });
  } catch {
    return apiError("Failed to update quotation", 500);
  }
}
