import { Request, Response } from 'express'
import { LocationService } from '../../models/services/location.service'

export const LocationController = {
  create: async (req: Request, res: Response) => {
    try {
      const location = await LocationService.create(req.body)
      res.status(201).json(location)
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Failed to create location' })
    }
  },

  list: async (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page) || 1
      const limit = Number(req.query.limit) || 20
      const filters = {
        pincode: req.query.pincode as string,
        city: req.query.city as string,
        state: req.query.state as string,
      }
      const result = await LocationService.list({ page, limit, filters })
      res.json(result)
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Failed to fetch locations' })
    }
  },

  getById: async (req: Request, res: Response) => {
    try {
      const location = await LocationService.getById(req.params.id)
      if (!location) return res.status(404).json({ message: 'Location not found' })
      res.json(location)
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Failed to fetch location' })
    }
  },

  update: async (req: Request, res: Response) => {
    try {
      const location = await LocationService.update(req.params.id, req.body)
      if (!location) return res.status(404).json({ message: 'Location not found' })
      res.json(location)
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Failed to update location' })
    }
  },

  delete: async (req: Request, res: Response) => {
    try {
      const deleted = await LocationService.delete(req.params.id)
      if (!deleted) return res.status(404).json({ message: 'Location not found' })
      res.json({ message: 'Location deleted successfully' })
    } catch (err) {
      console.error(err)
      res.status(500).json({ message: 'Failed to delete location' })
    }
  },
}
