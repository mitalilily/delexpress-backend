"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platforms = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
exports.platforms = (0, pg_core_1.pgTable)("platforms", {
    id: (0, pg_core_1.integer)("id").primaryKey(),
    name: (0, pg_core_1.varchar)("name", { length: 100 }).notNull(),
    slug: (0, pg_core_1.varchar)("slug", { length: 100 }).notNull().unique(),
});
