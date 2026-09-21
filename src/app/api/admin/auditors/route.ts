import { NextRequest } from "next/server";
import { db } from "@/db";
import { auditors, users, auditorRoles, auditorRoleTypes, registrations } from "@/db/schema";
import { requireRole } from "@/lib/auth";
import { apiResponse, apiError, getPagination, generateId } from "@/lib/utils";
import { eq, or, desc, count, inArray, sql } from "drizzle-orm";
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
    const roleTypeId = searchParams.get("roleTypeId") || "";

    let whereClause = sql`1=1`;
    if (search) {
      whereClause = sql`${whereClause} AND (${auditors.firstName} LIKE ${`%${search}%`} OR ${auditors.lastName} LIKE ${`%${search}%`} OR ${auditors.email} LIKE ${`%${search}%`} OR ${auditors.assessorNumber} LIKE ${`%${search}%`})`;
    }
    if (status) {
      whereClause = sql`${whereClause} AND ${auditors.status} = ${status}`;
    }
    if (roleTypeId) {
      whereClause = sql`${whereClause} AND ${auditors.id} IN (SELECT ${auditorRoles.auditorId} FROM ${auditorRoles} WHERE ${auditorRoles.roleTypeId} = ${parseInt(roleTypeId)} AND ${auditorRoles.isActive} = true)`;
    }

    const [rows, totalCount] = await Promise.all([
      db.select({
        id: auditors.id,
        firstName: auditors.firstName,
        lastName: auditors.lastName,
        email: auditors.email,
        phone: auditors.phone,
        organization: auditors.organization,
        assessorNumber: auditors.assessorNumber,
        experience: auditors.experience,
        state: auditors.state,
        status: auditors.status,
        registrationId: auditors.registrationId,
        validityStart: auditors.validityStart,
        validityEnd: auditors.validityEnd,
        createdAt: auditors.createdAt,
      })
        .from(auditors)
        .where(whereClause)
        .orderBy(desc(auditors.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: count() }).from(auditors).where(whereClause),
    ]);

    // Fetch roles for each auditor
    const auditorIds = rows.map(r => r.id);
    let roleMap: Record<number, string[]> = {};
    if (auditorIds.length > 0) {
      const roleRows = await db
        .select({
          auditorId: auditorRoles.auditorId,
          roleName: auditorRoleTypes.name,
        })
        .from(auditorRoles)
        .innerJoin(auditorRoleTypes, eq(auditorRoles.roleTypeId, auditorRoleTypes.id))
        .where(inArray(auditorRoles.auditorId, auditorIds));
      
      roleMap = roleRows.reduce((acc, r) => {
        if (!acc[r.auditorId]) acc[r.auditorId] = [];
        acc[r.auditorId].push(r.roleName);
        return acc;
      }, {} as Record<number, string[]>);
    }

    const result = rows.map(r => ({ ...r, roles: roleMap[r.id] || [] }));

    return apiResponse({ auditors: result, total: totalCount[0]?.count || 0, page, pageSize });
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    console.error("Get auditors error:", err);
    return apiError("Failed to fetch auditors", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireRole(["super_admin", "admin"]);
    const body = await request.json();

    const {
      firstName, lastName, email, phone, dateOfBirth, gender,
      organization, assessorNumber, experience, qualification, certification,
      state, district, languages, validityStart, validityEnd,
      maxActiveAssignments, roleTypeIds,
    } = body;

    if (!firstName || !email) {
      return apiError("First name and email are required", 400);
    }

    // Check email uniqueness
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      return apiError("An account with this email already exists", 400);
    }

    // Generate registration ID
    const year = new Date().getFullYear();
    const countRow = await db.select({ count: count() }).from(auditors);
    const seq = (countRow[0]?.count || 0) + 1;
    const registrationId = generateId("AUD", year, seq);

    // Create auditor record
    const newAuditor = await insertReturning(auditors, {
      firstName,
      lastName,
      email: email.toLowerCase(),
      phone,
      dateOfBirth,
      gender,
      organization,
      assessorNumber,
      experience: experience ? parseInt(experience) : undefined,
      qualification,
      certification,
      state,
      district,
      languages: languages || [],
      validityStart,
      validityEnd,
      maxActiveAssignments: maxActiveAssignments ? parseInt(maxActiveAssignments) : 5,
      registrationId,
      status: "pending",
      createdBy: authUser.userId,
    });

    // Create user account
    const tempPassword = `Audit@${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const passwordHash = await hashPassword(tempPassword);

    const newUser = await insertReturning(users, {
      email: email.toLowerCase(),
      passwordHash,
      role: "auditor",
      status: "pending_activation",
      firstName,
      lastName,
      phone,
      auditorId: newAuditor.id,
      forcePasswordChange: true,
      createdBy: authUser.userId,
    });

    // Update auditor with userId
    await db.update(auditors).set({ userId: newUser.id }).where(eq(auditors.id, newAuditor.id));

    // Assign roles
    if (roleTypeIds && roleTypeIds.length > 0) {
      await db.insert(auditorRoles).values(
        roleTypeIds.map((roleTypeId: number) => ({
          auditorId: newAuditor.id,
          roleTypeId,
          assignedBy: authUser.userId,
        }))
      );
    }

    // Create registration record
    await db.insert(registrations).values({
      registrationNumber: registrationId,
      entityType: "auditor",
      entityId: newAuditor.id,
      status: "pending_documents",
      createdBy: authUser.userId,
    });

    return apiResponse({
      auditor: newAuditor,
      tempPassword,
      message: "Auditor created successfully",
    }, 201);
  } catch (err) {
    if (err instanceof Error && err.message === "Forbidden") return apiError("Forbidden", 403);
    console.error("Create auditor error:", err);
    return apiError("Failed to create auditor", 500);
  }
}
