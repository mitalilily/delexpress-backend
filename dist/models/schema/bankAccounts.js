"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bankAccounts = exports.bankTypeEnum = exports.bankAccountStatusEnum = void 0;
// db/schema/bankAccounts.ts
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.bankAccountStatusEnum = (0, pg_core_1.pgEnum)("bank_account_status", [
    "pending",
    "verified",
    "rejected",
]);
exports.bankTypeEnum = (0, pg_core_1.pgEnum)("accountType", ["CURRENT", "SAVINGS"]);
exports.bankAccounts = (0, pg_core_1.pgTable)("bank_accounts", {
    id: (0, pg_core_1.uuid)("id").defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)("userId")
        .references(() => users_1.users.id, { onDelete: "cascade" })
        .notNull(),
    bankName: (0, pg_core_1.varchar)("bankName", { length: 128 }).notNull(),
    branch: (0, pg_core_1.varchar)("branch", { length: 128 }).notNull(),
    accountHolder: (0, pg_core_1.varchar)("accountHolder", { length: 128 }).notNull(),
    upiId: (0, pg_core_1.varchar)("upiId", { length: 128 }).unique(),
    accountNumber: (0, pg_core_1.varchar)("accountNumber", { length: 64 }).unique(),
    accountType: (0, exports.bankTypeEnum)("accountType").default("CURRENT"),
    fundAccountId: (0, pg_core_1.varchar)("fundAccountId", { length: 128 }).unique(),
    isPrimary: (0, pg_core_1.boolean)("isPrimary").default(false),
    ifsc: (0, pg_core_1.varchar)("ifsc", { length: 12 }),
    chequeImageUrl: (0, pg_core_1.varchar)("chequeImageUrl", { length: 255 }),
    status: (0, exports.bankAccountStatusEnum)("status").default("pending").notNull(),
    rejectionReason: (0, pg_core_1.varchar)("rejectionReason"),
    createdAt: (0, pg_core_1.timestamp)("createdAt").defaultNow(),
});
