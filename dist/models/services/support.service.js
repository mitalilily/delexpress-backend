"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTicketsForUserService = exports.getAllTicketsService = exports.getUserTicketStatusCounts = exports.updateTicketStatusService = exports.getTicketByIdService = exports.getUserTicketsService = exports.createTicketService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const supportTickets_1 = require("../schema/supportTickets");
const userProfile_1 = require("../schema/userProfile");
const users_1 = require("../schema/users");
const notifications_service_1 = require("./notifications.service");
const createTicketService = async (data) => {
    // 1️⃣ Create the ticket
    const [ticket] = await client_1.db
        .insert(supportTickets_1.supportTickets)
        .values({
        userId: data.userId,
        subject: data.subject,
        category: data.category,
        subcategory: data.subcategory,
        awbNumber: data.awbNumber,
        description: data.description,
        attachments: data.attachments ?? [],
        dueDate: data.dueDate || undefined,
    })
        .returning();
    // 2️⃣ Send notification to admin(s)
    await (0, notifications_service_1.createNotificationService)({
        targetRole: 'admin',
        title: 'New Support Ticket',
        message: `A new ticket "${data.subject}" has been created.`,
        sendEmail: true, // will email ADMIN_EMAIL from env
    });
    return ticket;
};
exports.createTicketService = createTicketService;
const getUserTicketsService = async (userId, limit, offset, filters) => {
    const baseConditions = [(0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, userId)];
    if (filters.category) {
        baseConditions.push((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.category, filters.category));
    }
    if (filters.subcategory) {
        baseConditions.push((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.subcategory, filters.subcategory));
    }
    if (filters.awbNumber) {
        baseConditions.push((0, drizzle_orm_1.ilike)(supportTickets_1.supportTickets.awbNumber, `%${filters.awbNumber}%`));
    }
    if (filters.subject) {
        baseConditions.push((0, drizzle_orm_1.ilike)(supportTickets_1.supportTickets.subject, `%${filters.subject}%`));
    }
    const baseWhereClause = (0, drizzle_orm_1.and)(...baseConditions);
    // For main query - add status filter if applied
    const mainWhereClause = filters.status
        ? (0, drizzle_orm_1.and)(baseWhereClause, (0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.status, filters.status))
        : baseWhereClause;
    // Sorting
    let orderClause;
    switch (filters.sortBy) {
        case 'latest':
            orderClause = (0, drizzle_orm_1.desc)(supportTickets_1.supportTickets.createdAt);
            break;
        case 'oldest':
            orderClause = (0, drizzle_orm_1.asc)(supportTickets_1.supportTickets.createdAt);
            break;
        case 'dueSoon':
            orderClause = (0, drizzle_orm_1.asc)(supportTickets_1.supportTickets.dueDate);
            break;
        case 'dueLatest':
            orderClause = (0, drizzle_orm_1.desc)(supportTickets_1.supportTickets.dueDate);
            break;
        default:
            orderClause = (0, drizzle_orm_1.desc)(supportTickets_1.supportTickets.createdAt);
    }
    // Paginated tickets
    const tickets = await client_1.db
        .select()
        .from(supportTickets_1.supportTickets)
        .where(mainWhereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(orderClause);
    // Total count
    const countResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(supportTickets_1.supportTickets)
        .where(mainWhereClause);
    const totalCount = countResult[0]?.count || 0;
    // Status-wise count (OPEN, IN_PROGRESS, etc.)
    const statusCountsRaw = await client_1.db
        .select({
        status: supportTickets_1.supportTickets.status,
        count: (0, drizzle_orm_1.count)(),
    })
        .from(supportTickets_1.supportTickets)
        .where(baseWhereClause) // No status filter here — count all for the user
        .groupBy(supportTickets_1.supportTickets.status);
    const statusCounts = {
        open: 0,
        in_progress: 0,
        resolved: 0,
        closed: 0,
    };
    for (const row of statusCountsRaw) {
        statusCounts[row.status] = Number(row.count);
    }
    // ✅ Overdue count (dueDate < now and status is open or in_progress)
    const now = new Date();
    const overdueConditions = (0, drizzle_orm_1.and)((0, drizzle_orm_1.lt)(supportTickets_1.supportTickets.dueDate, now), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.status, 'open'), (0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.status, 'in_progress')), ...baseConditions);
    const overdueResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(supportTickets_1.supportTickets)
        .where(overdueConditions);
    const overdueCount = Number(overdueResult[0]?.count || 0);
    return {
        tickets,
        totalCount,
        statusCounts: {
            ...statusCounts,
            overdue: overdueCount,
        },
    };
};
exports.getUserTicketsService = getUserTicketsService;
const getTicketByIdService = async (ticketId, userId, isAdmin = false) => {
    return await client_1.db
        .select()
        .from(supportTickets_1.supportTickets)
        .where(isAdmin
        ? (0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.id, ticketId)
        : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.id, ticketId), (0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, userId)))
        .then((rows) => rows[0] || null);
};
exports.getTicketByIdService = getTicketByIdService;
const updateTicketStatusService = async (ticketId, data) => {
    const [existingTicket] = await client_1.db
        .select()
        .from(supportTickets_1.supportTickets)
        .where((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.id, ticketId));
    if (!existingTicket) {
        throw new Error('Ticket not found');
    }
    let { status, dueDate } = data;
    const updateData = {
        updatedAt: new Date(),
    };
    // ✅ Rule 1: If status was "closed" and it's being reopened to "open", clear due date
    if (existingTicket.status === 'closed' && status === 'open') {
        updateData.dueDate = null;
    }
    // ✅ Rule 2: If dueDate is added while current status is "open", promote to "in_progress"
    if (!status && dueDate && existingTicket.status === 'open') {
        status = 'in_progress';
    }
    // Apply updated fields
    if (status)
        updateData.status = status;
    if (dueDate && updateData.dueDate === undefined) {
        updateData.dueDate = dueDate;
    }
    const [updated] = await client_1.db
        .update(supportTickets_1.supportTickets)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.id, ticketId))
        .returning();
    return updated;
};
exports.updateTicketStatusService = updateTicketStatusService;
const getUserTicketStatusCounts = async (userId) => {
    try {
        const result = await client_1.db
            .select({
            status: supportTickets_1.supportTickets.status,
            count: (0, drizzle_orm_1.sql) `COUNT(*)`,
        })
            .from(supportTickets_1.supportTickets)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, userId), (0, drizzle_orm_1.isNotNull)(supportTickets_1.supportTickets.status)))
            .groupBy(supportTickets_1.supportTickets.status);
        const counts = {};
        for (const row of result) {
            if (row.status) {
                counts[row.status] = Number(row.count);
            }
            else {
                counts['open'] = (counts['open'] ?? 0) + Number(row.count); // fallback for nulls
            }
        }
        return counts;
    }
    catch (err) {
        console.error('DB Error in getUserTicketStatusCounts:', err);
        throw err;
    }
};
exports.getUserTicketStatusCounts = getUserTicketStatusCounts;
const getAllTicketsService = async (limit, offset, filters) => {
    const now = new Date();
    const buildBaseConditions = (excludeStatus = false) => {
        const conditions = [];
        if (!excludeStatus && filters.status?.length) {
            // Do NOT include 'overdue' here — it'll be handled separately
            const statusesToUse = filters.status.filter((s) => s !== 'overdue');
            if (statusesToUse.length) {
                conditions.push((0, drizzle_orm_1.inArray)(supportTickets_1.supportTickets.status, statusesToUse));
            }
        }
        if (filters.category) {
            conditions.push((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.category, filters.category));
        }
        if (filters.subcategory) {
            conditions.push((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.subcategory, filters.subcategory));
        }
        if (filters.awbNumber) {
            conditions.push((0, drizzle_orm_1.ilike)(supportTickets_1.supportTickets.awbNumber, `%${filters.awbNumber}%`));
        }
        if (filters.userId) {
            conditions.push((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, filters.userId));
        }
        if (filters.subject) {
            conditions.push((0, drizzle_orm_1.ilike)(supportTickets_1.supportTickets.subject, `%${filters.subject}%`));
        }
        if (filters.userName) {
            conditions.push((0, drizzle_orm_1.sql) `up.company_info->>'contactPerson' ILIKE ${'%' + filters.userName + '%'}`);
        }
        return conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined;
    };
    let whereClause;
    const isFilteringOverdue = filters.status?.includes('overdue');
    if (isFilteringOverdue) {
        const baseConditions = buildBaseConditions(true); // exclude status conditions
        // Condition to find overdue tickets: dueDate < now && status in (open, in_progress)
        const overdueCondition = (0, drizzle_orm_1.and)((0, drizzle_orm_1.lt)(supportTickets_1.supportTickets.dueDate, now), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.status, 'open'), (0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.status, 'in_progress')));
        // Condition for tickets matching other statuses (excluding overdue)
        const otherStatuses = filters?.status?.filter((s) => s !== 'overdue');
        const otherStatusesCondition = otherStatuses?.length
            ? (0, drizzle_orm_1.inArray)(supportTickets_1.supportTickets.status, otherStatuses)
            : undefined;
        // Combine overdue and other status conditions using OR
        whereClause = (0, drizzle_orm_1.or)((0, drizzle_orm_1.and)(overdueCondition, baseConditions ?? (0, drizzle_orm_1.sql) `true`), ...(otherStatusesCondition ? [(0, drizzle_orm_1.and)(otherStatusesCondition, baseConditions ?? (0, drizzle_orm_1.sql) `true`)] : []));
    }
    else {
        whereClause = buildBaseConditions(false);
    }
    // Sorting logic
    let orderClause;
    switch (filters.sortBy) {
        case 'latest':
            orderClause = (0, drizzle_orm_1.desc)(supportTickets_1.supportTickets.createdAt);
            break;
        case 'oldest':
            orderClause = (0, drizzle_orm_1.asc)(supportTickets_1.supportTickets.createdAt);
            break;
        case 'dueSoon':
            orderClause = (0, drizzle_orm_1.asc)(supportTickets_1.supportTickets.dueDate);
            break;
        case 'dueLatest':
            orderClause = (0, drizzle_orm_1.desc)(supportTickets_1.supportTickets.dueDate);
            break;
        default:
            orderClause = (0, drizzle_orm_1.desc)(supportTickets_1.supportTickets.createdAt);
    }
    // --- 1. Fetch paginated tickets ---
    const tickets = await client_1.db
        .select({
        id: supportTickets_1.supportTickets.id,
        subject: supportTickets_1.supportTickets.subject,
        status: supportTickets_1.supportTickets.status,
        awbNumber: supportTickets_1.supportTickets.awbNumber,
        category: supportTickets_1.supportTickets.category,
        subcategory: supportTickets_1.supportTickets.subcategory,
        dueDate: supportTickets_1.supportTickets.dueDate,
        createdAt: supportTickets_1.supportTickets.createdAt,
        updatedAt: supportTickets_1.supportTickets.updatedAt,
        userId: supportTickets_1.supportTickets.userId,
        attachments: supportTickets_1.supportTickets.attachments,
    })
        .from(supportTickets_1.supportTickets)
        .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, users_1.users.id))
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(users_1.users.id, userProfile_1.userProfiles.userId))
        .where(whereClause)
        .orderBy(orderClause)
        .limit(limit)
        .offset(offset);
    // --- 2. Count total results ---
    const totalResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(supportTickets_1.supportTickets)
        .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, users_1.users.id))
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(users_1.users.id, userProfile_1.userProfiles.userId))
        .where(whereClause);
    const totalCount = Number(totalResult[0]?.count || 0);
    // --- 3. Status counts (exclude status filter) ---
    const statusClause = buildBaseConditions(false);
    const statusCountsRaw = await client_1.db
        .select({
        status: supportTickets_1.supportTickets.status,
        count: (0, drizzle_orm_1.count)(),
    })
        .from(supportTickets_1.supportTickets)
        .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, users_1.users.id))
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(users_1.users.id, userProfile_1.userProfiles.userId))
        .where(statusClause)
        .groupBy(supportTickets_1.supportTickets.status);
    const statusCounts = {
        open: 0,
        in_progress: 0,
        resolved: 0,
        closed: 0,
    };
    for (const row of statusCountsRaw) {
        statusCounts[row.status] = Number(row.count);
    }
    // --- 4. Overdue count (exclude status filter) ---
    const overdueWhere = (0, drizzle_orm_1.and)((0, drizzle_orm_1.lt)(supportTickets_1.supportTickets.dueDate, now), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.status, 'open'), (0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.status, 'in_progress')), ...(statusClause ? [statusClause] : []));
    const overdueResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(supportTickets_1.supportTickets)
        .leftJoin(users_1.users, (0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, users_1.users.id))
        .leftJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(users_1.users.id, userProfile_1.userProfiles.userId))
        .where(overdueWhere);
    const overdueCount = Number(overdueResult[0]?.count || 0);
    // --- 5. Return all together ---
    return {
        tickets,
        totalCount,
        statusCounts: {
            ...statusCounts,
            overdue: overdueCount,
        },
    };
};
exports.getAllTicketsService = getAllTicketsService;
const getTicketsForUserService = async (userId, page = 1, perPage = 10) => {
    const offset = (page - 1) * perPage;
    // Base query: tickets belonging to user
    const tickets = await client_1.db
        .select({
        id: supportTickets_1.supportTickets.id,
        subject: supportTickets_1.supportTickets.subject,
        status: supportTickets_1.supportTickets.status,
        category: supportTickets_1.supportTickets.category,
        subcategory: supportTickets_1.supportTickets.subcategory,
        awbNumber: supportTickets_1.supportTickets.awbNumber,
        dueDate: supportTickets_1.supportTickets.dueDate,
        createdAt: supportTickets_1.supportTickets.createdAt,
        updatedAt: supportTickets_1.supportTickets.updatedAt,
        attachments: supportTickets_1.supportTickets.attachments,
    })
        .from(supportTickets_1.supportTickets)
        .where((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, userId))
        .orderBy((0, drizzle_orm_1.desc)(supportTickets_1.supportTickets.createdAt))
        .limit(perPage)
        .offset(offset);
    // Total count for pagination
    const countResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.count)() })
        .from(supportTickets_1.supportTickets)
        .where((0, drizzle_orm_1.eq)(supportTickets_1.supportTickets.userId, userId));
    const totalCount = Number(countResult[0]?.count || 0);
    return {
        tickets,
        totalCount,
    };
};
exports.getTicketsForUserService = getTicketsForUserService;
