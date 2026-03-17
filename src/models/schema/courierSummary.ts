// drizzle/schema/courierSummary.ts
import { integer, pgTable, timestamp } from "drizzle-orm/pg-core";

export const courierSummary = pgTable("courier_summary", {
  id: integer("id").primaryKey().default(1), // Always single row
  totalCourierCount: integer("total_courier_count").notNull(),
  serviceablePincodesCount: integer("serviceable_pincodes_count").notNull(),
  pickupPincodesCount: integer("pickup_pincodes_count").notNull(),
  totalRtoCount: integer("total_rto_count").notNull(),
  totalOdaCount: integer("total_oda_count").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
