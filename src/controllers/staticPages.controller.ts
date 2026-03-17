import { NextFunction, Request, Response } from 'express'
import { StaticPagesService } from '../models/services/staticPages.service'

export const StaticPagesController = {
  async getBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params
      const page = await StaticPagesService.getBySlug(slug)

      if (!page) {
        return res.status(404).json({ message: 'Page not found' })
      }

      return res.json({ data: page })
    } catch (err) {
      next(err)
    }
  },

  async upsertBySlug(req: Request, res: Response, next: NextFunction) {
    try {
      const { slug } = req.params
      const { title, content } = req.body as { title?: string; content: string }

      if (!content || typeof content !== 'string' || !content.trim()) {
        return res.status(400).json({ message: 'Content is required' })
      }

      const page = await StaticPagesService.upsertBySlug(slug, { title, content })
      return res.json({ data: page })
    } catch (err) {
      next(err)
    }
  },
}


