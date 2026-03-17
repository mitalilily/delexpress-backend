"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifications = void 0;
// drizzle/schema/notifications.ts
var pg_core_1 = require("drizzle-orm/pg-core");
exports.notifications = (0, pg_core_1.pgTable)('notifications', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('userId'), // optional: can be null for role-based broadcast
    targetRole: (0, pg_core_1.text)('targetRole').notNull(), // "admin" | "client"
    title: (0, pg_core_1.text)('title').notNull(),
    message: (0, pg_core_1.text)('message').notNull(),
    read: (0, pg_core_1.boolean)('read').default(false),
    createdAt: (0, pg_core_1.timestamp)('createdAt').defaultNow(),
});
