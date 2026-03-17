// services/notificationService.ts
import sgMail from '@sendgrid/mail'
import { and, desc, eq } from 'drizzle-orm'
import { sendNotification } from '../../config/socketServer'
import { db } from '../client'
import { notifications } from '../schema/notifications'
import { users } from '../schema/users'

sgMail.setApiKey(process.env.TWILLIO_SENDGRID_API_KEY!)

export type NotificationType = 'ticket_update' | 'payment' | 'general'

interface CreateNotificationParams {
  userId?: string
  title: string
  message: string
  targetRole: 'admin' | 'user'
  type?: NotificationType
  sendEmail?: boolean
  email?: string
}

export async function createNotificationService(params: CreateNotificationParams) {
  const { targetRole, userId, title, message, sendEmail = false } = params

  if (targetRole === 'admin') {
    const adminUsers = await db.query.users.findMany({
      where: eq(users.role, 'admin'),
      columns: { id: true, email: true },
    })

    if (adminUsers.length === 0) return null

    // Prepare all notifications for all admins
    const notificationsData = adminUsers.map((admin) => ({
      targetRole,
      userId: admin.id,
      title,
      message,
    }))

    // Insert all in one query
    const newNotifications = await db.insert(notifications).values(notificationsData).returning()

    // Send each to its respective admin once
    newNotifications.forEach((n) => {
      if (n?.userId) sendNotification(n?.userId, n)
    })

    return newNotifications
  }

  // For a single user
  const [newNotification] = await db
    .insert(notifications)
    .values({
      targetRole,
      userId: userId || null,
      title,
      message,
    })
    .returning()

  if (userId && targetRole === 'user') {
    sendNotification(userId, newNotification)
  }

  return newNotification
}

export async function getNotificationsForUser(userId: string) {
  const rows = await db
    .select()
    .from(notifications)
    .where(
      eq(notifications.userId, userId) as any, // drizzle limitation
    )
    .orderBy(desc(notifications.createdAt))
  return rows
}

export async function markNotificationAsRead(userId: string, notificationId: string) {
  const [updated] = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
    .returning()
  return updated
}

export async function markAllNotificationsAsRead(userId: string) {
  const updated = await db
    .update(notifications)
    .set({ read: true })
    .where(and(eq(notifications.userId, userId), eq(notifications.read, false)))
    .returning({ id: notifications.id })

  return {
    count: updated.length,
  }
}

async function sendEmailNotification(to: string, subject: string, message: string) {
  const msg = {
    to,
    from: process.env.EMAIL_FROM!,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333;">${subject}</h2>
        <p style="font-size: 16px; color: #555;">${message}</p>
        <p style="font-size: 14px; color: #888; margin-top: 32px;">— The DelExpress Team</p>
      </div>
    `,
  }

  try {
    await sgMail.send(msg)
  } catch (error) {
    console.error('Email sending failed:', error)
  }
}
