// controllers/notificationController.ts
import { Response } from 'express'
import {
  createNotificationService,
  getNotificationsForUser,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../models/services/notifications.service'

export async function createNotificationController(req: any, res: Response) {
  const { title, message, type, sendEmail, email, targetRole } = req.body
  const userId = req.user.sub

  const notification = await createNotificationService({
    userId,
    title,
    message,
    targetRole,
    type,
    sendEmail,
    email,
  })

  res.json({ success: !!notification, notification })
}

export async function getMyNotifications(req: any, res: Response) {
  try {
    const userId = req.user.sub
    const rows = await getNotificationsForUser(userId)

    res.json({ notifications: rows })
  } catch {
    res.json({ notifications: [] })
  }
}
export async function markReadController(req: any, res: Response) {
  const userId = req.user.sub
  const { id } = req.params

  const success = await markNotificationAsRead(userId, id)
  res.json({ success })
}

export async function markAllReadController(req: any, res: Response) {
  const userId = req.user.sub
  const result = await markAllNotificationsAsRead(userId)
  res.json({ success: true, ...result })
}
