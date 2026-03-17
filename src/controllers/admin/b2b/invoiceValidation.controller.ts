import { Request, Response } from 'express'
import { extractText } from '../../../models/services/ocr.service'
import { presignDownload } from '../../../models/services/upload.service'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse')

/**
 * Parse invoice data from extracted OCR text
 */
function parseInvoiceData(text: string): {
  invoiceNumber?: string
  invoiceDate?: string
  billingName?: string
  sellerName?: string
  gstin?: string
  itemHSNs?: string[]
  totalValue?: number
} {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const flatText = text.toUpperCase().replace(/\s+/g, ' ')

  const extractedData: {
    invoiceNumber?: string
    invoiceDate?: string
    billingName?: string
    sellerName?: string
    gstin?: string
    itemHSNs?: string[]
    totalValue?: number
  } = {}

  // Extract Invoice Number (common patterns: INV-12345, INVOICE NO: 12345, etc.)
  const invoiceNumberPatterns = [
    /(?:INVOICE\s*(?:NO|NUMBER|#)?[:\s]*)([A-Z0-9\-/]+)/i,
    /(?:INV[\.\s]*NO[:\s]*)([A-Z0-9\-/]+)/i,
    /(?:BILL\s*NO[:\s]*)([A-Z0-9\-/]+)/i,
  ]
  for (const pattern of invoiceNumberPatterns) {
    const match = flatText.match(pattern)
    if (match && match[1]) {
      extractedData.invoiceNumber = match[1].trim()
      break
    }
  }

  // Extract Invoice Date (common patterns: DD/MM/YYYY, DD-MM-YYYY, etc.)
  const datePatterns = [
    /(?:DATE|DATED?)[:\s]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
    /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,
  ]
  for (const pattern of datePatterns) {
    const match = flatText.match(pattern)
    if (match && match[1]) {
      extractedData.invoiceDate = match[1].trim()
      break
    }
  }

  // Extract GSTIN (15 characters: 2 letters + 10 digits + 3 characters)
  const gstinMatch = flatText.match(
    /\b([0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}[Z]{1}[0-9A-Z]{1})\b/,
  )
  if (gstinMatch) {
    extractedData.gstin = gstinMatch[1]
  }

  // Extract Total Value (look for "TOTAL", "GRAND TOTAL", "AMOUNT", etc.)
  const totalPatterns = [
    /(?:TOTAL|GRAND\s*TOTAL|AMOUNT\s*(?:PAYABLE|DUE)?)[:\s]*[₹]?\s*([\d,]+\.?\d*)/i,
    /[₹]\s*([\d,]+\.?\d*)\s*(?:TOTAL|AMOUNT)/i,
  ]
  for (const pattern of totalPatterns) {
    const match = flatText.match(pattern)
    if (match && match[1]) {
      const valueStr = match[1].replace(/,/g, '')
      const value = parseFloat(valueStr)
      if (!isNaN(value) && value > 0) {
        extractedData.totalValue = value
        break
      }
    }
  }

  // Extract HSN codes (6-8 digit codes, often prefixed with "HSN" or "SAC")
  const hsnMatches = flatText.match(/\b(?:HSN|SAC)[:\s]*(\d{4,8})\b/gi)
  if (hsnMatches) {
    extractedData.itemHSNs = hsnMatches
      .map((match) => {
        const hsnMatch = match.match(/\d{4,8}/)
        return hsnMatch ? hsnMatch[0] : null
      })
      .filter((hsn): hsn is string => hsn !== null)
  }

  // Extract Billing Name (look for "BILL TO", "SHIP TO", "CUSTOMER", etc.)
  const billingNamePatterns = [/(?:BILL\s*TO|SHIP\s*TO|CUSTOMER|BUYER)[:\s]*([A-Z][A-Z\s]{2,30})/i]
  for (const pattern of billingNamePatterns) {
    const match = flatText.match(pattern)
    if (match && match[1]) {
      extractedData.billingName = match[1].trim()
      break
    }
  }

  // Extract Seller Name (look for "FROM", "SELLER", "SUPPLIER", company name at top)
  const sellerNamePatterns = [/(?:FROM|SELLER|SUPPLIER|VENDOR)[:\s]*([A-Z][A-Z\s]{2,30})/i]
  for (const pattern of sellerNamePatterns) {
    const match = flatText.match(pattern)
    if (match && match[1]) {
      extractedData.sellerName = match[1].trim()
      break
    }
  }

  // Fallback: First line might be seller name
  if (!extractedData.sellerName && lines.length > 0) {
    const firstLine = lines[0].toUpperCase()
    if (firstLine.length > 3 && firstLine.length < 50 && /^[A-Z\s]+$/.test(firstLine)) {
      extractedData.sellerName = lines[0].trim()
    }
  }

  return extractedData
}

/**
 * Validate invoice file content using OCR (soft validation - non-blocking)
 * This checks if invoice contains required fields and compares total with provided value
 */
export const validateInvoiceContentController = async (req: Request, res: Response) => {
  try {
    const { fileUrl, invoiceValue } = req.body

    if (!fileUrl) {
      return res.status(400).json({
        success: false,
        message: 'File URL is required',
      })
    }

    // Extract key from URL if it's a full URL, otherwise use as key
    let fileKey = fileUrl
    try {
      // If it's a full URL, extract the key (everything after bucket name)
      if (fileUrl.includes('http')) {
        const urlParts = fileUrl.split('/')
        const bucketIndex = urlParts.findIndex(
          (part: string) => part.includes('r2') || part.includes('s3'),
        )
        if (bucketIndex >= 0 && bucketIndex < urlParts.length - 1) {
          fileKey = urlParts.slice(bucketIndex + 1).join('/')
        } else {
          // Try to extract key from common URL patterns
          const keyMatch = fileUrl.match(/\/(invoices|uploads)\/(.+)$/)
          if (keyMatch) {
            fileKey = keyMatch[0].substring(1) // Remove leading slash
          }
        }
      }
    } catch (error) {
      console.warn('Could not extract key from URL, using as-is:', error)
    }

    // Download file from R2/S3
    let signedUrl: string
    try {
      const presignedResult = await presignDownload(fileKey)
      // presignDownload can return string, string[], or null, we need string
      if (Array.isArray(presignedResult) && presignedResult.length > 0) {
        signedUrl = presignedResult[0]
      } else if (typeof presignedResult === 'string') {
        signedUrl = presignedResult
      } else {
        // If presignDownload returns null, use fileUrl directly
        signedUrl = fileUrl
      }
    } catch (error) {
      // If presignDownload fails, try using fileUrl directly as signed URL
      signedUrl = fileUrl
    }

    const response = await fetch(signedUrl)
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.statusText}`)
    }

    const buffer = Buffer.from(await response.arrayBuffer())

    // Check file type
    const contentType = response.headers.get('content-type') || ''
    let extractedText = ''

    if (contentType.includes('pdf') || fileKey.toLowerCase().endsWith('.pdf')) {
      // Extract text from PDF using pdf-parse
      try {
        const pdfData = await (pdfParse.default || pdfParse)(buffer)
        extractedText = pdfData.text
          .toUpperCase()
          .split('\n')
          .map((line: string) =>
            line
              .normalize('NFKD')
              .replace(/[^\x00-\x7F]+/g, '') // Remove diacritics
              .replace(/\s{2,}/g, ' ')
              .trim(),
          )
          .filter(Boolean)
          .join('\n')
      } catch (error) {
        console.error('Error extracting text from PDF:', error)
        extractedText = ''
      }
    } else {
      // Extract text using OCR for images (JPG, PNG)
      extractedText = await extractText(buffer)
    }

    // Parse invoice data from extracted text
    const extractedData = parseInvoiceData(extractedText)

    // Validate extracted data and generate warnings
    const warnings: string[] = []

    if (!extractedData.invoiceNumber) {
      warnings.push('Invoice Number not found')
    }
    if (!extractedData.invoiceDate) {
      warnings.push('Invoice Date not found')
    }
    if (!extractedData.billingName) {
      warnings.push('Billing Name not found')
    }
    if (!extractedData.sellerName) {
      warnings.push('Seller Name not found')
    }
    if (!extractedData.gstin) {
      warnings.push('GSTIN not found')
    }
    if (!extractedData.itemHSNs || extractedData.itemHSNs.length === 0) {
      warnings.push('Item HSNs not found')
    }
    if (!extractedData.totalValue) {
      warnings.push('Total Value not found')
    }

    // Compare extracted total with provided invoiceValue
    if (extractedData.totalValue && invoiceValue) {
      const difference = Math.abs(extractedData.totalValue - invoiceValue)
      const threshold = invoiceValue * 0.05 // 5% threshold
      if (difference > threshold) {
        warnings.push(
          `Invoice total mismatch: Extracted ₹${extractedData.totalValue.toFixed(
            2,
          )} vs Provided ₹${invoiceValue.toFixed(2)}`,
        )
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        extractedData,
        warnings: warnings.length > 0 ? warnings : null,
        warningMessage:
          warnings.length > 0
            ? 'This invoice appears incomplete or missing key information. Please verify before proceeding.'
            : null,
      },
    })
  } catch (error: any) {
    console.error('Error validating invoice content:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to validate invoice content',
      error: error.message,
    })
  }
}

/**
 * Validate invoice file type, size, and dangerous extensions
 */
export const validateInvoiceFileController = async (req: Request, res: Response) => {
  try {
    const { fileName, fileSize } = req.body

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'File name is required',
      })
    }

    const fileNameLower = fileName.toLowerCase()
    const allowedExtensions = ['.pdf', '.jpg', '.jpeg', '.png']
    const dangerousExtensions = ['.exe', '.js', '.php', '.html', '.zip', '.rar', '.bat', '.sh']

    // Check for dangerous extensions
    const hasDangerousExtension = dangerousExtensions.some((ext) => fileNameLower.endsWith(ext))
    if (hasDangerousExtension) {
      return res.status(400).json({
        success: false,
        message:
          'Dangerous file types (.exe, .js, .php, .html, .zip, .rar, .bat, .sh) are not permitted.',
      })
    }

    // Check for allowed extensions
    const hasAllowedExtension = allowedExtensions.some((ext) => fileNameLower.endsWith(ext))
    if (!hasAllowedExtension) {
      return res.status(400).json({
        success: false,
        message: 'Only PDF, JPG, JPEG, and PNG files are allowed.',
      })
    }

    // Check file size (5 MB)
    const maxSizeBytes = 5 * 1024 * 1024 // 5 MB
    if (fileSize && fileSize > maxSizeBytes) {
      return res.status(400).json({
        success: false,
        message: 'File size exceeds 5 MB limit.',
      })
    }

    return res.status(200).json({
      success: true,
      message: 'File validation passed',
    })
  } catch (error: any) {
    console.error('Error validating invoice file:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to validate invoice file',
      error: error.message,
    })
  }
}
