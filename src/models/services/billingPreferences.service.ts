import { eq } from 'drizzle-orm'
import { db } from '../client'
import { billingPreferences, IBillingPreference } from '../schema/billingPreferences'

export class BillingPreferencesService {
  // Fetch a user's billing preference
  static async getByUserId(userId: string): Promise<IBillingPreference | null> {
    const rows = await db
      .select()
      .from(billingPreferences)
      .where(eq(billingPreferences.userId, userId))
      .limit(1)

    // rows is an array; return first element or null
    return rows.length ? (rows[0] as IBillingPreference) : null
  }
  // Create or update a user's billing preference
  static async upsert(
    userId: string,
    data: Pick<IBillingPreference, 'frequency' | 'autoGenerate' | 'customFrequencyDays'>,
  ): Promise<string> {
    const existing = await db
      .select()
      .from(billingPreferences)
      .where(eq(billingPreferences.userId, userId))
      .limit(1)

    if (existing) {
      await db
        .update(billingPreferences)
        .set({
          frequency: data.frequency,
          autoGenerate: data.autoGenerate,
          customFrequencyDays: data.frequency === 'custom' ? data.customFrequencyDays : null,
          updatedAt: new Date(),
        })
        .where(eq(billingPreferences.userId, userId))

      return 'updated'
    } else {
      await db.insert(billingPreferences).values({
        userId,
        frequency: data.frequency,
        autoGenerate: data.autoGenerate,
        customFrequencyDays: data.frequency === 'custom' ? data.customFrequencyDays : null,
      })
      return 'created'
    }
  }
}
