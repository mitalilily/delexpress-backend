// db/schema/bankAccounts.ts
import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const bankAccountStatusEnum = pgEnum("bank_account_status", [
  "pending",
  "verified",
  "rejected",
]);

export const bankTypeEnum = pgEnum("accountType", ["CURRENT", "SAVINGS"]);

export const bankAccounts = pgTable("bank_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("userId")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  bankName: varchar("bankName", { length: 128 }).notNull(),
  branch: varchar("branch", { length: 128 }).notNull(),
  accountHolder: varchar("accountHolder", { length: 128 }).notNull(),
  upiId: varchar("upiId", { length: 128 }).unique(),
  accountNumber: varchar("accountNumber", { length: 64 }).unique(),
  accountType: bankTypeEnum("accountType").default("CURRENT"),
  fundAccountId: varchar("fundAccountId", { length: 128 }).unique(),
  isPrimary: boolean("isPrimary").default(false),
  ifsc: varchar("ifsc", { length: 12 }),
  chequeImageUrl: varchar("chequeImageUrl", { length: 255 }),
  status: bankAccountStatusEnum("status").default("pending").notNull(),
  rejectionReason: varchar("rejectionReason"),

  createdAt: timestamp("createdAt").defaultNow(),
});
