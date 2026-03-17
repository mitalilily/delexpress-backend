export interface OrderAmountResult {
  value?: number
  wasProvided: boolean
  invalid: boolean
}

const normalizeNumber = (input: unknown): number | undefined => {
  if (input === undefined || input === null || input === '') return undefined
  if (typeof input === 'number') {
    if (Number.isNaN(input)) return undefined
    return input
  }
  const parsed = Number(input)
  if (Number.isNaN(parsed)) return undefined
  return parsed
}

export const extractOrderAmountFromBody = (body: Record<string, any>): OrderAmountResult => {
  if (!body) {
    return { wasProvided: false, invalid: false }
  }

  const rawValue = body.order_amount ?? body.orderAmount

  if (rawValue === undefined || rawValue === null || rawValue === '') {
    return { wasProvided: false, invalid: false }
  }

  const parsed = normalizeNumber(rawValue)
  if (parsed === undefined) {
    return { wasProvided: true, invalid: true }
  }

  if (parsed < 0) {
    return { wasProvided: true, invalid: true }
  }

  return {
    value: parsed,
    wasProvided: true,
    invalid: false,
  }
}
