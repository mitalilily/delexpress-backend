"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveDashboardPreferences = exports.getDashboardPreferences = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const dashboardPreferences_1 = require("../schema/dashboardPreferences");
const defaultPreferences = {
    widgetVisibility: {
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
    },
    widgetOrder: [
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
    ],
    layout: {
        columns: 12,
        spacing: 3,
        cardStyle: 'default',
        showGridLines: false,
    },
    dateRange: {
        defaultRange: '7days',
    },
};
const getDashboardPreferences = async (userId) => {
    const [prefs] = await client_1.db
        .select()
        .from(dashboardPreferences_1.dashboardPreferences)
        .where((0, drizzle_orm_1.eq)(dashboardPreferences_1.dashboardPreferences.userId, userId))
        .limit(1);
    if (!prefs) {
        // Create default preferences
        await client_1.db.insert(dashboardPreferences_1.dashboardPreferences).values({
            userId,
            widgetVisibility: defaultPreferences.widgetVisibility,
            widgetOrder: defaultPreferences.widgetOrder,
            layout: defaultPreferences.layout,
            dateRange: defaultPreferences.dateRange,
        });
        return defaultPreferences;
    }
    return {
        widgetVisibility: prefs.widgetVisibility || defaultPreferences.widgetVisibility,
        widgetOrder: prefs.widgetOrder || defaultPreferences.widgetOrder,
        layout: prefs.layout || defaultPreferences.layout,
        dateRange: prefs.dateRange || defaultPreferences.dateRange,
    };
};
exports.getDashboardPreferences = getDashboardPreferences;
const saveDashboardPreferences = async (userId, preferences) => {
    try {
        const existing = await client_1.db
            .select()
            .from(dashboardPreferences_1.dashboardPreferences)
            .where((0, drizzle_orm_1.eq)(dashboardPreferences_1.dashboardPreferences.userId, userId))
            .limit(1);
        const updatedPrefs = {
            ...(existing[0]
                ? {
                    widgetVisibility: existing[0].widgetVisibility || defaultPreferences.widgetVisibility,
                    widgetOrder: existing[0].widgetOrder || defaultPreferences.widgetOrder,
                    layout: existing[0].layout || defaultPreferences.layout,
                    dateRange: existing[0].dateRange || defaultPreferences.dateRange,
                }
                : defaultPreferences),
            ...preferences,
        };
        if (existing[0]) {
            const [updated] = await client_1.db
                .update(dashboardPreferences_1.dashboardPreferences)
                .set({
                widgetVisibility: updatedPrefs.widgetVisibility,
                widgetOrder: updatedPrefs.widgetOrder,
                layout: updatedPrefs.layout,
                dateRange: updatedPrefs.dateRange,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(dashboardPreferences_1.dashboardPreferences.userId, userId))
                .returning();
            if (updated) {
                return {
                    widgetVisibility: updated.widgetVisibility || updatedPrefs.widgetVisibility,
                    widgetOrder: updated.widgetOrder || updatedPrefs.widgetOrder,
                    layout: updated.layout || updatedPrefs.layout,
                    dateRange: updated.dateRange || updatedPrefs.dateRange,
                };
            }
        }
        else {
            const [newPrefs] = await client_1.db
                .insert(dashboardPreferences_1.dashboardPreferences)
                .values({
                userId,
                widgetVisibility: updatedPrefs.widgetVisibility,
                widgetOrder: updatedPrefs.widgetOrder,
                layout: updatedPrefs.layout,
                dateRange: updatedPrefs.dateRange,
            })
                .returning();
            if (newPrefs) {
                return {
                    widgetVisibility: newPrefs.widgetVisibility || updatedPrefs.widgetVisibility,
                    widgetOrder: newPrefs.widgetOrder || updatedPrefs.widgetOrder,
                    layout: newPrefs.layout || updatedPrefs.layout,
                    dateRange: newPrefs.dateRange || updatedPrefs.dateRange,
                };
            }
        }
        return updatedPrefs;
    }
    catch (error) {
        console.error('Error saving dashboard preferences:', error);
        throw error;
    }
};
exports.saveDashboardPreferences = saveDashboardPreferences;
