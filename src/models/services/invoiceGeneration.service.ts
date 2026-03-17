import axios from 'axios'
import { randomUUID } from 'crypto'
import dayjs from 'dayjs'
import { and, between, eq, inArray, sql } from 'drizzle-orm'
import fileType from 'file-type'
import fs from 'fs'
import path from 'path'
import PdfPrinter from 'pdfmake'
import { sendInvoiceReadyEmail } from '../../utils/emailSender'
import { db } from '../client'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { billingInvoices } from '../schema/billingInvoices'
import { invoicePayments } from '../schema/invoicePayments'
import { userProfiles } from '../schema/userProfile'
import { users } from '../schema/users'
import {
  getAdminInvoicePreferences,
  getInvoicePreferences,
} from './invoicePreferences.service'
import { presignDownload, presignUpload } from './upload.service'

interface GenerateInvoiceParams {
  startDate: Date
  endDate: Date
}

const formatAmount = (value: number) => `Rs. ${Number(value || 0).toFixed(2)}`
const BILLABLE_ORDER_STATUSES = [
  'shipment_created',
  'booked',
  'pickup_initiated',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'ndr',
  'rto',
  'rto_in_transit',
  'rto_delivered',
] as const

export const generateInvoiceForUser = async (
  userId: string,
  { startDate, endDate }: GenerateInvoiceParams,
) => {
  console.log(
    `🧾 Generating invoice for ${userId} (${dayjs(startDate).format('DD MMM')} → ${dayjs(
      endDate,
    ).format('DD MMM')})`,
  )

  // 1️⃣ Fetch billable orders
  // Bill any shipment that has moved beyond pending/cancelled into an active or completed courier flow.
  const billableStatuses = [...BILLABLE_ORDER_STATUSES]

  const b2cOrders = await db
    .select()
    .from(b2c_orders)
    .where(
      and(
        eq(b2c_orders.user_id, userId),
        between(b2c_orders.created_at, startDate, endDate),
        inArray(b2c_orders.order_status, billableStatuses),
      ),
    )

  const b2bOrders = await db
    .select()
    .from(b2b_orders)
    .where(
      and(
        eq(b2b_orders.user_id, userId),
        between(b2b_orders.created_at, startDate, endDate),
        inArray(b2b_orders.order_status, billableStatuses),
      ),
    )

  const allOrders = [...b2cOrders, ...b2bOrders]
  if (allOrders.length === 0) {
    console.log(
      `⚠️ No billable orders for user ${userId} between ${dayjs(startDate).format(
        'YYYY-MM-DD HH:mm:ss',
      )} and ${dayjs(endDate).format('YYYY-MM-DD HH:mm:ss')} (statuses: ${billableStatuses.join(
        ', ',
      )})`,
    )
    return null
  }

  // 2️⃣ Totals
  let totalShipping = 0
  let totalOtherCharges = 0 // Other charges from serviceability API
  let totalTransaction = 0 // customer-facing, excluded from billing
  let totalCOD = 0
  let totalGiftWrap = 0 // customer-facing, excluded from billing
  let totalDiscount = 0 // customer-facing, excluded from billing

  // Extra: B2B overhead breakdown (from charges_breakdown)
  let b2bBaseFreightTotal = 0
  const b2bOverheadTotals: Record<string, { name: string; amount: number; shipments: number }> = {}

  for (const o of allOrders) {
    const anyOrder = o as any

    // Prefer courier-derived freight for B2C, fallback to shipping_charges (B2B)
    // Note: shipping_charges already includes other_charges, but we track other_charges separately for breakdown
    totalShipping += Number(anyOrder.freight_charges ?? anyOrder.shipping_charges) || 0
    totalOtherCharges += Number(anyOrder.other_charges) || 0
    totalTransaction += Number(anyOrder.transaction_fee) || 0
    totalCOD += Number(anyOrder.cod_charges) || 0
    totalGiftWrap += Number(anyOrder.gift_wrap) || 0
    totalDiscount += Number(anyOrder.discount) || 0

    // B2B charges breakdown (only if available on order)
    const cb = anyOrder.charges_breakdown as
      | {
          baseFreight?: number
          total?: number
          demurrage?: number
          overheads?: {
            id: string
            code?: string
            name: string
            type: string
            amount: number
            description?: string
          }[]
        }
      | undefined

    if (cb && typeof cb === 'object') {
      if (typeof cb.baseFreight === 'number') {
        b2bBaseFreightTotal += cb.baseFreight
      }
      if (Array.isArray(cb.overheads)) {
        for (const oh of cb.overheads) {
          if (!oh || typeof oh.amount !== 'number' || oh.amount === 0) continue
          const key = (oh.code || oh.id || oh.name).toString()
          if (!b2bOverheadTotals[key]) {
            b2bOverheadTotals[key] = {
              name: oh.name,
              amount: 0,
              shipments: 0,
            }
          }
          b2bOverheadTotals[key].amount += oh.amount
          b2bOverheadTotals[key].shipments += 1
        }
      }
    }
  }

  // Billing subtotal should reflect only costs we bill the seller for
  // Exclude customer-facing charges like transaction fee, gift wrap, discount
  const subtotal = totalShipping + totalCOD
  // GST calculation (default 18%) — compute fully after fetching seller profile
  const gstRate = 0

  // 3️⃣ Invoice info
  const invoiceId = randomUUID()

  // Load seller invoice preferences (prefix/suffix, logo, etc.)
  const prefs = await getInvoicePreferences(userId)

  const adminPrefs = await getAdminInvoicePreferences()
  const adminLogoFile = adminPrefs?.logoFile ?? null
  let adminSignatureBuffer: Buffer | undefined
  let adminIncludeSignature = adminPrefs?.includeSignature ?? false // Track if admin wants to include signature
  try {
    if (adminIncludeSignature && adminPrefs?.signatureFile) {
      console.log('📝 [Billing Invoice] Loading admin signature for billing invoice')
      const signatureUrl = await presignDownload(adminPrefs.signatureFile)
      if (signatureUrl) {
        const finalUrl = Array.isArray(signatureUrl) ? signatureUrl[0] : signatureUrl
        if (finalUrl) {
          const response = await axios.get(finalUrl, {
            responseType: 'arraybuffer',
            timeout: 20000, // 20 seconds
            maxContentLength: 5 * 1024 * 1024, // 5MB max
            maxBodyLength: 5 * 1024 * 1024,
          })
          const buffer = Buffer.from(response.data)
          if (buffer && buffer.length > 0) {
            adminSignatureBuffer = buffer
            console.log('✅ [Billing Invoice] Admin signature loaded successfully')
          } else {
            console.warn('⚠️ [Billing Invoice] Admin signature buffer is empty')
          }
        }
      }
    } else if (adminPrefs) {
      console.log('ℹ️ [Billing Invoice] Admin signature not configured in invoice preferences')
    } else {
      console.log('ℹ️ [Billing Invoice] No admin preferences found, skipping admin signature')
    }
  } catch (err: any) {
    console.warn(
      `⚠️ [Billing Invoice] Failed to load admin signature:`,
      err?.message || err,
      err?.code === 'ECONNABORTED' ? '(timeout)' : '',
    )
    // Continue without admin signature - will show text fallback
  }

  const rawInvoiceId = `${dayjs().format('YYMMDD')}${invoiceId.slice(0, 6).toUpperCase()}`
  const invoiceNo = `${prefs?.prefix ?? 'INV'}${rawInvoiceId}${prefs?.suffix ?? ''}`
  const invoiceDate = dayjs().format('DD MMM YYYY')
  const invoicePeriod = `${dayjs(startDate).format('DD MMM YYYY')} - ${dayjs(endDate).format(
    'DD MMM YYYY',
  )}`

  const tmpDir = path.join(process.cwd(), 'tmp', 'invoices')
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

  const pdfPath = path.join(tmpDir, `${invoiceNo}.pdf`)
  const csvPath = path.join(tmpDir, `${invoiceNo}.csv`)

  // 4️⃣ Generate CSV
  const csvHeader = 'Order ID,Order Type,AWB,Freight Charges,COD Charges,Order Date\n'
  const csvBody = allOrders
    .map((o) => {
      // Use order_type (prepaid/cod) instead of integration_type
      const orderType = (o as any).order_type || 'prepaid'
      const orderTypeDisplay = orderType.toLowerCase() === 'cod' ? 'COD' : 'Prepaid'
      const billedDate = (o as any).updated_at || (o as any).created_at
      return `${o.order_id || o.order_number},${orderTypeDisplay},${o.awb_number || '-'},${
        (o as any).freight_charges ?? (o as any).shipping_charges ?? 0
      },${(o as any).cod_charges ?? 0},${dayjs(billedDate).format('YYYY-MM-DD')}`
    })
    .join('\n')

  fs.writeFileSync(csvPath, csvHeader + csvBody, 'utf-8')

  // 5️⃣ Get seller info
  const [sellerRow] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)

  const issuerName = adminPrefs?.brandName || 'DelExpress'
  const issuerAddress = adminPrefs?.sellerAddress || 'N/A'
  const issuerStateCode = adminPrefs?.stateCode || 'N/A'
  const issuerGST = adminPrefs?.gstNumber || 'N/A'
  const billTo = sellerRow?.companyInfo?.businessName || 'N/A'
  const billAddress = sellerRow?.companyInfo?.companyAddress || 'N/A'
  const billCity = sellerRow?.companyInfo?.city || 'N/A'
  const billState = sellerRow?.companyInfo?.state || 'N/A'
  const billGST = sellerRow?.gstDetails?.gstNumber || 'N/A'

  // Helper function to convert buffer to data URL with proper MIME type detection
  const bufferToDataUrl = async (buffer: Buffer): Promise<string | null> => {
    try {
      // Validate buffer is not empty
      if (!buffer || buffer.length === 0) {
        console.warn('⚠️ Empty buffer provided to bufferToDataUrl')
        return null
      }

      // Validate buffer has minimum size for an image (at least 4 bytes for signature)
      if (buffer.length < 4) {
        console.warn('⚠️ Buffer too small to be a valid image')
        return null
      }

      const type = await fileType.fromBuffer(buffer)
      if (!type) {
        // Try to validate buffer manually by checking for image signatures
        const isValidImage =
          // PNG: 89 50 4E 47
          (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) ||
          // JPEG: FF D8 FF
          (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) ||
          // GIF: 47 49 46 38
          (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) ||
          // WebP: RIFF...WEBP
          (buffer.length >= 12 &&
            buffer[0] === 0x52 &&
            buffer[1] === 0x49 &&
            buffer[2] === 0x46 &&
            buffer[3] === 0x46 &&
            buffer[8] === 0x57 &&
            buffer[9] === 0x45 &&
            buffer[10] === 0x42 &&
            buffer[11] === 0x50)

        if (!isValidImage) {
          console.warn(
            '⚠️ Could not detect image type and buffer does not appear to be a valid image format',
          )
          return null
        }

        console.warn(
          '⚠️ Could not detect image type via file-type, but buffer appears valid, defaulting to PNG',
        )
        const base64 = buffer.toString('base64')
        if (!base64 || base64.length === 0) {
          console.warn('⚠️ Failed to encode buffer to base64')
          return null
        }
        return `data:image/png;base64,${base64}`
      }
      // Only allow image types
      if (!type.mime.startsWith('image/')) {
        console.warn(`⚠️ Invalid image type: ${type.mime}, skipping`)
        return null
      }
      const base64 = buffer.toString('base64')
      if (!base64 || base64.length === 0) {
        console.warn('⚠️ Failed to encode buffer to base64')
        return null
      }
      return `data:${type.mime};base64,${base64}`
    } catch (err) {
      console.warn('⚠️ Error converting buffer to data URL:', err)
      return null
    }
  }

  // Optional seller logo from invoice preferences
  let logoDataUrl: string | undefined
  try {
    if (prefs?.includeLogo && prefs?.logoFile) {
      const logoUrl = await presignDownload(prefs.logoFile)
      const finalUrl = Array.isArray(logoUrl) ? logoUrl[0] : logoUrl
      if (finalUrl) {
        const logoResponse = await axios.get(finalUrl, { responseType: 'arraybuffer' })
        const logoBuffer = Buffer.from(logoResponse.data)
        const dataUrl = await bufferToDataUrl(logoBuffer)
        if (dataUrl) {
          logoDataUrl = dataUrl
        }
      }
    }
  } catch (err) {
    console.error('Failed to load invoice logo for summary invoice:', err)
  }

  // Convert admin signature buffer to data URL
  let adminSignatureDataUrl: string | undefined
  if (adminSignatureBuffer) {
    try {
      const dataUrl = await bufferToDataUrl(adminSignatureBuffer)
      if (dataUrl) {
        adminSignatureDataUrl = dataUrl
        console.log('✅ [Billing Invoice] Admin signature converted to data URL')
      }
    } catch (err) {
      console.warn(
        '⚠️ [Billing Invoice] Failed to convert admin signature buffer to data URL:',
        err,
      )
    }
  }

  // Platform (DelExpress) logo for footer branding
  let platformLogoDataUrl: string | undefined
  try {
    const platformLogoKey = adminLogoFile || 'logo-white.png'
    const logoUrl = await presignDownload(platformLogoKey)
    if (logoUrl && typeof logoUrl === 'string') {
      const resp = await axios.get(logoUrl, { responseType: 'arraybuffer' })
      const buffer = Buffer.from(resp.data)
      const dataUrl = await bufferToDataUrl(buffer)
      if (dataUrl) {
        platformLogoDataUrl = dataUrl
      }
    }
  } catch (err) {
    console.warn('⚠️ Failed to fetch platform logo for summary invoice from R2:', err)
  }

  // GST disabled: no taxes applied
  const taxTotal = 0
  const cgst = 0
  const sgst = 0
  const igst = 0
  const totalAmount = subtotal

  // 6️⃣ PDF
  // Get template preference (default to classic for billing invoices)
  const template = (prefs?.template as 'classic' | 'thermal') ?? 'classic'
  const isThermal = template === 'thermal'

  const printer = new PdfPrinter({
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  })
  const accentColor = '#000000'
  const fontSize = isThermal ? 7 : 10
  const headerFontSize = isThermal ? 10 : 16

  // Prepare images object for pdfmake
  const images: Record<string, string> = {}

  // Add logo to images object
  if (logoDataUrl && typeof logoDataUrl === 'string' && logoDataUrl.startsWith('data:image/')) {
    try {
      const base64Match = logoDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
      if (base64Match && base64Match[1] && base64Match[1].length > 0) {
        // Validate base64 data is not empty
        const base64Data = base64Match[1].trim()
        if (base64Data.length > 0) {
          images.logo = logoDataUrl
          console.log('✅ [Billing Invoice] Logo added to PDF images object')
        } else {
          console.warn('⚠️ [Billing Invoice] Logo data URL has empty base64 data')
        }
      } else {
        console.warn('⚠️ [Billing Invoice] Logo data URL missing base64 data')
      }
    } catch (err) {
      console.warn('⚠️ [Billing Invoice] Error validating logo data URL:', err)
    }
  } else if (logoDataUrl) {
    console.warn(
      '⚠️ [Billing Invoice] Logo data URL is not in valid format:',
      typeof logoDataUrl,
      logoDataUrl?.substring(0, 50),
    )
  }

  // Add admin signature to images object
  if (
    adminSignatureDataUrl &&
    typeof adminSignatureDataUrl === 'string' &&
    adminSignatureDataUrl.startsWith('data:image/')
  ) {
    try {
      const base64Match = adminSignatureDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
      if (base64Match && base64Match[1] && base64Match[1].length > 0) {
        // Validate base64 data is not empty
        const base64Data = base64Match[1].trim()
        if (base64Data.length > 0) {
          images.signature = adminSignatureDataUrl
          console.log('✅ [Billing Invoice] Admin signature added to PDF images object')
        } else {
          console.warn('⚠️ [Billing Invoice] Admin signature data URL has empty base64 data')
        }
      } else {
        console.warn('⚠️ [Billing Invoice] Admin signature data URL missing base64 data')
      }
    } catch (err) {
      console.warn('⚠️ [Billing Invoice] Error validating admin signature data URL:', err)
    }
  } else if (adminIncludeSignature && !adminSignatureDataUrl) {
    console.log(
      'ℹ️ [Billing Invoice] Admin signature preference is enabled but signature file not available',
    )
  } else if (adminSignatureDataUrl) {
    console.warn(
      '⚠️ [Billing Invoice] Admin signature data URL is not in valid format:',
      typeof adminSignatureDataUrl,
      adminSignatureDataUrl?.substring(0, 50),
    )
  }

  // Add platform logo to images object
  if (
    platformLogoDataUrl &&
    typeof platformLogoDataUrl === 'string' &&
    platformLogoDataUrl.startsWith('data:image/')
  ) {
    try {
      const base64Match = platformLogoDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
      if (base64Match && base64Match[1] && base64Match[1].length > 0) {
        // Validate base64 data is not empty
        const base64Data = base64Match[1].trim()
        if (base64Data.length > 0) {
          images.platformLogo = platformLogoDataUrl
          console.log('✅ [Billing Invoice] Platform logo added to PDF images object')
        } else {
          console.warn('⚠️ [Billing Invoice] Platform logo data URL has empty base64 data')
        }
      } else {
        console.warn('⚠️ [Billing Invoice] Platform logo data URL missing base64 data')
      }
    } catch (err) {
      console.warn('⚠️ [Billing Invoice] Error validating platform logo data URL:', err)
    }
  } else if (platformLogoDataUrl) {
    console.warn(
      '⚠️ [Billing Invoice] Platform logo data URL is not in valid format:',
      typeof platformLogoDataUrl,
      platformLogoDataUrl?.substring(0, 50),
    )
  }

  const docDefinition: any = {
    pageSize: isThermal ? { width: 220, height: 'auto' } : 'A4',
    pageMargins: isThermal ? [5, 5, 5, 5] : [40, 40, 40, 80],
    defaultStyle: { font: 'Helvetica', fontSize },
    ...(Object.keys(images).length > 0 && { images }),
    content: isThermal
      ? [
          // THERMAL LAYOUT - Simplified compact version
          { text: issuerName, alignment: 'center', bold: true, fontSize: headerFontSize },
          { text: 'TAX INVOICE', alignment: 'center', bold: true, fontSize: headerFontSize },
          {
            text: 'ORIGINAL FOR RECIPIENT',
            alignment: 'center',
            fontSize: fontSize - 1,
            color: '#6b7280',
            margin: [0, 0, 0, 2],
          },
          { text: `Invoice #: ${invoiceNo}`, alignment: 'center', fontSize },
          { text: `Date: ${invoiceDate}`, alignment: 'center', fontSize },
          { text: `Period: ${invoicePeriod}`, alignment: 'center', fontSize, margin: [0, 0, 0, 5] },

          { text: `Bill To: ${billTo}`, fontSize, margin: [0, 0, 0, 2] },
          { text: `${billAddress}`, fontSize },
          { text: `${billCity}, ${billState}`, fontSize },
          { text: `GSTIN: ${billGST}`, fontSize, margin: [0, 0, 0, 5] },

          {
            table: {
              headerRows: 1,
              widths: ['*', 'auto', 'auto'],
              body: [
                [
                  { text: 'Particulars', style: 'tableHeader', fontSize },
                  { text: 'Count', style: 'tableHeader', fontSize, alignment: 'center' },
                  { text: 'Amount', style: 'tableHeader', fontSize, alignment: 'right' },
                ],
                ...(totalShipping > 0
                  ? [
                      [
                        { text: 'Shipping Charges', fontSize },
                        { text: allOrders.length.toString(), fontSize, alignment: 'center' },
                        { text: formatAmount(totalShipping), fontSize, alignment: 'right' },
                      ],
                    ]
                  : []),
                ...(totalCOD > 0
                  ? [
                      [
                        { text: 'COD Charges', fontSize },
                        { text: allOrders.length.toString(), fontSize, alignment: 'center' },
                        { text: formatAmount(totalCOD), fontSize, alignment: 'right' },
                      ],
                    ]
                  : []),
              ],
            },
            layout: 'lightHorizontalLines',
            margin: [0, 0, 0, 5],
          },

          {
            table: {
              widths: ['*', 'auto'],
              body: [
                [
                  { text: 'Taxable Value', fontSize },
                  { text: formatAmount(subtotal), fontSize, alignment: 'right', bold: true },
                ],
                [
                  { text: 'Grand Total', fontSize, bold: true },
                  { text: formatAmount(totalAmount), fontSize, alignment: 'right', bold: true },
                ],
              ],
            },
            layout: 'noBorders',
            margin: [0, 0, 0, 5],
          },

          {
            text: 'Terms: All payments as per agreed credit terms. E. & O.E.',
            fontSize: fontSize - 1,
            margin: [0, 5, 0, 5],
          },

          adminIncludeSignature && images.signature
            ? { image: 'signature', width: 60, alignment: 'right', margin: [0, 5, 0, 0] }
            : adminIncludeSignature
            ? {
                text: 'Authorised Signatory',
                alignment: 'right',
                italics: true,
                fontSize,
                margin: [0, 5, 0, 0],
              }
            : null,

          {
            text: 'Powered by DelExpress',
            alignment: 'center',
            italics: true,
            fontSize: fontSize - 1,
            margin: [0, 5, 0, 0],
          },
        ].filter(Boolean)
      : [
          // CLASSIC LAYOUT - Existing A4 layout
          // HEADER SECTION styled similar to retail invoice sample
          {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    stack: [
                      {
                        text: 'Tax Invoice',
                        alignment: 'center',
                        bold: true,
                        fontSize: headerFontSize,
                        margin: [0, 4, 0, 2],
                      },
                      {
                        text: 'ORIGINAL FOR RECIPIENT',
                        alignment: 'center',
                        fontSize: fontSize - 1,
                        color: '#6b7280',
                        margin: [0, 0, 0, 4],
                      },
                    ],
                  },
                ],
              ],
            },
            layout: {
              hLineColor: () => '#000000',
              vLineColor: () => '#000000',
            },
            margin: [0, 0, 0, 8],
          },
          {
            table: {
              widths: ['*', '*', 'auto'],
              body: [
                [
                  images.logo
                    ? { image: 'logo', width: 120, rowSpan: 2, margin: [0, 4, 0, 4] }
                    : {
                        text: issuerName,
                        style: 'brandName',
                        rowSpan: 2,
                        margin: [0, 4, 0, 4],
                      },
                  {
                    stack: [
                      { text: issuerName, bold: true },
                      { text: issuerAddress, style: 'brandSubtext' },
                      { text: `State Code: ${issuerStateCode}`, style: 'brandSubtext' },
                      { text: `GSTIN: ${issuerGST}`, style: 'brandSubtext' },
                    ],
                    margin: [4, 4, 0, 4],
                  },
                  {
                    stack: [{ text: 'Invoice No', bold: true }, { text: invoiceNo }],
                    margin: [4, 4, 4, 4],
                  },
                ],
                [
                  '',
                  { text: '', margin: [4, 0, 0, 4] },
                  {
                    stack: [
                      { text: 'Invoice Date', bold: true },
                      { text: invoiceDate },
                      { text: `Invoice Period: ${invoicePeriod}`, style: 'invoiceMeta' },
                    ],
                    margin: [4, 0, 4, 4],
                  },
                ],
              ],
            },
            layout: {
              hLineColor: () => '#000000',
              vLineColor: () => '#000000',
            },
            margin: [0, 0, 0, 16],
          },

          // BILL TO SECTION in bordered box
          {
            table: {
              widths: ['*'],
              body: [
                [
                  {
                    stack: [
                      { text: 'Bill To', style: 'sectionTitle' },
                      { text: billTo, bold: true, margin: [0, 2, 0, 2] },
                      {
                        text: `${billAddress}\n${billCity}, ${billState}, India`,
                        style: 'address',
                      },
                      { text: `GSTIN: ${billGST}`, style: 'addressSub' },
                    ],
                  },
                ],
              ],
            },
            layout: {
              hLineColor: () => '#000000',
              vLineColor: () => '#000000',
              paddingTop: () => 6,
              paddingBottom: () => 6,
              paddingLeft: () => 8,
              paddingRight: () => 8,
            },
            margin: [0, 0, 0, 16],
          },

          // SERVICES TABLE (billing breakdown - combined B2C/B2B summary)
          {
            table: {
              headerRows: 1,
              widths: [30, '*', 80, 100],
              body: [
                [
                  { text: '#', style: 'tableHeader' },
                  { text: 'Particulars', style: 'tableHeader' },
                  { text: 'Shipments Count', style: 'tableHeader' },
                  { text: 'Amount (Rs.)', style: 'tableHeaderRight' },
                ],
                ...(totalShipping > 0
                  ? [
                      [
                        { text: '1', style: 'tableCell' },
                        { text: 'Shipping Charges', style: 'tableCell' },
                        { text: allOrders.length.toString(), style: 'tableCellCenter' },
                        { text: formatAmount(totalShipping), style: 'tableCellRight' },
                      ],
                    ]
                  : []),
                ...(totalCOD > 0
                  ? [
                      [
                        {
                          text: String((totalShipping > 0 ? 1 : 0) + 1),
                          style: 'tableCell',
                        },
                        { text: 'COD Charges', style: 'tableCell' },
                        { text: allOrders.length.toString(), style: 'tableCellCenter' },
                        { text: formatAmount(totalCOD), style: 'tableCellRight' },
                      ],
                    ]
                  : []),
              ],
            },
            layout: {
              fillColor: (rowIndex: number) => (rowIndex === 0 ? '#f3f4f6' : null),
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => '#e5e7eb',
              vLineColor: () => '#e5e7eb',
              paddingTop: () => 5,
              paddingBottom: () => 5,
            },
            margin: [0, 0, 0, 30],
          },

          // OPTIONAL: B2B CHARGES BREAKDOWN (from admin-configured overheads)
          ...(Object.keys(b2bOverheadTotals).length || b2bBaseFreightTotal
            ? [
                {
                  text: 'B2B Charges Breakdown',
                  style: 'sectionTitle',
                  margin: [0, 0, 0, 6],
                },
                {
                  table: {
                    headerRows: 1,
                    widths: ['*', 80, 100],
                    body: [
                      [
                        { text: 'Particular', style: 'tableHeader' },
                        { text: 'Shipments', style: 'tableHeader' },
                        { text: 'Amount (Rs.)', style: 'tableHeaderRight' },
                      ],
                      ...(b2bBaseFreightTotal > 0
                        ? [
                            [
                              { text: 'Base Freight (B2B)', style: 'tableCell' },
                              {
                                text: '-', // not counting shipments here separately
                                style: 'tableCellCenter',
                              },
                              {
                                text: formatAmount(b2bBaseFreightTotal),
                                style: 'tableCellRight',
                              },
                            ],
                          ]
                        : []),
                      ...Object.values(b2bOverheadTotals).map((item) => [
                        { text: item.name, style: 'tableCell' },
                        { text: String(item.shipments), style: 'tableCellCenter' },
                        {
                          text: formatAmount(item.amount),
                          style: 'tableCellRight',
                        },
                      ]),
                    ],
                  },
                  layout: {
                    fillColor: (rowIndex: number) => (rowIndex === 0 ? '#f3f4f6' : null),
                    hLineWidth: () => 0.5,
                    vLineWidth: () => 0.5,
                    hLineColor: () => '#e5e7eb',
                    vLineColor: () => '#e5e7eb',
                    paddingTop: () => 5,
                    paddingBottom: () => 5,
                  },
                  margin: [0, 0, 0, 30],
                },
              ]
            : []),

          // TOTALS BOX
          {
            table: {
              widths: ['*', 150],
              body: [
                [
                  { text: 'Taxable Value', style: 'totalLabel' },
                  { text: formatAmount(subtotal), style: 'totalValue' },
                ],
                ...(cgst > 0
                  ? [
                      [
                        { text: 'CGST (9%)', style: 'totalLabel' },
                        { text: formatAmount(cgst), style: 'totalValue' },
                      ],
                      [
                        { text: 'SGST (9%)', style: 'totalLabel' },
                        { text: formatAmount(sgst), style: 'totalValue' },
                      ],
                    ]
                  : igst > 0
                  ? [
                      [
                        { text: 'IGST (18%)', style: 'totalLabel' },
                        { text: formatAmount(igst), style: 'totalValue' },
                      ],
                    ]
                  : []),
                [
                  { text: 'Grand Total', style: 'totalLabelBold' },
                  { text: formatAmount(totalAmount), style: 'totalValueBold' },
                ],
              ],
            },
            layout: {
              defaultBorder: false,
              paddingTop: () => 4,
              paddingBottom: () => 4,
            },
            margin: [0, 0, 0, 20],
          },

          // TERMS SECTION
          {
            text: `Terms & Conditions:\n\nAll payments to be made to ${issuerName} as per agreed credit terms.\nFor any queries, please contact your account manager.\nAny dispute is subject to New Delhi jurisdiction.\nE. & O.E.\nThis is a computer generated invoice and does not require a physical signature.`,
            style: 'terms',
            margin: [0, 10, 0, 20],
          },

          // FOOTER
          {
            text: 'Thank you for trusting and doing business with DelExpress.',
            style: 'footer',
          },
          // Show admin signature only if includeSignature is true
          adminIncludeSignature
            ? images.signature
              ? {
                  image: 'signature',
                  width: 80,
                  alignment: 'right',
                  margin: [0, 20, 0, 5],
                }
              : {
                  text: 'Authorised Signatory',
                  alignment: 'right',
                  italics: true,
                  margin: [0, 20, 0, 0],
                }
            : null,
          images.platformLogo
            ? {
                image: 'platformLogo',
                width: 60,
                alignment: 'center',
                margin: [0, 20, 0, 4],
              }
            : null,
          {
            text: 'Powered by DelExpress',
            alignment: 'center',
            italics: true,
            margin: [0, 6, 0, 0],
            fontSize: fontSize - 1,
            color: '#6b7280',
          },
        ],

    styles: {
      // Branding
      brandName: { fontSize: 20, bold: true, color: '#111827' },
      brandSubtext: { fontSize: 9, color: '#4b5563' },

      // Header Box
      headerBox: {
        fontSize: 16,
        bold: true,
        color: '#fff',
        alignment: 'center',
        fillColor: '#111827',
        margin: [0, 4, 0, 6],
      },
      invoiceMeta: { fontSize: 9, color: '#374151', margin: [0, 1, 0, 0] },

      // Section titles
      sectionTitle: { fontSize: 11, bold: true, color: '#111827', margin: [0, 0, 0, 4] },
      address: { fontSize: 9, color: '#374151' },
      addressSub: { fontSize: 9, color: '#6b7280' },

      // Table styles
      tableHeader: { bold: true, fillColor: '#f3f4f6', color: '#111827', fontSize: 10 },
      tableHeaderRight: {
        bold: true,
        fillColor: '#f3f4f6',
        alignment: 'right',
        color: '#111827',
        fontSize: 10,
      },
      tableCell: { fontSize: 9, color: '#111827' },
      tableCellCenter: { fontSize: 9, alignment: 'center', color: '#111827' },
      tableCellRight: { fontSize: 9, alignment: 'right', color: '#111827' },

      // Totals
      totalLabel: { fontSize: 10, alignment: 'right', color: '#374151' },
      totalValue: { fontSize: 10, alignment: 'right', bold: true },
      totalLabelBold: { fontSize: 11, alignment: 'right', bold: true, color: '#111827' },
      totalValueBold: { fontSize: 11, alignment: 'right', bold: true, color: '#111827' },

      // Terms & footer
      terms: { fontSize: 9, color: '#6b7280' },
      footer: { fontSize: 10, bold: true, color: '#111827', alignment: 'center' },
    },
  }

  await new Promise<void>((resolve, reject) => {
    const pdfDoc = printer.createPdfKitDocument(docDefinition)
    const stream = fs.createWriteStream(pdfPath)
    pdfDoc.pipe(stream)
    pdfDoc.end()
    stream.on('finish', () => resolve())
    stream.on('error', (err) => reject(err))
  })

  // Upload to R2
  const pdfUpload = await presignUpload({
    filename: `${invoiceNo}.pdf`,
    contentType: 'application/pdf',
    userId,
    folderKey: 'invoices',
  })
  const csvUpload = await presignUpload({
    filename: `${invoiceNo}.csv`,
    contentType: 'text/csv',
    userId,
    folderKey: 'invoices',
  })

  const pdfBuffer = fs.readFileSync(pdfPath)
  const csvBuffer = fs.readFileSync(csvPath)

  await Promise.all([
    fetch(pdfUpload.uploadUrl, { method: 'PUT', body: pdfBuffer }),
    fetch(csvUpload.uploadUrl, { method: 'PUT', body: csvBuffer }),
  ])

  // Extract order numbers from all orders
  const orderNumbers = allOrders.map((o) => o.order_number || o.order_id || '').filter(Boolean)

  // Extract keys (presignUpload returns key as string, but handle array case just in case)
  const pdfKey = Array.isArray(pdfUpload.key) ? pdfUpload.key[0] : pdfUpload.key
  const csvKey = Array.isArray(csvUpload.key) ? csvUpload.key[0] : csvUpload.key

  // Save invoice (taxes already computed above)
  const [invoice] = await db
    .insert(billingInvoices)
    .values({
      invoiceNo,
      sellerId: userId,
      billingStart: startDate,
      billingEnd: endDate,
      taxableValue: subtotal,
      cgst,
      sgst,
      igst,
      totalAmount,
      gstRate,
      type: 'monthly_summary',
      status: 'pending',
      pdfUrl: pdfKey, // Store key only, not full URL
      csvUrl: csvKey, // Store key only, not full URL
      orderNumbers: orderNumbers.length > 0 ? orderNumbers : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any)
    .returning()

  // Presign URLs for email (don't fail invoice generation if presigning fails)
  let pdfSignedUrl: string | undefined = undefined
  let csvSignedUrl: string | undefined = undefined
  try {
    const signedUrls = await presignDownload([pdfKey, csvKey])
    pdfSignedUrl = Array.isArray(signedUrls) && signedUrls.length > 0 ? signedUrls[0] : undefined
    csvSignedUrl = Array.isArray(signedUrls) && signedUrls.length > 1 ? signedUrls[1] : undefined
  } catch (presignErr: any) {
    console.error(
      `Failed to presign URLs for invoice ${invoiceNo} (email will be sent without download links):`,
      presignErr?.message || presignErr,
    )
    // Don't fail invoice generation if presigning fails - email just won't have download links
  }

  // Auto-record wallet payment equal to invoice total (since orders were paid via wallet)
  try {
    await db.insert(invoicePayments).values({
      invoiceId: invoice.id,
      sellerId: userId,
      method: 'wallet' as any,
      amount: totalAmount,
      reference: 'auto_wallet_settle_on_invoice_generation',
      notes: `Auto-settled from wallet on invoice generation (${invoiceNo})`,
    } as any)

    await db
      .update(billingInvoices)
      .set({ status: 'paid', updatedAt: new Date() })
      .where(eq(billingInvoices.id, invoice.id))
  } catch (err) {
    console.error('Failed to auto-record wallet payment:', err)
  }

  // Send email (don't fail invoice generation if email fails)
  const sellerEmail = sellerRow?.companyInfo?.contactEmail
  if (sellerEmail) {
    try {
      await sendInvoiceReadyEmail({
        to: sellerEmail,
        sellerName: billTo,
        invoiceNo,
        periodStart: dayjs(startDate).format('DD MMM YYYY'),
        periodEnd: dayjs(endDate).format('DD MMM YYYY'),
        totalAmount,
        pdfUrl: pdfSignedUrl,
        csvUrl: csvSignedUrl,
        attachFiles: false,
        preferSignedUrls: true,
      })
      console.log(`📧 Invoice email sent to ${sellerEmail} for invoice ${invoiceNo}`)
    } catch (emailErr: any) {
      console.error(`Failed to send invoice email for ${invoiceNo}:`, emailErr?.message || emailErr)
      // Don't fail invoice generation if email fails
    }
  }

  console.log(
    `✅ Invoice generated: ${invoiceNo} → ${formatAmount(totalAmount)} (${allOrders.length} orders)`,
  )

  // Auto-mark as paid if outstanding is already 0 (e.g., already paid via wallet at order time)
  try {
    const { getInvoiceStatement } = await import('./invoiceStatement.service')
    const statement = await getInvoiceStatement(invoice.id, undefined)
    if (statement.outstanding <= 0 && invoice.status !== 'paid') {
      await db
        .update(billingInvoices)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(billingInvoices.id, invoice.id))
      console.log(`✅ Auto-marked invoice ${invoiceNo} as paid (outstanding = 0)`)
      invoice.status = 'paid'
    }
  } catch (err) {
    console.error('Failed to check outstanding for auto-paid:', err)
    // Don't fail invoice generation if auto-paid check fails
  }

  return invoice
}

