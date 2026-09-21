import { NextRequest } from "next/server";
import { db } from "@/db";
import { digitalCredentials, employees, employers, auditors } from "@/db/schema";
import { getAuthUser } from "@/lib/auth";
import { apiResponse, apiError, generateId } from "@/lib/utils";
import { eq, desc } from "drizzle-orm";
import { notifyEmployee, notifyEmployer, notifyAuditor } from "@/lib/notifications";
import { logActivity } from "@/lib/audit-log";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const rows = await db.select().from(digitalCredentials).orderBy(desc(digitalCredentials.issuedAt)).limit(200);

    const enriched = await Promise.all(rows.map(async (c) => {
      let ownerName = "-";
      if (c.ownerType === "employee") {
        const [e] = await db.select({ firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(eq(employees.id, c.ownerId)).limit(1);
        ownerName = e ? `${e.firstName} ${e.lastName || ""}` : "-";
      } else if (c.ownerType === "employer") {
        const [e] = await db.select({ companyName: employers.companyName }).from(employers).where(eq(employers.id, c.ownerId)).limit(1);
        ownerName = e?.companyName || "-";
      } else if (c.ownerType === "auditor") {
        const [a] = await db.select({ firstName: auditors.firstName, lastName: auditors.lastName }).from(auditors).where(eq(auditors.id, c.ownerId)).limit(1);
        ownerName = a ? `${a.firstName} ${a.lastName || ""}` : "-";
      }
      return { ...c, ownerName };
    }));

    return apiResponse({ credentials: enriched });
  } catch {
    return apiError("Failed to fetch credentials", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser();
    if (!authUser || !["admin", "super_admin"].includes(authUser.role)) return apiError("Forbidden", 403);

    const body = await request.json();
    const { ownerType, ownerId, validityMonths } = body;
    if (!ownerType || !ownerId) return apiError("Owner type and owner ID are required", 400);
    if (!["employee", "employer", "auditor"].includes(ownerType)) return apiError("Invalid owner type", 400);

    const year = new Date().getFullYear();
    const credentialId = generateId(ownerType === "employee" ? "EMP-CRED" : ownerType === "employer" ? "EMR-CRED" : "AUD-CRED", year, ownerId);
    const digitalVerificationNumber = generateId("DVN", year, Date.now() % 1000000);

    const validFrom = new Date().toISOString().slice(0, 10);
    const validTo = new Date(Date.now() + (validityMonths || 12) * 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const credential = await insertReturning(digitalCredentials, {
      credentialId, ownerType, ownerId,
      digitalVerificationNumber,
      qrPayload: JSON.stringify({ ownerType, ownerId, digitalVerificationNumber }),
      validFrom, validTo, status: "active", issuedBy: authUser.userId,
    });

    const notifMsg = "Your digital ID card is ready — you can view it under My Credentials.";
    if (ownerType === "employee") await notifyEmployee(ownerId, "Digital credential issued", notifMsg, { type: "success" });
    else if (ownerType === "employer") await notifyEmployer(ownerId, "Digital credential issued", notifMsg, { type: "success" });
    else if (ownerType === "auditor") await notifyAuditor(ownerId, "Digital credential issued", notifMsg, { type: "success" });

    await logActivity(authUser.userId, "credential_generated", ownerType, ownerId, { credentialId });

    return apiResponse({ credential }, 201);
  } catch {
    return apiError("Failed to generate credential", 500);
  }
}
