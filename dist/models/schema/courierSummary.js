"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.courierSummary = void 0;
// drizzle/schema/courierSummary.ts
const pg_core_1 = require("drizzle-orm/pg-core");
exports.courierSummary = (0, pg_core_1.pgTable)("courier_summary", {
    id: (0, pg_core_1.integer)("id").primaryKey().default(1), // Always single row
    totalCourierCount: (0, pg_core_1.integer)("total_courier_count").notNull(),
    serviceablePincodesCount: (0, pg_core_1.integer)("serviceable_pincodes_count").notNull(),
    pickupPincodesCount: (0, pg_core_1.integer)("pickup_pincodes_count").notNull(),
    totalRtoCount: (0, pg_core_1.integer)("total_rto_count").notNull(),
    totalOdaCount: (0, pg_core_1.integer)("total_oda_count").notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
