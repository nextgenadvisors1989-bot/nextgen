import { NextRequest } from "next/server";
import { db } from "@/db";
import { employers, users } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { id } = await params;
    const [employer] = await db.select().from(employers).where(eq(employers.id, parseInt(id))).limit(1);
    if (!employer) return apiError("Employer not found", 404);
    return apiResponse({ employer });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to fetch employer", 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authUser = await requireRole(["super_admin", "admin"]);
    const { id } = await params;
    const body = await request.json();

    const employerId = parseInt(id);
    await db.update(employers).set({ ...body, updatedAt: new Date() }).where(eq(employers.id, employerId));

    // Sync user status
    if (body.status) {
      const userStatus = body.status === "active" ? "active" : body.status === "suspended" ? "suspended" : "inactive";
      await db.update(users).set({ status: userStatus }).where(eq(users.employerId, employerId));
    }

    return apiResponse({ message: "Employer updated successfully" });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to update employer", 500);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { id } = await params;
    const employerId = parseInt(id);

    await db.update(employers).set({ deletedAt: new Date(), status: "inactive" }).where(eq(employers.id, employerId));
    await db.update(users).set({ status: "inactive" }).where(eq(users.employerId, employerId));

    return apiResponse({ message: "Employer deactivated" });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    return apiError("Failed to deactivate employer", 500);
  }
}