// Regenerate invoice PDF/CSV with adjustments included
export const regenerateInvoiceWithAdjustments = async (invoiceId: string) => {
  console.log(`🔄 Regenerating invoice ${invoiceId} with adjustments`)

  // Fetch existing invoice
  const [inv] = await db
    .select()
    .from(billingInvoices)
    .where(eq(billingInvoices.id, invoiceId))
    .limit(1)

  if (!inv) throw new Error('Invoice not found')

  // Get invoice statement to include adjustments
  const { getInvoiceStatement } = await import('./invoiceStatement.service')
  const stmt = await getInvoiceStatement(invoiceId)

  // Fetch orders using stored order numbers or date range
  const orderNumbers = (inv.orderNumbers as string[]) || []
  let allOrders: any[] = []

  if (orderNumbers.length > 0) {
    const [b2c, b2b] = await Promise.all([
      db
        .select()
        .from(b2c_orders)
        .where(
          and(eq(b2c_orders.user_id, inv.sellerId), inArray(b2c_orders.order_number, orderNumbers)),
        ),
      db
        .select()
        .from(b2b_orders)
        .where(
          and(eq(b2b_orders.user_id, inv.sellerId), inArray(b2b_orders.order_number, orderNumbers)),
        ),
    ])
    allOrders = [...(b2c || []), ...(b2b || [])]
  } else {
    // Fallback to date range
    const startDate = new Date(inv.billingStart as any)
    const endDate = new Date(inv.billingEnd as any)
    const billableStatuses = [...BILLABLE_ORDER_STATUSES]
    const [b2c, b2b] = await Promise.all([
      db
        .select()
        .from(b2c_orders)
        .where(
          and(
            eq(b2c_orders.user_id, inv.sellerId),
            between(b2c_orders.created_at, startDate as any, endDate as any),
            inArray(b2c_orders.order_status, billableStatuses),
          ),
        ),
      db
        .select()
        .from(b2b_orders)
        .where(
          and(
            eq(b2b_orders.user_id, inv.sellerId),
            between(b2b_orders.created_at, startDate as any, endDate as any),
            inArray(b2b_orders.order_status, billableStatuses),
          ),
        ),
    ])
    allOrders = [...(b2c || []), ...(b2b || [])]
  }

  if (allOrders.length === 0) {
    throw new Error('No orders found for invoice')
  }

  // Reuse existing PDF generation logic but with adjusted totals
  const adjustedTotal = stmt.totals.netPayable + stmt.additions.adjustments

  // Generate new PDF with adjusted amounts
  // (Reuse the PDF generation logic from generateInvoiceForUser)
  // For now, we'll update the existing invoice URLs - full PDF regeneration can be done later

  // NOTE: We do NOT update totalAmount here because it should remain as the original base amount.
  // The statement calculation always adds adjustments dynamically: baseAmount + adjustmentsTotal - payments - codOffsets
  // This prevents double-counting adjustments in the outstanding calculation.

  // Update only the updatedAt timestamp
  await db
    .update(billingInvoices)
    .set({
      updatedAt: new Date(),
    })
    .where(eq(billingInvoices.id, invoiceId))

  console.log(
    `✅ Invoice ${inv.invoiceNo} regenerated (adjusted total: ${formatAmount(
      adjustedTotal,
    )}, base: ${formatAmount(stmt.totals.netPayable)})`,
  )

  // Send email notification to user
  try {
    const [user] = await db.select().from(users).where(eq(users.id, inv.sellerId)).limit(1)
    if (user?.email) {
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, inv.sellerId))
        .limit(1)
      const sellerName = profile?.companyInfo?.businessName || user.email.split('@')[0]

      const periodStart = dayjs(inv.billingStart as any).format('DD MMM YYYY')
      const periodEnd = dayjs(inv.billingEnd as any).format('DD MMM YYYY')

      // Get presigned URLs for PDF and CSV
      const signedUrls = await presignDownload([inv.pdfUrl, inv.csvUrl])
      const pdfSignedUrl =
        Array.isArray(signedUrls) && signedUrls.length > 0 ? signedUrls[0] : undefined
      const csvSignedUrl =
        Array.isArray(signedUrls) && signedUrls.length > 1 ? signedUrls[1] : undefined

      await sendInvoiceReadyEmail({
        to: user.email,
        sellerName,
        invoiceNo: inv.invoiceNo,
        periodStart,
        periodEnd,
        totalAmount: adjustedTotal,
        pdfUrl: pdfSignedUrl || undefined,
        csvUrl: csvSignedUrl || undefined,
        preferSignedUrls: true,
      })
      console.log(`📧 Email notification sent to ${user.email} for invoice ${inv.invoiceNo}`)
    }
  } catch (emailErr: any) {
    console.error(`Failed to send email notification for invoice ${inv.invoiceNo}:`, emailErr)
    // Don't fail regeneration if email fails
  }

  return { ...inv, totalAmount: adjustedTotal }
}
