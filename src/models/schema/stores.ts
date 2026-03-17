import {
  pgTable,
  varchar,
  timestamp,
  integer,
  jsonb,
  uuid,
} from "drizzle-orm/pg-core";
import { platforms } from "./platform";
import { users } from "./users";

export const stores = pgTable("stores", {
  id: varchar("id", { length: 50 }).primaryKey(), // platform store ID (e.g., Shopify shop id or Woo store uuid)
  name: varchar("name", { length: 255 }),
  userId: uuid("userId")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  domain: varchar("domain", { length: 255 }).notNull(),
  platformId: integer("platformId")
    .notNull()
    .references(() => platforms.id),
  apiKey: varchar("apiKey", { length: 255 }).notNull(),
  adminApiAccessToken: varchar("adminApiAccessToken", {
    length: 255,
  }).notNull(),
  settings: jsonb("settings").default({}).notNull(),
  timezone: varchar("timezone", { length: 100 }),
  country: varchar("country", { length: 100 }),
  currency: varchar("currency", { length: 10 }),
  metadata: jsonb("metadata"), // store full JSON if needed
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
});
