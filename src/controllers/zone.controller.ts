import { Request, Response } from 'express'
import * as zoneService from '../models/services/zone.service'

export const createZone = async (req: Request, res: Response) => {
  try {
    const zone = await zoneService.createZone(req.body, req?.body?.business_type?.toLowerCase())
    res.status(201).json(zone)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
    console.log('[creatzezone controller:', err)
  }
}

export const getAllZones = async (req: Request, res: Response) => {
  try {
    const { business_type, courier_id } = req.query

    // Support multiple courier IDs as comma-separated string
    const courierIds = courier_id ? String(courier_id).split(',').filter(Boolean) : null

    const zones = await zoneService.getAllZones(
      business_type ? String(business_type) : null,
      courierIds, // pass as array or null
    )

    res.status(200).json(zones)
  } catch (err) {
    if (err instanceof Error) {
      res.status(500).json({ error: err.message })
    } else {
      res.status(500).json({ error: String(err) })
    }
  }
}

export const getZoneById = async (req: Request, res: Response) => {
  try {
    const zone = await zoneService.getZoneById(req.params.id)
    if (!zone) return res.status(404).json({ error: 'Zone not found' })
    res.status(200).json(zone)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}

export const updateZone = async (req: Request, res: Response) => {
  try {
    const updated = await zoneService.updateZone(req.params.id, req.body)

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Zone not found',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'Zone updated successfully',
      data: updated,
    })
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Failed to update zone',
      error: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}

export const deleteZone = async (req: Request, res: Response) => {
  try {
    await zoneService.deleteZone(req.params.id)
    res.status(200).json({ success: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}

// Zone Mappings
export const addZoneMapping = async (req: Request, res: Response) => {
  try {
    const mapping = await zoneService.addZoneMapping(req.params.zoneId, req.body)
    res.status(201).json(mapping)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}

export const updateZoneMappingController = async (req: Request, res: Response) => {
  try {
    const updated = await zoneService.updateZoneMapping({ id: req.params.mappingId, ...req.body })
    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}

export const getZoneMappings = async (req: Request, res: Response) => {
  try {
    const { zoneId } = req.params
    const { page = 1, limit = 20, pincode, city, state, sortBy, sortOrder } = req.query

    const filters: any = {}
    if (pincode) filters.pincode = pincode
    if (city) filters.city = city
    if (state) filters.state = state

    const { data, total } = await zoneService.getZoneMappingsPaginated(zoneId, {
      page: Number(page),
      limit: Number(limit),
      filters,
      sortBy: sortBy as 'city' | 'state' | 'pincode' | 'created_at' | undefined,
      sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
    })

    res.json({ data, total, page: Number(page), limit: Number(limit) })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}

export const deleteZoneMapping = async (req: Request, res: Response) => {
  try {
    await zoneService.deleteZoneMapping(req.params.mappingId)
    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}

// ---------------- Bulk Zone Mappings ----------------
export const bulkDeleteMappings = async (req: Request, res: Response) => {
  try {
    const { mappingIds } = req.body
    if (!Array.isArray(mappingIds) || mappingIds.length === 0) {
      return res.status(400).json({ error: 'mappingIds must be a non-empty array' })
    }

    const result = await zoneService.bulkDeleteMappings(mappingIds)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}

export const bulkMoveMappings = async (req: Request, res: Response) => {
  try {
    const { mappingIds, zoneId } = req.body
    if (!Array.isArray(mappingIds) || mappingIds.length === 0 || !zoneId) {
      return res.status(400).json({ error: 'mappingIds must be non-empty and zoneId is required' })
    }

    const result = await zoneService.bulkMoveMappings(mappingIds, zoneId)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
}

export const importZoneMappingsFronCSV = async (req: Request, res: Response) => {
  try {
    const zoneId = req.params.zoneId
    if (!zoneId) return res.status(400).json({ error: 'Zone ID is required' })
    if (!req.file) return res.status(400).json({ error: 'CSV file is required' })

    const { userChoices } = req.body as any
    let userChoicesPayload = undefined
    if (userChoices !== undefined) {
      userChoicesPayload = JSON.parse(userChoices)
    }
    const result = await zoneService.bulkInsertZoneMappingsFromCSV(
      req.file.path,
      zoneId,
      userChoicesPayload,
    )

    res.status(200).json({
      message: `Imported ${result.inserted} mappings`,
      ...result, // either duplicates OR overridden + skipped
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to import zone mappings' })
  }
}
