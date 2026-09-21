import { NextRequest } from "next/server";
import { db } from "@/db";
import { employers, users, registrations } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError, getPagination, generateId } from "@/lib/utils";
import { eq, desc, count, sql } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { insertReturning } from "@/lib/db-helpers";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireRole(["super_admin", "admin"]);
    const { searchParams } = new URL(request.url);
    const { page, pageSize, offset } = getPagination(searchParams);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";

    let whereClause = sql`1=1 AND ${employers.deletedAt} IS NULL`;
    if (search) {
      whereClause = sql`${whereClause} AND (${employers.companyName} LIKE ${`%${search}%`} OR ${employers.email} LIKE ${`%${search}%`} OR ${employers.registrationId} LIKE ${`%${search}%`})`;
    }
    if (status) {
      whereClause = sql`${whereClause} AND ${employers.status} = ${status}`;
    }

    const [rows, totalCount] = await Promise.all([
      db.select().from(employers).where(whereClause).orderBy(desc(employers.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: count() }).from(employers).where(whereClause),
    ]);

    return apiResponse({ employers: rows, total: totalCount[0]?.count || 0, page, pageSize });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    console.error(err);
    return apiError("Failed to fetch employers", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireRole(["super_admin", "admin"]);
    const body = await request.json();

    const {
      companyName, tradeName, email, phone, address, state, district, pincode,
      industry, gstNumber, panNumber, cinNumber, epfRegNumber, esiRegNumber,
      contactPersonName, contactPersonPhone, website,
    } = body;

    if (!companyName || !email) {
      return apiError("Company name and email are required", 400);
    }

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      return apiError("An account with this email already exists", 400);
    }

    const year = new Date().getFullYear();
    const countRow = await db.select({ count: count() }).from(employers);
    const seq = (countRow[0]?.count || 0) + 1;
    const registrationId = generateId("COMP", year, seq);

    const newEmployer = await insertReturning(employers, {
      companyName, tradeName, email: email.toLowerCase(), phone, address,
      state, district, pincode, industry, gstNumber, panNumber, cinNumber,
      epfRegNumber, esiRegNumber, contactPersonName, contactPersonPhone, website,
      registrationId, status: "active", createdBy: authUser.userId,
    });

    const tempPassword = `Emp@${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const passwordHash = await hashPassword(tempPassword);

    const newUser = await insertReturning(users, {
      email: email.toLowerCase(),
      passwordHash,
      role: "employer_admin",
      status: "active",
      firstName: contactPersonName || companyName,
      phone: contactPersonPhone || phone,
      employerId: newEmployer.id,
      forcePasswordChange: true,
      createdBy: authUser.userId,
    });

    await db.insert(registrations).values({
      registrationNumber: registrationId,
      entityType: "employer",
      entityId: newEmployer.id,
      status: "active",
      createdBy: authUser.userId,
    });

    return apiResponse({ employer: newEmployer, tempPassword }, 201);
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    console.error(err);
    return apiError("Failed to create employer", 500);
  }
}
