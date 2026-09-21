import { NextRequest } from "next/server";
import { db } from "@/db";
import { quotations, employers } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, generateId } from "@/lib/utils";
import { eq, desc } from "drizzle-orm";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const rows = await db.select({
      id: quotations.id, quotationNumber: quotations.quotationNumber, employerId: quotations.employerId,
      title: quotations.title, description: quotations.description, amount: quotations.amount,
      status: quotations.status, validUntil: quotations.validUntil, createdAt: quotations.createdAt,
      companyName: employers.companyName,
    }).from(quotations)
      .leftJoin(employers, eq(quotations.employerId, employers.id))
      .orderBy(desc(quotations.createdAt));

    return apiResponse({ quotations: rows });
  } catch {
    return apiError("Failed to fetch quotations", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const body = await request.json();
    const { employerId, title, description, amount, validUntil } = body;
    if (!title || !amount) return apiError("Title and amount are required", 400);

    const quotationNumber = generateId("QUO", new Date().getFullYear(), Date.now() % 1000000);

    const quotation = await insertReturning(quotations, {
      quotationNumber, employerId: employerId || null, title, description: description || null,
      amount, validUntil: validUntil || null, status: "draft", createdBy: authUser.userId,
    });

    return apiResponse({ quotation }, 201);
  } catch {
    return apiError("Failed to create quotation", 500);
  }
}
