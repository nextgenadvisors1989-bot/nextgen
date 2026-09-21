import { NextRequest } from "next/server";
import { db } from "@/db";
import { documentUploads, employees } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, getPagination } from "@/lib/utils";
import { eq, and, desc, count } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["employer_admin", "hr_manager", "super_admin", "admin"].includes(authUser.role)) return apiError("Forbidden", 403);
    const employerId = authUser.employerId;
    if (!employerId) return apiError("No employer associated", 400);

    const searchParams = new URL(request.url).searchParams;
    const status = searchParams.get("status");
    const { page, pageSize, offset } = getPagination(searchParams);

    const conditions = [eq(documentUploads.employerId, employerId)];
    if (status) conditions.push(eq(documentUploads.status, status as "pending" | "verified" | "rejected" | "expired"));

    const [rows, totalCount] = await Promise.all([
      db.select({
        id: documentUploads.id,
        ownerType: documentUploads.ownerType,
        ownerId: documentUploads.ownerId,
        documentType: documentUploads.documentType,
        fileName: documentUploads.fileName,
        fileUrl: documentUploads.fileUrl,
        status: documentUploads.status,
        rejectionReason: documentUploads.rejectionReason,
        expiryDate: documentUploads.expiryDate,
        createdAt: documentUploads.createdAt,
        employeeFirstName: employees.firstName,
        employeeLastName: employees.lastName,
        employeeNumber: employees.employeeNumber,
      }).from(documentUploads)
        .leftJoin(employees, and(eq(documentUploads.ownerType, "employee"), eq(documentUploads.ownerId, employees.id)))
        .where(and(...conditions))
        .orderBy(desc(documentUploads.createdAt))
        .limit(pageSize).offset(offset),
      db.select({ count: count() }).from(documentUploads).where(and(...conditions)),
    ]);

    return apiResponse({ documents: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch {
    return apiError("Failed to fetch documents", 500);
  }
}
