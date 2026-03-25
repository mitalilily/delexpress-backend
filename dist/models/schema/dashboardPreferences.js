"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardPreferences = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.dashboardPreferences = (0, pg_core_1.pgTable)('dashboard_preferences', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' })
        .unique(),
    // Widget visibility (which widgets to show/hide)
    widgetVisibility: (0, pg_core_1.jsonb)('widget_visibility')
        .$type()
        .default({
        quickStats: true,
        quickActions: true,
        insights: true,
        actionItems: true,
        recommendations: true,
        performanceMetrics: true,
        ordersTrend: true,
        financialHealth: true,
        recentActivity: true,
        revenueChart: true,
        todaysOperations: true,
        orderStatusChart: true,
        revenueByTypeChart: true,
        courierComparison: true,
        metricsOverview: true,
        courierPerformance: true,
        topDestinations: true,
    })
        .notNull(),
    // Widget order (custom ordering of widgets)
    widgetOrder: (0, pg_core_1.jsonb)('widget_order')
        .$type()
        .default([
        'quickStats',
        'quickActions',
        'insights',
        'actionItems',
        'recommendations',
        'performanceMetrics',
        'ordersTrend',
        'financialHealth',
        'recentActivity',
        'revenueChart',
        'todaysOperations',
        'orderStatusChart',
        'revenueByTypeChart',
        'courierComparison',
        'metricsOverview',
        'courierPerformance',
        'topDestinations',
    ])
        .notNull(),
    // Layout preferences
    layout: (0, pg_core_1.jsonb)('layout')
        .$type()
        .default({
        columns: 12,
        spacing: 3,
        cardStyle: 'default',
        showGridLines: false,
    })
        .notNull(),
    // Date range preferences
    dateRange: (0, pg_core_1.jsonb)('date_range')
        .$type()
        .default({
        defaultRange: '7days',
    })
        .notNull(),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
});
