import * as bcrypt from 'bcryptjs'
import { and, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { sendEmployeeCredentials } from '../../utils/emailSender'
import { db } from '../client'
import { employees } from '../schema/employees'
import { userProfiles } from '../schema/userProfile'
import { users } from '../schema/users'

// types/employeeTypes.ts
export interface IEmployeePayload {
  adminId: string // must be the UUID of an admin user
  name: string
  email: string // required + unique
  phone?: string // optional
  role: string // required (e.g., "manager", "support")
  password: string // provided by admin
  moduleAccess?: Record<string, any> // JSON object for module permissions
  isActive?: boolean // defaults true
  isOnline?: boolean // defaults false
}
export const createEmployeeService = async (data: IEmployeePayload, adminId: string) => {
  return await db.transaction(async (tx) => {
    // ✅ 1. Validate uniqueness in USERS table
    if (data.email || data.phone) {
      const existingUser = await tx.query.users.findFirst({
        where: or(
          data.email ? eq(users.email, data.email) : undefined,
          data.phone ? eq(users.phone, data.phone) : undefined,
        ),
      })
      if (existingUser) {
        throw new Error('User with this email or phone already exists')
      }
    }

    // ✅ 2. Validate uniqueness in EMPLOYEES table
    if (data.email || data.phone) {
      const existingEmployee = await tx.query.employees.findFirst({
        where: or(
          data.email ? eq(employees.email, data.email) : undefined,
          data.phone ? eq(employees.phone, data.phone) : undefined,
        ),
      })
      if (existingEmployee) {
        throw new Error('Employee with this email or phone already exists')
      }
    }

    // ✅ 3. Hash password
    const hashedPassword = await bcrypt.hash(data.password, 10)

    // ✅ 4. Create USER record
    const [user] = await tx
      .insert(users)
      .values({
        email: data.email,
        phone: data.phone,
        role: data.role,
        passwordHash: hashedPassword,
        accountVerified: true,
        emailVerified: !!data.email, // true if email provided
        phoneVerified: !!data.phone, // true if phone provided
      })
      .returning()

    // ✅ 5. Create EMPLOYEE record
    const [employee] = await tx
      .insert(employees)
      .values({
        userId: user?.id,
        adminId,
        name: data.name,
        email: data.email,
        phone: data.phone,
        role: data.role,
        moduleAccess: data.moduleAccess ?? {},
        isActive: data.isActive ?? true,
        isOnline: data.isOnline ?? false,
      })
      .returning()

    // ✅ 6. Clone admin profile
    const adminProfile = await tx.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, adminId),
    })

    if (!adminProfile) {
      throw new Error('Admin does not have a profile. Cannot create employee profile.')
    }

    await tx.insert(userProfiles).values({
      userId: user.id,
      onboardingStep: adminProfile.onboardingStep,
      monthlyOrderCount: adminProfile.monthlyOrderCount,
      salesChannels: adminProfile.salesChannels,
      companyInfo: adminProfile.companyInfo,
      domesticKyc: adminProfile.domesticKyc,
      bankDetails: adminProfile.bankDetails,
      gstDetails: adminProfile.gstDetails,
      businessType: adminProfile.businessType,
      approved: adminProfile.approved,
      rejectionReason: adminProfile.rejectionReason,
      onboardingComplete: adminProfile.onboardingComplete,
      profileComplete: adminProfile.profileComplete,
      approvedAt: adminProfile.approvedAt,
    })

    // ✅ 7. Send credentials email (async fire-and-forget)
    if (data.email) {
      sendEmployeeCredentials(
        data.email,
        data.email,
        data.password,
        adminProfile?.companyInfo?.contactPerson,
      ).catch((err) => console.error('Failed to send employee credentials email:', err))
    }

    return { user, employee }
  })
}

export const getEmployeeService = async (employeeId: string) => {
  // 1. Get employee record
  const employee = await db.query.employees.findFirst({
    where: eq(employees.userId, employeeId),
  })

  if (!employee) return null

  // 2. Get linked user (by email/phone or explicit userId if stored)
  const user = await db.query.users.findFirst({
    where: eq(users.email, employee.email), // assuming email links employee ↔ user
  })

  // 3. Get user profile
  let profile = null
  if (user) {
    profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, user.id),
    })
  }

  return {
    employee,
    user,
    profile,
  }
}

export const getEmployeesByAdminService = async (
  adminId: string,
  page: number,
  limit: number,
  search?: string,
  status?: 'active' | 'inactive',
) => {
  const offset = (page - 1) * limit

  // Build WHERE clause dynamically
  const baseCondition = eq(employees.adminId, adminId)

  const searchCondition = search
    ? or(
        ilike(employees.name, `%${search}%`),
        ilike(employees.email, `%${search}%`),
        ilike(employees.phone, `%${search}%`),
      )
    : undefined

  const statusCondition =
    status === 'active'
      ? eq(employees.isActive, true)
      : status === 'inactive'
      ? eq(employees.isActive, false)
      : undefined

  let whereCondition: any = baseCondition
  if (searchCondition) {
    whereCondition = and(whereCondition, searchCondition)
  }
  if (statusCondition) {
    whereCondition = and(whereCondition, statusCondition)
  }

  // 1. Get employees for this admin with optional search
  const employeeListRaw = await db.query.employees.findMany({
    where: whereCondition,
    limit,
    offset,
    orderBy: (employees, { desc }) => [desc(employees.createdAt)],
  })

  const employeeList = employeeListRaw.map((employee) => {
    let moduleAccess = employee.moduleAccess ?? {}

    if (typeof moduleAccess === 'string') {
      try {
        moduleAccess = JSON.parse(moduleAccess)
      } catch (error) {
        console.warn(
          `⚠️ Failed to parse module access JSON for employee ${employee.id}:`,
          error,
        )
        moduleAccess = {}
      }
    }

    return {
      ...employee,
      moduleAccess,
    }
  })

  // 2. Get total count with the same condition
  const totalCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(employees)
    .where(whereCondition)

  const totalCount = Number(totalCountResult[0]?.count || 0)
  const hasMore = offset + employeeList.length < totalCount

  return {
    employees: employeeList,
    page,
    limit,
    nextPage: hasMore ? page + 1 : null,
    hasMore,
    totalCount,
  }
}

