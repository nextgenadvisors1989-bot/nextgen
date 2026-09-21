import { NextRequest } from "next/server";
import { db } from "@/db";
import { employers } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { updateReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

const EDITABLE_FIELDS = [
  "tradeName", "phone", "address", "state", "district", "pincode", "industry",
  "website", "contactPersonName", "contactPersonPhone", "logoUrl",
];

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const [employer] = await db.select().from(employers).where(eq(employers.id, employerId)).limit(1);
    if (!employer) return apiError("Employer not found", 404);

    return apiResponse({ employer });
  } catch {
    return apiError("Failed to fetch company profile", 500);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const body = await request.json();
    const updateData: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }

    const updated = await updateReturning(employers, { ...updateData, updatedAt: new Date() }, eq(employers.id, employerId));

    return apiResponse({ employer: updated });
  } catch {
    return apiError("Failed to update company profile", 500);
  }
}
