import axios from 'axios'
import { presignDownload } from './upload.service'
import { PickupDetails } from '../schema/b2cOrders'

export type NormalizedPickupDetails = Partial<PickupDetails>

export const normalizePickupDetails = (raw: unknown): NormalizedPickupDetails | null => {
  if (!raw) return null
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        return parsed as NormalizedPickupDetails
      }
      return null
    } catch {
      return null
    }
  }

  if (typeof raw === 'object') {
    return raw as NormalizedPickupDetails
  }

  return null
}

export const formatPickupAddressLines = (details?: NormalizedPickupDetails | null): string[] => {
  if (!details) return []
  const lines: string[] = []
  if (details.address) lines.push(details.address.trim())
  const cityState = [details.city, details.state].filter(Boolean).join(', ')
  if (cityState) lines.push(cityState)
  if (details.pincode) lines.push(details.pincode)
  return lines
}

export const formatPickupAddress = (details?: NormalizedPickupDetails | null): string => {
  return formatPickupAddressLines(details).join('\n')
}

const IMAGE_DOWNLOAD_TIMEOUT = 20000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

export interface InvoiceAssetsOptions {
  companyLogoKey?: string
  includeSignature?: boolean
  signatureFile?: string
}

const downloadBuffer = async (key: string, context: string): Promise<Buffer | undefined> => {
  try {
    const logoUrl = await presignDownload(key)
    const finalUrl = Array.isArray(logoUrl) ? logoUrl[0] : logoUrl
    if (!finalUrl) return undefined
    const response = await axios.get(finalUrl, {
      responseType: 'arraybuffer',
      timeout: IMAGE_DOWNLOAD_TIMEOUT,
      maxContentLength: MAX_IMAGE_BYTES,
      maxBodyLength: MAX_IMAGE_BYTES,
    })
    const buffer = Buffer.from(response.data)
    if (buffer.length === 0) {
      console.warn(`⚠️ [Invoice Assets] ${context} image buffer was empty (${finalUrl})`)
      return undefined
    }
    return buffer
  } catch (err: any) {
    console.warn(`⚠️ [Invoice Assets] Failed to download ${context} image:`, err?.message || err)
    return undefined
  }
}

export const loadInvoiceAssets = async (
  options: InvoiceAssetsOptions,
  contextLabel: string,
): Promise<{ logoBuffer?: Buffer; signatureBuffer?: Buffer }> => {
  const { companyLogoKey, includeSignature, signatureFile } = options
  const logoBuffer = companyLogoKey
    ? await downloadBuffer(companyLogoKey, `${contextLabel} logo`)
    : undefined

  let signatureBuffer: Buffer | undefined
  if (includeSignature && signatureFile) {
    signatureBuffer = await downloadBuffer(signatureFile, `${contextLabel} signature`)
  }

  return { logoBuffer, signatureBuffer }
}