export const deleteEmployeeService = async (employeeId: string, adminId: string) => {
  return await db.transaction(async (tx) => {
    // ✅ 1. Find employee
    const employee = await tx.query.employees.findFirst({
      where: and(eq(employees.id, employeeId), eq(employees.adminId, adminId)),
    })

    if (!employee) {
      throw new Error('Employee not found or does not belong to this admin')
    }

    // ✅ 2. Find linked user (assuming linked via email)
    const user = employee.email
      ? await tx.query.users.findFirst({
          where: eq(users.email, employee.email),
        })
      : null

    // ✅ 3. Delete userProfile (if user exists)
    if (user) {
      await tx.delete(userProfiles).where(eq(userProfiles.userId, user.id))
    }

    // ✅ 4. Delete user (if exists)
    if (user) {
      await tx.delete(users).where(eq(users.id, user.id))
    }

    // ✅ 5. Delete employee record
    await tx.delete(employees).where(eq(employees.id, employeeId))

    return { success: true, employeeId }
  })
}

export const updateEmployeeService = async (
  employeeId: string,
  adminId: string,
  updates: Partial<IEmployeePayload> & { password?: string },
) => {
  return await db.transaction(async (tx) => {
    // 1. Find employee belonging to this admin
    const employee = await tx.query.employees.findFirst({
      where: and(eq(employees.id, employeeId), eq(employees.adminId, adminId)),
    })

    if (!employee) {
      throw new Error('Employee not found or does not belong to this admin')
    }

    // 2. If updating email/phone, validate uniqueness (except current employee)
    if (updates.email || updates.phone) {
      const existingEmployee = await tx.query.employees.findFirst({
        where: and(
          or(
            updates.email ? eq(employees.email, updates.email) : undefined,
            updates.phone ? eq(employees.phone, updates.phone) : undefined,
          ),
          ne(employees.id, employee.id), // exclude current employee
        ),
      })

      if (existingEmployee) {
        throw new Error('Another employee with this email/phone already exists')
      }

      // const userConditions = []
      // if (updates.email) {
      //   userConditions.push(
      //     and(eq(users.email, updates.email), ne(users.email, employee.email ?? '')),
      //   )
      // }
      // if (updates.phone) {
      //   userConditions.push(
      //     and(eq(users.phone, updates.phone), ne(users.phone, employee.phone ?? '')),
      //   )
      // }

      // if (userConditions.length > 0) {
      //   const existingUser = await tx.query.users.findFirst({
      //     where: or(...userConditions),
      //   })
      //   if (existingUser) {
      //     throw new Error('Another user with this email/phone already exists')
      //   }
      // }
    }

    // 3. Hash password if provided
    let hashedPassword: string | undefined
    if (updates.password) {
      hashedPassword = await bcrypt.hash(updates.password, 10)
    }

    // 4. Update EMPLOYEE
    const [updatedEmployee] = await tx
      .update(employees)
      .set({
        name: updates.name ?? employee.name,
        email: updates.email ?? employee.email,
        phone: updates.phone ?? employee.phone,
        role: updates.role ?? employee.role,
        moduleAccess: updates.moduleAccess ?? employee.moduleAccess,
        isActive: updates.isActive ?? employee.isActive,
        isOnline: updates.isOnline ?? employee.isOnline,
      })
      .where(eq(employees.id, employeeId))
      .returning()

    const linkedUser = await tx.query.users.findFirst({
      where: eq(users.email, employee.email),
    })

    if (linkedUser) {
      await tx
        .update(users)
        .set({
          email: updates.email ?? employee.email,
          phone: updates.phone ?? employee.phone,
          role: updates.role ?? employee.role,
          ...(updates.password ? { passwordHash: await bcrypt.hash(updates.password, 10) } : {}),
        })
        .where(eq(users.id, linkedUser.id)) // update the correct user
    }

    return updatedEmployee
  })
}

export const toggleEmployeeStatusService = async (
  employeeId: string,
  adminId: string,
  isActive: boolean,
) => {
  try {
    const [employee] = await db
      .update(employees)
      .set({ isActive })
      .where(and(eq(employees.id, employeeId), eq(employees.adminId, adminId)))
      .returning()
    console.log('admin', adminId)
    if (!employee) {
      throw new Error('Employee not found or does not belong to this admin')
    }

    return employee
  } catch (error) {
    console.error('Error toggling employee status:', error)
    throw new Error(error instanceof Error ? error.message : 'Failed to update employee status')
  }
}

export const setEmployeeOnlineStatus = async (employeeId: string, isOnline: boolean) => {
  const [updatedEmployee] = await db
    .update(employees)
    .set({ isOnline })
    .where(eq(employees.userId, employeeId))
    .returning()

  return updatedEmployee
}
