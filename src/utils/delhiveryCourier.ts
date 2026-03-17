export const DELHIVERY_COURIER_IDS = {
  EXPRESS: 100,
  SURFACE: 99,
} as const

export const DELHIVERY_ALLOWED_COURIER_IDS: number[] = [
  DELHIVERY_COURIER_IDS.EXPRESS,
  DELHIVERY_COURIER_IDS.SURFACE,
]

export const normalizeCourierId = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Number(value)
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export const isSupportedDelhiveryCourierId = (value: unknown): boolean => {
  const id = normalizeCourierId(value)
  if (id === null) return false
  return DELHIVERY_ALLOWED_COURIER_IDS.includes(id)
}

export const getDelhiveryShippingModeByCourierId = (
  value: unknown,
): 'Express' | 'Surface' | null => {
  const id = normalizeCourierId(value)
  if (id === DELHIVERY_COURIER_IDS.EXPRESS) return 'Express'
  if (id === DELHIVERY_COURIER_IDS.SURFACE) return 'Surface'
  return null
}
