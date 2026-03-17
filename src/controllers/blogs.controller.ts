import { NextFunction, Request, Response } from 'express'
import { BlogService } from '../models/services/blog.service'

export const BlogController = {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      // slug comes from frontend
      const payload = req.body
      const created = await BlogService.create(payload)
      res.status(201).json({ data: created })
    } catch (err) {
      next(err)
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = Number(req.params.id)
      const updated = await BlogService.update(id, req.body)
      res.json({ data: updated })
    } catch (err) {
      next(err)
    }
  },

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const filters = req.query || {}
      const page = Number(req.query.page || 1)
      const limit = Number(req.query.limit || 10)
      const result = await BlogService.list(filters, { page, limit })
      res.json({ data: result.rows, total: result.total })
    } catch (err) {
      next(err)
    }
  },

  async stats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await BlogService.getStats()
      res.json({ data: stats })
    } catch (err) {
      next(err)
    }
  },

  async get(req: Request, res: Response, next: NextFunction) {
    try {
      const param = req.params.id // could be numeric id or slug
      let blog

      if (!isNaN(Number(param))) {
        // param is a number → treat as ID
        blog = await BlogService.getById(Number(param))
      } else {
        // param is a string → treat as slug
        blog = await BlogService.getBySlug(param)
      }

      if (!blog) {
        return res.status(404).json({ message: 'Blog not found' })
      }

      res.json({ data: blog })
    } catch (err) {
      next(err)
    }
  },
}
