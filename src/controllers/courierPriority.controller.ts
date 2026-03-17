import { Request, Response } from 'express'
import { CourierPriorityService } from '../models/services/courierPriority.service'

export const CourierPriorityController = {
  create: async (req: Request, res: Response) => {
    try {
      const user_id = (req as any).user.sub
      const { name, personalised_order } = req.body
      const profile = await CourierPriorityService.createCourierPriorityProfile(
        user_id,
        name,
        personalised_order,
      )
      res.status(201).json(profile)
    } catch (err) {
      res.status(500).json({ error: 'Failed to create profile', details: err })
    }
  },

  getByUser: async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user.sub
      const profiles = await CourierPriorityService.getCourierPriorityProfilesByUser(userId)
      res.json(profiles)
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch profiles', details: err })
    }
  },

  getOne: async (req: Request, res: Response) => {
    try {
      const id = req.params.id
      const profile = await CourierPriorityService.getCourierPriorityProfile(id)
      res.json(profile)
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch profile', details: err })
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const id = req.params.id
      const profile = await CourierPriorityService.updatCourierPriorityeProfile(id, req.body)
      res.json(profile)
    } catch (err) {
      res.status(500).json({ error: 'Failed to update profile', details: err })
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const id = req.params.id
      await CourierPriorityService.deleteCourierPriorityProfile(id)
      res.json({ message: 'Profile deleted' })
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete profile', details: err })
    }
  },
}
