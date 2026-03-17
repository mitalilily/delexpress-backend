"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.employees = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
var users_1 = require("./users");
exports.employees = (0, pg_core_1.pgTable)('employees', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    adminId: (0, pg_core_1.uuid)('admin_id')
        .notNull()
        .references(function () { return users_1.users.id; }),
    // ─── Relations ────────────────────────────────────────────────
    userId: (0, pg_core_1.uuid)('userId')
        .notNull()
        .unique()
        .references(function () { return users_1.users.id; }, { onDelete: 'cascade' }),
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    email: (0, pg_core_1.varchar)('email', { length: 100 }).notNull().unique(),
    phone: (0, pg_core_1.varchar)('phone', { length: 20 }),
    role: (0, pg_core_1.varchar)('role', { length: 50 }).notNull(),
    moduleAccess: (0, pg_core_1.jsonb)('module_access').default('{}'),
    isActive: (0, pg_core_1.boolean)('is_active').default(true),
    isOnline: (0, pg_core_1.boolean)('is_online').default(false), // <-- added this
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .$onUpdateFn(function () { return new Date(); }),
});
