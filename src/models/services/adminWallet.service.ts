import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { wallets, walletTransactions } from '../schema/wallet'
import { userProfiles } from '../schema/userProfile'
import { users } from '../schema/users'

interface GetAllWalletsParams {
  page?: number
  limit?: number
  search?: string
  sortBy?: 'balance' | 'createdAt' | 'updatedAt' | 'email' | 'companyName'
  sortOrder?: 'asc' | 'desc'
}

export const getAllWallets = async ({
  page = 1,
  limit = 20,
  search = '',
  sortBy = 'updatedAt',
  sortOrder = 'desc',
}: GetAllWalletsParams) => {
  const offset = (page - 1) * limit
  const filters: any[] = []

  // Search filter
  if (search.trim()) {
    const pattern = `%${search.trim()}%`
    filters.push(
      or(
        ilike(sql`coalesce(${userProfiles.companyInfo} ->> 'brandName', '')`, pattern),
        ilike(sql`coalesce(${userProfiles.companyInfo} ->> 'contactPerson', '')`, pattern),
        ilike(sql`coalesce(${userProfiles.companyInfo} ->> 'contactEmail', '')`, pattern),
        ilike(sql`coalesce(${userProfiles.companyInfo} ->> 'businessName', '')`, pattern),
        ilike(users.email, pattern),
      ),
    )
  }

  // Sort mapping
  const sortColumns: Record<string, any> = {
    balance: wallets.balance,
    createdAt: wallets.createdAt,
    updatedAt: wallets.updatedAt,
    email: users.email,
    companyName: sql`${userProfiles.companyInfo} ->> 'brandName'`,
  }
  const sortColumn = sortColumns[sortBy] ?? wallets.updatedAt
  const orderBy = sortOrder === 'asc' ? sortColumn : desc(sortColumn)

  // Get total count
  const totalCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(wallets)
    .innerJoin(users, eq(wallets.userId, users.id))
    .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(filters.length > 0 ? and(...filters) : undefined)

  const totalCount = Number(totalCountResult[0]?.count || 0)

  // Get wallets with user info
  const walletsData = await db
    .select({
      id: wallets.id,
      userId: wallets.userId,
      balance: wallets.balance,
      currency: wallets.currency,
      createdAt: wallets.createdAt,
      updatedAt: wallets.updatedAt,
      userEmail: users.email,
      userRole: users.role,
      companyInfo: userProfiles.companyInfo,
    })
    .from(wallets)
    .innerJoin(users, eq(wallets.userId, users.id))
    .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)

  return {
    data: walletsData,
    totalCount,
    page,
    limit,
  }
}

export const getWalletByUserId = async (userId: string) => {
  const walletData = await db
    .select({
      id: wallets.id,
      userId: wallets.userId,
      balance: wallets.balance,
      currency: wallets.currency,
      createdAt: wallets.createdAt,
      updatedAt: wallets.updatedAt,
      userEmail: users.email,
      userRole: users.role,
      companyInfo: userProfiles.companyInfo,
    })
    .from(wallets)
    .innerJoin(users, eq(wallets.userId, users.id))
    .innerJoin(userProfiles, eq(users.id, userProfiles.userId))
    .where(eq(wallets.userId, userId))
    .limit(1)

  if (!walletData[0]) {
    throw new Error('Wallet not found for this user')
  }

  return walletData[0]
}

export const getWalletTransactionsByUserId = async ({
  userId,
  page = 1,
  limit = 50,
  type,
  dateFrom,
  dateTo,
}: {
  userId: string
  page?: number
  limit?: number
  type?: 'credit' | 'debit'
  dateFrom?: Date
  dateTo?: Date
}) => {
  const offset = (page - 1) * limit

  // Get wallet
  const userWallet = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
  if (!userWallet[0]) {
    throw new Error('Wallet not found for this user')
  }

  // Build filters
  const conditions: any[] = [eq(walletTransactions.wallet_id, userWallet[0].id)]
  if (type) conditions.push(eq(walletTransactions.type, type))
  if (dateFrom) conditions.push(gte(walletTransactions.created_at, dateFrom))
  if (dateTo) conditions.push(lte(walletTransactions.created_at, dateTo))

  const filter = and(...conditions)

  // Get total count
  const totalCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(walletTransactions)
    .where(filter)

  const totalCount = Number(totalCountResult[0]?.count || 0)

  // Get transactions
  const transactions = await db
    .select()
    .from(walletTransactions)
    .where(filter)
    .orderBy(desc(walletTransactions.created_at))
    .limit(limit)
    .offset(offset)

  return {
    wallet: userWallet[0],
    transactions,
    totalCount,
    page,
    limit,
  }
}

