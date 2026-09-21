import { NextRequest } from "next/server";
import { db } from "@/db";
import { documentUploads, employees } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError } from "@/lib/utils";
import { eq, and, desc } from "drizzle-orm";
import { notifyEmployer } from "@/lib/notifications";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

const REQUIRED_DOCUMENT_TYPES = [
  "Appointment Order",
  "Confirmation Letter",
  "Service Record",
  "PF Form 2",
  "ESI Form",
  "Form 11",
  "Gratuity Nomination",
  "Bank Wage Acceptance",
  "Identity Proof",
  "Bank Proof",
];

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const rows = await db
      .select()
      .from(documentUploads)
      .where(and(eq(documentUploads.ownerType, "employee"), eq(documentUploads.ownerId, employeeId)))
      .orderBy(desc(documentUploads.createdAt));

    const uploadedTypes = new Set(rows.map((r) => r.documentType));
    const pendingTypes = REQUIRED_DOCUMENT_TYPES.filter((t) => !uploadedTypes.has(t));

    return apiResponse({ documents: rows, pendingTypes });
  } catch {
    return apiError("Failed to fetch documents", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser) return apiError("Unauthorized", 401);
    const employeeId = authUser.employeeId;
    if (!employeeId) return apiError("No employee profile", 400);

    const [emp] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!emp) return apiError("Employee not found", 404);

    const body = await request.json();
    const { documentType, fileName, fileUrl } = body;
    if (!documentType || !fileName || !fileUrl) {
      return apiError("Document type, file name and file URL are required", 400);
    }

    const doc = await insertReturning(documentUploads, {
        ownerType: "employee",
        ownerId: employeeId,
        employerId: emp.employerId,
        documentType,
        fileName,
        fileUrl,
        status: "pending",
        uploadedBy: authUser.userId,
        version: 1,
      });

    await notifyEmployer(emp.employerId, "New document uploaded", `${emp.firstName} ${emp.lastName || ""} uploaded ${documentType} for verification.`, { link: "/employer/documents" });

    return apiResponse({ document: doc }, 201);
  } catch {
    return apiError("Failed to upload document", 500);
  }
}
