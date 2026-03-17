import { and, asc, count, desc, eq, ilike, inArray, isNotNull, lt, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { supportTickets } from '../schema/supportTickets'
import { userProfiles } from '../schema/userProfile'
import { users } from '../schema/users'
import { createNotificationService } from './notifications.service'

// Assuming you have something like this:
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed'

export const createTicketService = async (data: {
  userId: string
  subject: string
  category: string
  subcategory: string
  awbNumber?: string
  description: string
  attachments?: string[]
  dueDate?: Date
}) => {
  // 1️⃣ Create the ticket
  const [ticket] = await db
    .insert(supportTickets)
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
    .returning()

  // 2️⃣ Send notification to admin(s)
  await createNotificationService({
    targetRole: 'admin',
    title: 'New Support Ticket',
    message: `A new ticket "${data.subject}" has been created.`,
    sendEmail: true, // will email ADMIN_EMAIL from env
  })

  return ticket
}
export const getUserTicketsService = async (
  userId: string,
  limit: number,
  offset: number,
  filters: {
    status?: TicketStatus
    category?: string
    subcategory?: string
    awbNumber?: string
    subject?: string
    sortBy?: string
  },
) => {
  const baseConditions = [eq(supportTickets.userId, userId)]

  if (filters.category) {
    baseConditions.push(eq(supportTickets.category, filters.category))
  }

  if (filters.subcategory) {
    baseConditions.push(eq(supportTickets.subcategory, filters.subcategory))
  }

  if (filters.awbNumber) {
    baseConditions.push(ilike(supportTickets.awbNumber, `%${filters.awbNumber}%`))
  }

  if (filters.subject) {
    baseConditions.push(ilike(supportTickets.subject, `%${filters.subject}%`))
  }

  const baseWhereClause = and(...baseConditions)

  // For main query - add status filter if applied
  const mainWhereClause = filters.status
    ? and(baseWhereClause, eq(supportTickets.status, filters.status))
    : baseWhereClause

  // Sorting
  let orderClause
  switch (filters.sortBy) {
    case 'latest':
      orderClause = desc(supportTickets.createdAt)
      break
    case 'oldest':
      orderClause = asc(supportTickets.createdAt)
      break
    case 'dueSoon':
      orderClause = asc(supportTickets.dueDate)
      break
    case 'dueLatest':
      orderClause = desc(supportTickets.dueDate)
      break
    default:
      orderClause = desc(supportTickets.createdAt)
  }

  // Paginated tickets
  const tickets = await db
    .select()
    .from(supportTickets)
    .where(mainWhereClause)
    .limit(limit)
    .offset(offset)
    .orderBy(orderClause)

  // Total count
  const countResult = await db
    .select({ count: count() })
    .from(supportTickets)
    .where(mainWhereClause)
  const totalCount = countResult[0]?.count || 0

  // Status-wise count (OPEN, IN_PROGRESS, etc.)
  const statusCountsRaw = await db
    .select({
      status: supportTickets.status,
      count: count(),
    })
    .from(supportTickets)
    .where(baseWhereClause) // No status filter here — count all for the user
    .groupBy(supportTickets.status)

  const statusCounts: Record<TicketStatus, number> = {
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
  }

  for (const row of statusCountsRaw) {
    statusCounts[row.status as TicketStatus] = Number(row.count)
  }

  // ✅ Overdue count (dueDate < now and status is open or in_progress)
  const now = new Date()
  const overdueConditions = and(
    lt(supportTickets.dueDate, now),
    or(eq(supportTickets.status, 'open'), eq(supportTickets.status, 'in_progress')),
    ...baseConditions,
  )

  const overdueResult = await db
    .select({ count: count() })
    .from(supportTickets)
    .where(overdueConditions)

  const overdueCount = Number(overdueResult[0]?.count || 0)

  return {
    tickets,
    totalCount,
    statusCounts: {
      ...statusCounts,
      overdue: overdueCount,
    },
  }
}

export const getTicketByIdService = async (ticketId: string, userId: string, isAdmin = false) => {
  return await db
    .select()
    .from(supportTickets)
    .where(
      isAdmin
        ? eq(supportTickets.id, ticketId)
        : and(eq(supportTickets.id, ticketId), eq(supportTickets.userId, userId)),
    )
    .then((rows) => rows[0] || null)
}

interface UpdateTicketData {
  status?: TicketStatus
  dueDate?: Date
}

export const updateTicketStatusService = async (ticketId: string, data: UpdateTicketData) => {
  const [existingTicket] = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.id, ticketId))

  if (!existingTicket) {
    throw new Error('Ticket not found')
  }

  let { status, dueDate } = data

  const updateData: {
    status?: TicketStatus
    dueDate?: Date | null
    updatedAt: Date
  } = {
    updatedAt: new Date(),
  }

  // ✅ Rule 1: If status was "closed" and it's being reopened to "open", clear due date
  if (existingTicket.status === 'closed' && status === 'open') {
    updateData.dueDate = null
  }

  // ✅ Rule 2: If dueDate is added while current status is "open", promote to "in_progress"
  if (!status && dueDate && existingTicket.status === 'open') {
    status = 'in_progress'
  }

  // Apply updated fields
  if (status) updateData.status = status
  if (dueDate && updateData.dueDate === undefined) {
    updateData.dueDate = dueDate
  }

  const [updated] = await db
    .update(supportTickets)
    .set(updateData)
    .where(eq(supportTickets.id, ticketId))
    .returning()

  return updated
}

