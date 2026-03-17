// routes/notificationRoutes.ts
import { Router } from 'express'
import {
  createNotificationController,
  getMyNotifications,
  markAllReadController,
  markReadController,
} from '../controllers/notification.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

// Create a notification
router.post('/', requireAuth, createNotificationController)

// Get all notifications for logged-in user
router.get('/', requireAuth, getMyNotifications)

// Mark all notifications as read
router.patch('/read-all', requireAuth, markAllReadController)

// Mark a specific notification as read
router.patch('/:id/read', requireAuth, markReadController)

export default router
