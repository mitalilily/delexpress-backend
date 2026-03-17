import { integer, pgTable, varchar } from "drizzle-orm/pg-core";

export const platforms = pgTable("platforms", {
  id: integer("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
});
