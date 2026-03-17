import { eq } from 'drizzle-orm'
import { db } from '../client'
import { dashboardPreferences } from '../schema/dashboardPreferences'

export interface DashboardPreferences {
  widgetVisibility: Record<string, boolean>
  widgetOrder: string[]
  layout: {
    columns?: number
    spacing?: number
    cardStyle?: 'default' | 'compact' | 'spacious'
    showGridLines?: boolean
  }
  dateRange: {
    defaultRange?: '7days' | '30days' | '90days' | 'custom'
    customStart?: string
    customEnd?: string
  }
}

const defaultPreferences: DashboardPreferences = {
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
}

export const getDashboardPreferences = async (userId: string): Promise<DashboardPreferences> => {
  const [prefs] = await db
    .select()
    .from(dashboardPreferences)
    .where(eq(dashboardPreferences.userId, userId))
    .limit(1)

  if (!prefs) {
    // Create default preferences
    await db.insert(dashboardPreferences).values({
      userId,
      widgetVisibility: defaultPreferences.widgetVisibility,
      widgetOrder: defaultPreferences.widgetOrder,
      layout: defaultPreferences.layout,
      dateRange: defaultPreferences.dateRange,
    })
    return defaultPreferences
  }

  return {
    widgetVisibility: (prefs.widgetVisibility as Record<string, boolean>) || defaultPreferences.widgetVisibility,
    widgetOrder: (prefs.widgetOrder as string[]) || defaultPreferences.widgetOrder,
    layout: (prefs.layout as any) || defaultPreferences.layout,
    dateRange: (prefs.dateRange as any) || defaultPreferences.dateRange,
  }
}

export const saveDashboardPreferences = async (
  userId: string,
  preferences: Partial<DashboardPreferences>,
): Promise<DashboardPreferences> => {
  try {
    const existing = await db
      .select()
      .from(dashboardPreferences)
      .where(eq(dashboardPreferences.userId, userId))
      .limit(1)

    const updatedPrefs: DashboardPreferences = {
      ...(existing[0]
        ? {
            widgetVisibility: (existing[0].widgetVisibility as Record<string, boolean>) || defaultPreferences.widgetVisibility,
            widgetOrder: (existing[0].widgetOrder as string[]) || defaultPreferences.widgetOrder,
            layout: (existing[0].layout as any) || defaultPreferences.layout,
            dateRange: (existing[0].dateRange as any) || defaultPreferences.dateRange,
          }
        : defaultPreferences),
      ...preferences,
    }

    if (existing[0]) {
      const [updated] = await db
        .update(dashboardPreferences)
        .set({
          widgetVisibility: updatedPrefs.widgetVisibility,
          widgetOrder: updatedPrefs.widgetOrder,
          layout: updatedPrefs.layout,
          dateRange: updatedPrefs.dateRange,
          updatedAt: new Date(),
        })
        .where(eq(dashboardPreferences.userId, userId))
        .returning()
      
      if (updated) {
        return {
          widgetVisibility: (updated.widgetVisibility as Record<string, boolean>) || updatedPrefs.widgetVisibility,
          widgetOrder: (updated.widgetOrder as string[]) || updatedPrefs.widgetOrder,
          layout: (updated.layout as any) || updatedPrefs.layout,
          dateRange: (updated.dateRange as any) || updatedPrefs.dateRange,
        }
      }
    } else {
      const [newPrefs] = await db
        .insert(dashboardPreferences)
        .values({
          userId,
          widgetVisibility: updatedPrefs.widgetVisibility,
          widgetOrder: updatedPrefs.widgetOrder,
          layout: updatedPrefs.layout,
          dateRange: updatedPrefs.dateRange,
        })
        .returning()
      
      if (newPrefs) {
        return {
          widgetVisibility: (newPrefs.widgetVisibility as Record<string, boolean>) || updatedPrefs.widgetVisibility,
          widgetOrder: (newPrefs.widgetOrder as string[]) || updatedPrefs.widgetOrder,
          layout: (newPrefs.layout as any) || updatedPrefs.layout,
          dateRange: (newPrefs.dateRange as any) || updatedPrefs.dateRange,
        }
      }
    }

    return updatedPrefs
  } catch (error: any) {
    console.error('Error saving dashboard preferences:', error)
    throw error
  }
}

