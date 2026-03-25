"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWalletTransactionsByUserId = exports.getWalletByUserId = exports.getAllWallets = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const wallet_1 = require("../schema/wallet");
const userProfile_1 = require("../schema/userProfile");
const users_1 = require("../schema/users");
const getAllWallets = async ({ page = 1, limit = 20, search = '', sortBy = 'updatedAt', sortOrder = 'desc', }) => {
    const offset = (page - 1) * limit;
    const filters = [];
    // Search filter
    if (search.trim()) {
        const pattern = `%${search.trim()}%`;
        filters.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${userProfile_1.userProfiles.companyInfo} ->> 'brandName', '')`, pattern), (0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${userProfile_1.userProfiles.companyInfo} ->> 'contactPerson', '')`, pattern), (0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${userProfile_1.userProfiles.companyInfo} ->> 'contactEmail', '')`, pattern), (0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${userProfile_1.userProfiles.companyInfo} ->> 'businessName', '')`, pattern), (0, drizzle_orm_1.ilike)(users_1.users.email, pattern)));
    }
    // Sort mapping
    const sortColumns = {
        balance: wallet_1.wallets.balance,
        createdAt: wallet_1.wallets.createdAt,
        updatedAt: wallet_1.wallets.updatedAt,
        email: users_1.users.email,
        companyName: (0, drizzle_orm_1.sql) `${userProfile_1.userProfiles.companyInfo} ->> 'brandName'`,
    };
    const sortColumn = sortColumns[sortBy] ?? wallet_1.wallets.updatedAt;
    const orderBy = sortOrder === 'asc' ? sortColumn : (0, drizzle_orm_1.desc)(sortColumn);
    // Get total count
    const totalCountResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(wallet_1.wallets)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(wallet_1.wallets.userId, users_1.users.id))
        .innerJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(users_1.users.id, userProfile_1.userProfiles.userId))
        .where(filters.length > 0 ? (0, drizzle_orm_1.and)(...filters) : undefined);
    const totalCount = Number(totalCountResult[0]?.count || 0);
    // Get wallets with user info
    const walletsData = await client_1.db
        .select({
        id: wallet_1.wallets.id,
        userId: wallet_1.wallets.userId,
        balance: wallet_1.wallets.balance,
        currency: wallet_1.wallets.currency,
        createdAt: wallet_1.wallets.createdAt,
        updatedAt: wallet_1.wallets.updatedAt,
        userEmail: users_1.users.email,
        userRole: users_1.users.role,
        companyInfo: userProfile_1.userProfiles.companyInfo,
    })
        .from(wallet_1.wallets)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(wallet_1.wallets.userId, users_1.users.id))
        .innerJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(users_1.users.id, userProfile_1.userProfiles.userId))
        .where(filters.length > 0 ? (0, drizzle_orm_1.and)(...filters) : undefined)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset);
    return {
        data: walletsData,
        totalCount,
        page,
        limit,
    };
};
exports.getAllWallets = getAllWallets;
const getWalletByUserId = async (userId) => {
    const walletData = await client_1.db
        .select({
        id: wallet_1.wallets.id,
        userId: wallet_1.wallets.userId,
        balance: wallet_1.wallets.balance,
        currency: wallet_1.wallets.currency,
        createdAt: wallet_1.wallets.createdAt,
        updatedAt: wallet_1.wallets.updatedAt,
        userEmail: users_1.users.email,
        userRole: users_1.users.role,
        companyInfo: userProfile_1.userProfiles.companyInfo,
    })
        .from(wallet_1.wallets)
        .innerJoin(users_1.users, (0, drizzle_orm_1.eq)(wallet_1.wallets.userId, users_1.users.id))
        .innerJoin(userProfile_1.userProfiles, (0, drizzle_orm_1.eq)(users_1.users.id, userProfile_1.userProfiles.userId))
        .where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId))
        .limit(1);
    if (!walletData[0]) {
        throw new Error('Wallet not found for this user');
    }
    return walletData[0];
};
exports.getWalletByUserId = getWalletByUserId;
const getWalletTransactionsByUserId = async ({ userId, page = 1, limit = 50, type, dateFrom, dateTo, }) => {
    const offset = (page - 1) * limit;
    // Get wallet
    const userWallet = await client_1.db.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId)).limit(1);
    if (!userWallet[0]) {
        throw new Error('Wallet not found for this user');
    }
    // Build filters
    const conditions = [(0, drizzle_orm_1.eq)(wallet_1.walletTransactions.wallet_id, userWallet[0].id)];
    if (type)
        conditions.push((0, drizzle_orm_1.eq)(wallet_1.walletTransactions.type, type));
    if (dateFrom)
        conditions.push((0, drizzle_orm_1.gte)(wallet_1.walletTransactions.created_at, dateFrom));
    if (dateTo)
        conditions.push((0, drizzle_orm_1.lte)(wallet_1.walletTransactions.created_at, dateTo));
    const filter = (0, drizzle_orm_1.and)(...conditions);
    // Get total count
    const totalCountResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(wallet_1.walletTransactions)
        .where(filter);
    const totalCount = Number(totalCountResult[0]?.count || 0);
    // Get transactions
    const transactions = await client_1.db
        .select()
        .from(wallet_1.walletTransactions)
        .where(filter)
        .orderBy((0, drizzle_orm_1.desc)(wallet_1.walletTransactions.created_at))
        .limit(limit)
        .offset(offset);
    return {
        wallet: userWallet[0],
        transactions,
        totalCount,
        page,
        limit,
    };
};
exports.getWalletTransactionsByUserId = getWalletTransactionsByUserId;
