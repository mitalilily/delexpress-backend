"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.setEmployeeOnlineStatus = exports.toggleEmployeeStatusService = exports.updateEmployeeService = exports.deleteEmployeeService = exports.getEmployeesByAdminService = exports.getEmployeeService = exports.createEmployeeService = void 0;
const bcrypt = __importStar(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const emailSender_1 = require("../../utils/emailSender");
const client_1 = require("../client");
const employees_1 = require("../schema/employees");
const userProfile_1 = require("../schema/userProfile");
const users_1 = require("../schema/users");
const createEmployeeService = async (data, adminId) => {
    return await client_1.db.transaction(async (tx) => {
        // ✅ 1. Validate uniqueness in USERS table
        if (data.email || data.phone) {
            const existingUser = await tx.query.users.findFirst({
                where: (0, drizzle_orm_1.or)(data.email ? (0, drizzle_orm_1.eq)(users_1.users.email, data.email) : undefined, data.phone ? (0, drizzle_orm_1.eq)(users_1.users.phone, data.phone) : undefined),
            });
            if (existingUser) {
                throw new Error('User with this email or phone already exists');
            }
        }
        // ✅ 2. Validate uniqueness in EMPLOYEES table
        if (data.email || data.phone) {
            const existingEmployee = await tx.query.employees.findFirst({
                where: (0, drizzle_orm_1.or)(data.email ? (0, drizzle_orm_1.eq)(employees_1.employees.email, data.email) : undefined, data.phone ? (0, drizzle_orm_1.eq)(employees_1.employees.phone, data.phone) : undefined),
            });
            if (existingEmployee) {
                throw new Error('Employee with this email or phone already exists');
            }
        }
        // ✅ 3. Hash password
        const hashedPassword = await bcrypt.hash(data.password, 10);
        // ✅ 4. Create USER record
        const [user] = await tx
            .insert(users_1.users)
            .values({
            email: data.email,
            phone: data.phone,
            role: data.role,
            passwordHash: hashedPassword,
            accountVerified: true,
            emailVerified: !!data.email, // true if email provided
            phoneVerified: !!data.phone, // true if phone provided
        })
            .returning();
        // ✅ 5. Create EMPLOYEE record
        const [employee] = await tx
            .insert(employees_1.employees)
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
            .returning();
        // ✅ 6. Clone admin profile
        const adminProfile = await tx.query.userProfiles.findFirst({
            where: (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, adminId),
        });
        if (!adminProfile) {
            throw new Error('Admin does not have a profile. Cannot create employee profile.');
        }
        await tx.insert(userProfile_1.userProfiles).values({
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
        });
        // ✅ 7. Send credentials email (async fire-and-forget)
        if (data.email) {
            (0, emailSender_1.sendEmployeeCredentials)(data.email, data.email, data.password, adminProfile?.companyInfo?.contactPerson).catch((err) => console.error('Failed to send employee credentials email:', err));
        }
        return { user, employee };
    });
};
exports.createEmployeeService = createEmployeeService;
const getEmployeeService = async (employeeId) => {
    // 1. Get employee record
    const employee = await client_1.db.query.employees.findFirst({
        where: (0, drizzle_orm_1.eq)(employees_1.employees.userId, employeeId),
    });
    if (!employee)
        return null;
    // 2. Get linked user (by email/phone or explicit userId if stored)
    const user = await client_1.db.query.users.findFirst({
        where: (0, drizzle_orm_1.eq)(users_1.users.email, employee.email), // assuming email links employee ↔ user
    });
    // 3. Get user profile
    let profile = null;
    if (user) {
        profile = await client_1.db.query.userProfiles.findFirst({
            where: (0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, user.id),
        });
    }
    return {
        employee,
        user,
        profile,
    };
};
exports.getEmployeeService = getEmployeeService;
const getEmployeesByAdminService = async (adminId, page, limit, search, status) => {
    const offset = (page - 1) * limit;
    // Build WHERE clause dynamically
    const baseCondition = (0, drizzle_orm_1.eq)(employees_1.employees.adminId, adminId);
    const searchCondition = search
        ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(employees_1.employees.name, `%${search}%`), (0, drizzle_orm_1.ilike)(employees_1.employees.email, `%${search}%`), (0, drizzle_orm_1.ilike)(employees_1.employees.phone, `%${search}%`))
        : undefined;
    const statusCondition = status === 'active'
        ? (0, drizzle_orm_1.eq)(employees_1.employees.isActive, true)
        : status === 'inactive'
            ? (0, drizzle_orm_1.eq)(employees_1.employees.isActive, false)
            : undefined;
    let whereCondition = baseCondition;
    if (searchCondition) {
        whereCondition = (0, drizzle_orm_1.and)(whereCondition, searchCondition);
    }
    if (statusCondition) {
        whereCondition = (0, drizzle_orm_1.and)(whereCondition, statusCondition);
    }
    // 1. Get employees for this admin with optional search
    const employeeListRaw = await client_1.db.query.employees.findMany({
        where: whereCondition,
        limit,
        offset,
        orderBy: (employees, { desc }) => [desc(employees.createdAt)],
    });
    const employeeList = employeeListRaw.map((employee) => {
        let moduleAccess = employee.moduleAccess ?? {};
        if (typeof moduleAccess === 'string') {
            try {
                moduleAccess = JSON.parse(moduleAccess);
            }
            catch (error) {
                console.warn(`⚠️ Failed to parse module access JSON for employee ${employee.id}:`, error);
                moduleAccess = {};
            }
        }
        return {
            ...employee,
            moduleAccess,
        };
    });
    // 2. Get total count with the same condition
    const totalCountResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(employees_1.employees)
        .where(whereCondition);
    const totalCount = Number(totalCountResult[0]?.count || 0);
    const hasMore = offset + employeeList.length < totalCount;
    return {
        employees: employeeList,
        page,
        limit,
        nextPage: hasMore ? page + 1 : null,
        hasMore,
        totalCount,
    };
};
exports.getEmployeesByAdminService = getEmployeesByAdminService;
const deleteEmployeeService = async (employeeId, adminId) => {
    return await client_1.db.transaction(async (tx) => {
        // ✅ 1. Find employee
        const employee = await tx.query.employees.findFirst({
            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(employees_1.employees.id, employeeId), (0, drizzle_orm_1.eq)(employees_1.employees.adminId, adminId)),
        });
        if (!employee) {
            throw new Error('Employee not found or does not belong to this admin');
        }
        // ✅ 2. Find linked user (assuming linked via email)
        const user = employee.email
            ? await tx.query.users.findFirst({
                where: (0, drizzle_orm_1.eq)(users_1.users.email, employee.email),
            })
            : null;
        // ✅ 3. Delete userProfile (if user exists)
        if (user) {
            await tx.delete(userProfile_1.userProfiles).where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, user.id));
        }
        // ✅ 4. Delete user (if exists)
        if (user) {
            await tx.delete(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.id, user.id));
        }
        // ✅ 5. Delete employee record
        await tx.delete(employees_1.employees).where((0, drizzle_orm_1.eq)(employees_1.employees.id, employeeId));
        return { success: true, employeeId };
    });
};
exports.deleteEmployeeService = deleteEmployeeService;
const updateEmployeeService = async (employeeId, adminId, updates) => {
    return await client_1.db.transaction(async (tx) => {
        // 1. Find employee belonging to this admin
        const employee = await tx.query.employees.findFirst({
            where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(employees_1.employees.id, employeeId), (0, drizzle_orm_1.eq)(employees_1.employees.adminId, adminId)),
        });
        if (!employee) {
            throw new Error('Employee not found or does not belong to this admin');
        }
        // 2. If updating email/phone, validate uniqueness (except current employee)
        if (updates.email || updates.phone) {
            const existingEmployee = await tx.query.employees.findFirst({
                where: (0, drizzle_orm_1.and)((0, drizzle_orm_1.or)(updates.email ? (0, drizzle_orm_1.eq)(employees_1.employees.email, updates.email) : undefined, updates.phone ? (0, drizzle_orm_1.eq)(employees_1.employees.phone, updates.phone) : undefined), (0, drizzle_orm_1.ne)(employees_1.employees.id, employee.id)),
            });
            if (existingEmployee) {
                throw new Error('Another employee with this email/phone already exists');
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
        let hashedPassword;
        if (updates.password) {
            hashedPassword = await bcrypt.hash(updates.password, 10);
        }
        // 4. Update EMPLOYEE
        const [updatedEmployee] = await tx
            .update(employees_1.employees)
            .set({
            name: updates.name ?? employee.name,
            email: updates.email ?? employee.email,
            phone: updates.phone ?? employee.phone,
            role: updates.role ?? employee.role,
            moduleAccess: updates.moduleAccess ?? employee.moduleAccess,
            isActive: updates.isActive ?? employee.isActive,
            isOnline: updates.isOnline ?? employee.isOnline,
        })
            .where((0, drizzle_orm_1.eq)(employees_1.employees.id, employeeId))
            .returning();
        const linkedUser = await tx.query.users.findFirst({
            where: (0, drizzle_orm_1.eq)(users_1.users.email, employee.email),
        });
        if (linkedUser) {
            await tx
                .update(users_1.users)
                .set({
                email: updates.email ?? employee.email,
                phone: updates.phone ?? employee.phone,
                role: updates.role ?? employee.role,
                ...(updates.password ? { passwordHash: await bcrypt.hash(updates.password, 10) } : {}),
            })
                .where((0, drizzle_orm_1.eq)(users_1.users.id, linkedUser.id)); // update the correct user
        }
        return updatedEmployee;
    });
};
exports.updateEmployeeService = updateEmployeeService;
const toggleEmployeeStatusService = async (employeeId, adminId, isActive) => {
    try {
        const [employee] = await client_1.db
            .update(employees_1.employees)
            .set({ isActive })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(employees_1.employees.id, employeeId), (0, drizzle_orm_1.eq)(employees_1.employees.adminId, adminId)))
            .returning();
        console.log('admin', adminId);
        if (!employee) {
            throw new Error('Employee not found or does not belong to this admin');
        }
        return employee;
    }
    catch (error) {
        console.error('Error toggling employee status:', error);
        throw new Error(error instanceof Error ? error.message : 'Failed to update employee status');
    }
};
exports.toggleEmployeeStatusService = toggleEmployeeStatusService;
const setEmployeeOnlineStatus = async (employeeId, isOnline) => {
    const [updatedEmployee] = await client_1.db
        .update(employees_1.employees)
        .set({ isOnline })
        .where((0, drizzle_orm_1.eq)(employees_1.employees.userId, employeeId))
        .returning();
    return updatedEmployee;
};
exports.setEmployeeOnlineStatus = setEmployeeOnlineStatus;
