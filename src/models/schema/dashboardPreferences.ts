import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const dashboardPreferences = pgTable('dashboard_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' })
    .unique(),

  // Widget visibility (which widgets to show/hide)
  widgetVisibility: jsonb('widget_visibility')
    .$type<Record<string, boolean>>()
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
  widgetOrder: jsonb('widget_order')
    .$type<string[]>()
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
  layout: jsonb('layout')
    .$type<{
      columns?: number
      spacing?: number
      cardStyle?: 'default' | 'compact' | 'spacious'
      showGridLines?: boolean
    }>()
    .default({
      columns: 12,
      spacing: 3,
      cardStyle: 'default',
      showGridLines: false,
    })
    .notNull(),

  // Date range preferences
  dateRange: jsonb('date_range')
    .$type<{
      defaultRange?: '7days' | '30days' | '90days' | 'custom'
      customStart?: string
      customEnd?: string
    }>()
    .default({
      defaultRange: '7days',
    })
    .notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