export const getUserTicketStatusCounts = async (userId: string) => {
  try {
    const result = await db
      .select({
        status: supportTickets.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(supportTickets)
      .where(and(eq(supportTickets.userId, userId), isNotNull(supportTickets.status)))
      .groupBy(supportTickets.status)

    const counts: Partial<Record<'open' | 'in_progress' | 'resolved' | 'closed', number>> = {}

    for (const row of result) {
      if (row.status) {
        counts[row.status] = Number(row.count)
      } else {
        counts['open'] = (counts['open'] ?? 0) + Number(row.count) // fallback for nulls
      }
    }

    return counts
  } catch (err) {
    console.error('DB Error in getUserTicketStatusCounts:', err)
    throw err
  }
}

export const getAllTicketsService = async (
  limit: number,
  offset: number,
  filters: {
    status?: TicketStatus[]
    category?: string
    subcategory?: string
    awbNumber?: string
    userId?: string
    userName?: string
    subject?: string
    sortBy?: string
  },
) => {
  const now = new Date()

  const buildBaseConditions = (excludeStatus = false) => {
    const conditions: any[] = []

    if (!excludeStatus && filters.status?.length) {
      // Do NOT include 'overdue' here — it'll be handled separately
      const statusesToUse = filters.status.filter((s) => s !== ('overdue' as TicketStatus))
      if (statusesToUse.length) {
        conditions.push(inArray(supportTickets.status, statusesToUse))
      }
    }

    if (filters.category) {
      conditions.push(eq(supportTickets.category, filters.category))
    }

    if (filters.subcategory) {
      conditions.push(eq(supportTickets.subcategory, filters.subcategory))
    }

    if (filters.awbNumber) {
      conditions.push(ilike(supportTickets.awbNumber, `%${filters.awbNumber}%`))
    }

    if (filters.userId) {
      conditions.push(eq(supportTickets.userId, filters.userId))
    }

    if (filters.subject) {
      conditions.push(ilike(supportTickets.subject, `%${filters.subject}%`))
    }

    if (filters.userName) {
      conditions.push(sql`up.company_info->>'contactPerson' ILIKE ${'%' + filters.userName + '%'}`)
    }

    return conditions.length ? and(...conditions) : undefined
  }

  let whereClause

  const isFilteringOverdue = filters.status?.includes('overdue' as TicketStatus)

  if (isFilteringOverdue) {
    const baseConditions = buildBaseConditions(true) // exclude status conditions

    // Condition to find overdue tickets: dueDate < now && status in (open, in_progress)
    const overdueCondition = and(
      lt(supportTickets.dueDate, now),
      or(eq(supportTickets.status, 'open'), eq(supportTickets.status, 'in_progress')),
    )

    // Condition for tickets matching other statuses (excluding overdue)
    const otherStatuses = filters?.status?.filter((s) => s !== ('overdue' as TicketStatus))
    const otherStatusesCondition = otherStatuses?.length
      ? inArray(supportTickets.status, otherStatuses)
      : undefined

    // Combine overdue and other status conditions using OR
    whereClause = or(
      and(overdueCondition, baseConditions ?? sql`true`),
      ...(otherStatusesCondition ? [and(otherStatusesCondition, baseConditions ?? sql`true`)] : []),
    )
  } else {
    whereClause = buildBaseConditions(false)
  }
  // Sorting logic
  let orderClause
  switch (filters.sortBy) {
    case 'latest':
      orderClause = desc(supportTickets.createdAt)
      break
    case 'oldest':
      orderClause = asc(supportTickets.createdAt)
      break
    case 'dueSoon':
      orderClause = asc(supportTickets.dueDate)
      break
    case 'dueLatest':
      orderClause = desc(supportTickets.dueDate)
      break
    default:
      orderClause = desc(supportTickets.createdAt)
  }

  // --- 1. Fetch paginated tickets ---
  const tickets = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      status: supportTickets.status,
      awbNumber: supportTickets.awbNumber,
      category: supportTickets.category,
      subcategory: supportTickets.subcategory,
      dueDate: supportTickets.dueDate,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      userId: supportTickets.userId,
      attachments: supportTickets.attachments,
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.userId, users.id))
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(whereClause)
    .orderBy(orderClause)
    .limit(limit)
    .offset(offset)

  // --- 2. Count total results ---
  const totalResult = await db
    .select({ count: count() })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.userId, users.id))
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(whereClause)

  const totalCount = Number(totalResult[0]?.count || 0)

  // --- 3. Status counts (exclude status filter) ---
  const statusClause = buildBaseConditions(false)

  const statusCountsRaw = await db
    .select({
      status: supportTickets.status,
      count: count(),
    })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.userId, users.id))
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(statusClause)
    .groupBy(supportTickets.status)

  const statusCounts: Record<TicketStatus, number> = {
    open: 0,
    in_progress: 0,
    resolved: 0,
    closed: 0,
  }

  for (const row of statusCountsRaw) {
    statusCounts[row.status as TicketStatus] = Number(row.count)
  }

  // --- 4. Overdue count (exclude status filter) ---
  const overdueWhere = and(
    lt(supportTickets.dueDate, now),
    or(eq(supportTickets.status, 'open'), eq(supportTickets.status, 'in_progress')),
    ...(statusClause ? [statusClause] : []),
  )

  const overdueResult = await db
    .select({ count: count() })
    .from(supportTickets)
    .leftJoin(users, eq(supportTickets.userId, users.id))
    .leftJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(overdueWhere)

  const overdueCount = Number(overdueResult[0]?.count || 0)

  // --- 5. Return all together ---
  return {
    tickets,
    totalCount,
    statusCounts: {
      ...statusCounts,
      overdue: overdueCount,
    },
  }
}

export const getTicketsForUserService = async (userId: string, page = 1, perPage = 10) => {
  const offset = (page - 1) * perPage

  // Base query: tickets belonging to user
  const tickets = await db
    .select({
      id: supportTickets.id,
      subject: supportTickets.subject,
      status: supportTickets.status,
      category: supportTickets.category,
      subcategory: supportTickets.subcategory,
      awbNumber: supportTickets.awbNumber,
      dueDate: supportTickets.dueDate,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      attachments: supportTickets.attachments,
    })
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.createdAt))
    .limit(perPage)
    .offset(offset)

  // Total count for pagination
  const countResult = await db
    .select({ count: count() })
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))

  const totalCount = Number(countResult[0]?.count || 0)

  return {
    tickets,
    totalCount,
  }
}
