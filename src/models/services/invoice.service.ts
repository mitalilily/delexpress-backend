import axios from 'axios'
import { and, desc, eq, gte, ilike, lte, sql } from 'drizzle-orm'
import fileType from 'file-type'
import PdfPrinter from 'pdfmake'
import type { TableCell } from 'pdfmake/interfaces'
import { db } from '../client'
import { invoices } from '../schema/invoices'
import { presignDownload } from './upload.service'
import { getAdminInvoicePreferences } from './invoicePreferences.service'
// Product + Invoice types
// ----------------------
export interface Product {
  name: string
  sku: string
  qty: number
  price: number
  hsn: string
  discount: number
  box_name?: string
  tax_rate: number
}

interface InvoiceData {
  invoiceNumber: string
  invoicePrefix?: string
  invoiceSuffix?: string
  invoiceDate: string
  buyerName: string
  orderAmt?: number
  buyerPhone: string
  buyerEmail: string
  supportEmail?: string
  buyerAddress: string
  buyerCity: string
  buyerState: string
  buyerPincode: string
  products: Product[]
  invoiceAmount?: number
  shippingCharges: number
  giftWrap?: number
  transactionFee?: number
  discount?: number
  orderType: 'prepaid' | 'cod'
  courierCod?: number
  prepaidAmount?: number
  courierName: string
  courierId: string
  logoBuffer?: Buffer
  signatureBuffer?: Buffer
  companyName?: string
  companyGST?: string
  layout?: 'classic' | 'thermal'
  orderId?: string
  awbNumber?: string
  courierPartner?: string
  serviceType?: string
  pickupPincode?: string
  deliveryPincode?: string
  orderDate?: string
  sellerName?: string
  brandName?: string
  sellerAddress?: string
  sellerStateCode?: string
  gstNumber?: string
  panNumber?: string
  supportPhone?: string
  invoiceNotes?: string
  termsAndConditions?: string
  rtoCharges?: number
}

// ----------------------
// Generate Invoice PDF
// ----------------------
export const generateInvoicePDF = async (invoice: InvoiceData): Promise<Buffer> => {
  const fonts = {
    Helvetica: {
      normal: 'Helvetica',
      bold: 'Helvetica-Bold',
      italics: 'Helvetica-Oblique',
      bolditalics: 'Helvetica-BoldOblique',
    },
  }
  const printer = new PdfPrinter(fonts)

  const invoiceNumber = `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber}${
    invoice.invoiceSuffix ?? ''
  }`
  const isThermal = invoice.layout === 'thermal'
  const fontSize = isThermal ? 7 : 10
  const headerFontSize = isThermal ? 10 : 18
  // Black & white / grayscale styling for invoice
  const accentColor = '#000000'
  const dangerColor = '#000000'
  const toAmount = (value: unknown) => {
    const n = Number(value ?? 0)
    return Number.isFinite(n) ? n : 0
  }
  const formatCurrency = (value: number | string | null | undefined) => {
    const num = toAmount(value)
    const abs = Math.abs(num).toFixed(2)
    return `${num < 0 ? '-' : ''}Rs. ${abs}`
  }

  const headerBgColor = '#ffffff'
  const cardBgColor = '#ffffff'
  const cardBorderColor = '#dfe3ea'
  const mutedTextColor = '#1f2933'
  const sectionTitleColor = '#000000'
  const grandTotalBg = '#f4f6fb'

  // Helper function to validate if buffer is a valid PNG/JPEG/GIF
  const isValidImageBuffer = (buffer: Buffer): boolean => {
    if (!buffer || buffer.length < 4) return false

    // Check for PNG signature: 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return true
    }
    // Check for JPEG signature: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return true
    }
    // Check for GIF signature: 47 49 46 38 (GIF8)
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
      return true
    }
    // Check for WebP signature: RIFF...WEBP
    if (
      buffer.length >= 12 &&
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return true
    }
    return false
  }

  // Helper function to convert buffer to data URL with proper MIME type detection
  const bufferToDataUrl = async (buffer: Buffer): Promise<string | null> => {
    try {
      if (!buffer || buffer.length === 0) {
        console.warn('⚠️ Empty buffer provided to bufferToDataUrl')
        return null
      }

      // First, try to detect file type using file-type library
      const type = await fileType.fromBuffer(buffer)

      if (type) {
        // Only allow image types
        if (!type.mime.startsWith('image/')) {
          console.warn(`⚠️ Invalid image type detected: ${type.mime}, skipping image`)
          return null
        }
        const dataUrl = `data:${type.mime};base64,${buffer.toString('base64')}`
        // Validate the data URL format
        if (!dataUrl.startsWith('data:image/')) {
          console.warn('⚠️ Invalid data URL format generated')
          return null
        }
        return dataUrl
      }

      // If file-type couldn't detect, validate buffer manually
      if (!isValidImageBuffer(buffer)) {
        // Check if buffer might be corrupted or incomplete
        if (buffer.length < 100) {
          console.warn(
            `⚠️ Buffer too small (${buffer.length} bytes) - likely corrupted or incomplete download, skipping image`,
          )
        } else {
          console.warn(
            `⚠️ Could not detect image type and buffer does not appear to be a valid image format (PNG/JPEG/GIF/WebP), skipping image (buffer size: ${buffer.length} bytes)`,
          )
        }
        return null
      }

      // Buffer appears to be a valid image but type detection failed
      // Try to determine type from buffer signature
      let mimeType = 'image/png' // default
      if (buffer[0] === 0xff && buffer[1] === 0xd8) {
        mimeType = 'image/jpeg'
      } else if (buffer[0] === 0x47 && buffer[1] === 0x49) {
        mimeType = 'image/gif'
      } else if (buffer.length >= 12 && buffer[8] === 0x57 && buffer[9] === 0x45) {
        mimeType = 'image/webp'
      }

      console.warn(
        `⚠️ Could not detect image type via file-type, but buffer appears valid. Using ${mimeType}`,
      )
      const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`

      if (!dataUrl.startsWith('data:image/')) {
        console.warn('⚠️ Invalid data URL format generated')
        return null
      }
      return dataUrl
    } catch (err) {
      console.error('⚠️ Error converting buffer to data URL:', err)
      return null
    }
  }

  // Logo & Signature - handle errors gracefully, don't fail PDF generation
  let logoDataUrl: string | undefined
  if (invoice.logoBuffer) {
    try {
      const dataUrl = await bufferToDataUrl(invoice.logoBuffer)
      if (dataUrl) {
        logoDataUrl = dataUrl
      }
    } catch (err) {
      console.warn('⚠️ Failed to process logo buffer, continuing without logo:', err)
    }
  }

  const adminPrefs = await getAdminInvoicePreferences()

  // Platform (DelExpress) logo – try to load but don't fail if it doesn't work
  let platformLogoDataUrl: string | undefined
  try {
    const logoKey = adminPrefs?.logoFile ?? 'logo-white.png'
    const logoUrl = await presignDownload(logoKey)
    if (logoUrl && typeof logoUrl === 'string') {
      try {
        const resp = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000 })
        const buffer = Buffer.from(resp.data)
        const dataUrl = await bufferToDataUrl(buffer)
        if (dataUrl) {
          platformLogoDataUrl = dataUrl
        }
      } catch (err) {
        console.warn('⚠️ Failed to download platform logo, continuing without it:', err)
      }
    }
  } catch (err) {
    console.warn('⚠️ Failed to get platform logo URL, continuing without it:', err)
  }

  let signatureDataUrl: string | undefined
  if (invoice.signatureBuffer) {
    try {
      console.log('📝 Processing signature buffer for invoice...')
      const dataUrl = await bufferToDataUrl(invoice.signatureBuffer)
      if (dataUrl) {
        signatureDataUrl = dataUrl
        console.log('✅ Signature buffer successfully converted to data URL')
      } else {
        console.warn('⚠️ Signature buffer conversion returned null/undefined')
      }
    } catch (err) {
      console.warn('⚠️ Failed to process signature buffer, continuing without signature:', err)
    }
  } else {
    console.log('ℹ️ No signature buffer provided for invoice')
  }


  // -------------------
  // Prepare images object for pdfmake (must be before content arrays)
  // -------------------
  const images: Record<string, string> = {}

  // Validate and add logo
  if (logoDataUrl && typeof logoDataUrl === 'string' && logoDataUrl.startsWith('data:image/')) {
    try {
      const base64Match = logoDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
      if (base64Match && base64Match[1] && base64Match[1].length > 0) {
        images.logo = logoDataUrl
        console.log('✅ Logo successfully added to invoice PDF')
      } else {
        console.warn('⚠️ Logo data URL missing base64 data, skipping')
      }
    } catch (err) {
      console.warn('⚠️ Error validating logo data URL, skipping:', err)
    }
  }

  // Validate and add signature
  if (
    signatureDataUrl &&
    typeof signatureDataUrl === 'string' &&
    signatureDataUrl.startsWith('data:image/')
  ) {
    try {
      const base64Match = signatureDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
      if (base64Match && base64Match[1] && base64Match[1].length > 0) {
        images.signature = signatureDataUrl
        console.log('✅ Signature successfully added to invoice PDF')
      } else {
        console.warn('⚠️ Signature data URL missing base64 data, skipping')
      }
    } catch (err) {
      console.warn('⚠️ Error validating signature data URL, skipping:', err)
    }
  } else if (invoice.signatureBuffer) {
    console.warn('⚠️ Signature buffer provided but could not be converted to data URL')
  }

  // Validate and add platform logo
  if (
    platformLogoDataUrl &&
    typeof platformLogoDataUrl === 'string' &&
    platformLogoDataUrl.startsWith('data:image/')
  ) {
    try {
      const base64Match = platformLogoDataUrl.match(/^data:image\/[^;]+;base64,(.+)$/)
      if (base64Match && base64Match[1] && base64Match[1].length > 0) {
        images.platformLogo = platformLogoDataUrl
      } else {
        console.warn('⚠️ Platform logo data URL missing base64 data, skipping')
      }
    } catch (err) {
      console.warn('⚠️ Error validating platform logo data URL, skipping:', err)
    }
  }

  // -------------------
  // Charges
  // -------------------
  const subtotal = invoice.products.reduce((acc, p) => {
    const lineAmount = toAmount(p.price) * toAmount(p.qty ?? 1) - toAmount(p.discount ?? 0)
    return acc + Math.max(0, lineAmount)
  }, 0)
  const shipping = toAmount(invoice.shippingCharges)
  const giftWrap = toAmount(invoice.giftWrap)
  const txnFee = toAmount(invoice.transactionFee)
  const discount = Math.abs(toAmount(invoice.discount))
  const prepaid = Math.abs(toAmount(invoice.prepaidAmount))
  const grandTotal = subtotal + shipping + giftWrap + txnFee - (discount + prepaid)

  // Optional support line (avoid showing "null")
  const supportLine =
    invoice.supportEmail && invoice.supportEmail.trim().length > 0
      ? `• For support contact: ${invoice.supportEmail}`
      : null

  // -------------------
  // Product Rows + HSN Summary (for GST-style layout)
  // -------------------
  const hsnSummary: Record<
    string,
    { taxable: number; taxRate: number; cgst: number; sgst: number }
  > = {}

  const productRowsClassic = [
    [
      { text: 'SNo', bold: true, alignment: 'center', color: accentColor },
      { text: 'Item Description', bold: true, color: accentColor },
      { text: 'Qty', bold: true, alignment: 'center', color: accentColor },
      { text: 'Rate', bold: true, alignment: 'right', color: accentColor },
      { text: 'Tax', bold: true, alignment: 'right', color: accentColor },
      { text: 'Amount (Rs.)', bold: true, alignment: 'right', color: accentColor },
    ],
    ...invoice.products.map((p, index) => {
      const qty = toAmount(p.qty ?? 1)
      const price = toAmount(p.price)
      const discount = toAmount(p.discount)
      const taxRate = toAmount(p.tax_rate)
      const lineTaxable = Math.max(0, price * qty - discount)
      const lineTax = (lineTaxable * taxRate) / 100
      const cgst = lineTax / 2
      const sgst = lineTax / 2
      const hsnCode = p.hsn || 'NA'

      if (!hsnSummary[hsnCode]) {
        hsnSummary[hsnCode] = {
          taxable: 0,
          taxRate,
          cgst: 0,
          sgst: 0,
        }
      }
      hsnSummary[hsnCode].taxable += lineTaxable
      hsnSummary[hsnCode].cgst += cgst
      hsnSummary[hsnCode].sgst += sgst

      return [
        { text: (index + 1).toString(), alignment: 'center' },
        p.name ?? p.box_name ?? 'N/A',
        { text: qty.toString(), alignment: 'center' },
        { text: formatCurrency(price), alignment: 'right' },
        { text: `${taxRate}%`, alignment: 'right' },
        { text: formatCurrency(lineTaxable), alignment: 'right' },
      ]
    }),
  ]

  const hsnTotalRow = Object.values(hsnSummary).reduce(
    (acc, v) => {
      acc.taxable += v.taxable
      acc.cgst += v.cgst
      acc.sgst += v.sgst
      return acc
    },
    { taxable: 0, cgst: 0, sgst: 0 },
  )

  const productRowsThermal = [
    ['Item', 'Qty', 'Price', 'Total'],
    ...invoice.products.map((p) => {
      const qty = toAmount(p.qty ?? 1)
      const price = toAmount(p.price)
      const discount = toAmount(p.discount)
      const total = Math.max(0, price * qty - discount)
      return [
        p.name ?? p.box_name ?? 'N/A',
        qty.toString(),
        formatCurrency(price),
        formatCurrency(total),
      ]
    }),
  ]

  const borderLayout = {
    hLineColor: () => '#d1d5db',
    vLineColor: () => '#d1d5db',
    hLineWidth: () => 0.8,
    vLineWidth: () => 0.8,
  }

  const toSafeString = (value?: string | null) => (value ? value.trim() : '')
  const sellerDisplayName =
    toSafeString(invoice.brandName) || toSafeString(invoice.sellerName) || toSafeString(invoice.companyName)
  const sellerAddressLines = (invoice.sellerAddress || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  const buyerAddressLines = [
    invoice.buyerAddress,
    [invoice.buyerCity, invoice.buyerState].filter(Boolean).join(', '),
    invoice.buyerPincode,
  ].filter(Boolean)
  const sellerStateCode = toSafeString(invoice.sellerStateCode)
  const buyerStateName = toSafeString(invoice.buyerState)
  const isInterState =
    sellerStateCode &&
    buyerStateName &&
    sellerStateCode.toLowerCase() !== buyerStateName.toLowerCase()
  const codCharges = toAmount(invoice.courierCod)
  const rtoCharges = toAmount(invoice.rtoCharges ?? 0)
  const badgeIsCOD = invoice.orderType === 'cod'
  let cgstTotal = 0
  let sgstTotal = 0
  let igstTotal = 0
  const productRows: TableCell[][] = invoice.products.map((p, index) => {
    const qty = toAmount(p.qty ?? 1)
    const price = toAmount(p.price)
    const discount = toAmount(p.discount ?? 0)
    const taxRate = Math.max(0, toAmount(p.tax_rate))
    const lineTaxable = Math.max(0, price * qty - discount)
    const taxAmount = (lineTaxable * taxRate) / 100
    const lineIgst = isInterState ? taxAmount : 0
    const lineCgst = isInterState ? 0 : taxAmount / 2
    const lineSgst = isInterState ? 0 : taxAmount / 2
    cgstTotal += lineCgst
    sgstTotal += lineSgst
    igstTotal += lineIgst
    const lineTotal = lineTaxable + taxAmount

    const hsnCode = p.hsn || 'NA'

    if (!hsnSummary[hsnCode]) {
      hsnSummary[hsnCode] = {
        taxable: 0,
        taxRate,
        cgst: 0,
        sgst: 0,
      }
    }
    hsnSummary[hsnCode].taxable += lineTaxable
    hsnSummary[hsnCode].cgst += lineCgst
    hsnSummary[hsnCode].sgst += lineSgst

    return ([
      { text: String(index + 1), alignment: 'center', color: '#475467' },
      {
        text: p.name ?? p.box_name ?? 'N/A',
        color: '#0f172a',
        margin: [0, 2, 0, 2],
      },
      { text: hsnCode, alignment: 'center', color: '#475467' },
      { text: qty.toString(), alignment: 'right', color: '#0f172a' },
      { text: formatCurrency(price), alignment: 'right', color: '#0f172a' },
      {
        text: taxRate > 0 ? `${taxRate.toFixed(2)}%` : '0%',
        alignment: 'right',
        color: '#475467',
      },
      { text: formatCurrency(lineTotal), alignment: 'right', color: '#0f172a', bold: true },
    ] as TableCell[])
  })
  const taxTotal = cgstTotal + sgstTotal + igstTotal
  const chargesBreakdown = [
    { label: 'Subtotal', value: subtotal },
    { label: 'Shipping Charges', value: shipping },
    { label: 'Gift Wrap', value: giftWrap },
    { label: 'Transaction Fee', value: txnFee },
    { label: 'COD Charges', value: codCharges },
    { label: 'RTO Charges', value: rtoCharges },
    { label: 'Discount', value: -discount },
    { label: 'Prepaid Amount', value: -prepaid },
  ]
  const breakdownSum = chargesBreakdown.reduce((sum, item) => sum + Number(item.value || 0), 0)
  const grandTotalModern = breakdownSum + taxTotal
  const notesText = toSafeString(invoice.invoiceNotes)
  const termsText = toSafeString(invoice.termsAndConditions)
  const supportContact = [invoice.supportEmail, invoice.supportPhone].filter(Boolean).join(' | ')


  const buildHeaderBand = () => ({
    table: {
      widths: ['*', 'auto'],
      body: [
        [
          {
            stack: [
              images.logo
                ? { image: 'logo', width: 110, margin: [0, 0, 0, 6] }
                : {
                    text: sellerDisplayName || invoice.companyName || 'Seller',
                    fontSize: 20,
                    bold: true,
                    color: '#000',
                  },
              sellerDisplayName
                ? { text: sellerDisplayName, fontSize: 10, color: '#000' }
                : null,
              invoice.gstNumber
                ? { text: `GSTIN: ${invoice.gstNumber}`, fontSize: 9, color: mutedTextColor }
                : null,
              images.platformLogo
                ? { image: 'platformLogo', width: 60, margin: [0, 4, 0, 0] }
                : null,
            ].filter(Boolean),
            border: [false, false, false, false],
          },
          {
            stack: [
              { text: 'TAX INVOICE', fontSize: 12, bold: true, color: '#000', alignment: 'right' },
              { text: invoiceNumber, fontSize: 22, bold: true, color: '#000', alignment: 'right' },
              {
                text: invoice.invoiceDate ?? '',
                fontSize: 10,
                color: mutedTextColor,
                alignment: 'right',
              },
            ],
            border: [false, false, false, false],
          },
        ],
      ],
    },
    layout: {
      defaultBorder: false,
    },
    margin: [0, 0, 0, 12],
  })

  const buildClassicLayout = () => {
    const fromDetails = [
      { text: 'FROM', bold: true, fontSize: 8, color: '#000', characterSpacing: 1 },
      { text: sellerDisplayName || 'Seller', bold: true, fontSize: 12, color: '#000' },
      ...(sellerAddressLines.length
        ? sellerAddressLines.map((line) => ({ text: line, fontSize: 9, color: mutedTextColor }))
        : [{ text: 'Warehouse address not provided', fontSize: 9, color: mutedTextColor }]),
      sellerStateCode ? { text: `State Code: ${sellerStateCode}`, fontSize: 9, color: mutedTextColor } : null,
      invoice.gstNumber
        ? { text: `GSTIN: ${invoice.gstNumber}`, fontSize: 9, color: mutedTextColor }
        : null,
      invoice.panNumber
        ? { text: `PAN: ${invoice.panNumber}`, fontSize: 9, color: mutedTextColor }
        : null,
      supportContact ? { text: `Support: ${supportContact}`, fontSize: 9, color: mutedTextColor } : null,
    ].filter(Boolean)

    const buyerDetails = [
      { text: 'TO', bold: true, fontSize: 8, color: '#000', characterSpacing: 1 },
      { text: invoice.buyerName, bold: true, fontSize: 12, color: '#000' },
      ...buyerAddressLines.map((line) => ({ text: line, fontSize: 9, color: mutedTextColor })),
      invoice.buyerPhone ? { text: `Phone: ${invoice.buyerPhone}`, fontSize: 9, color: mutedTextColor } : null,
      invoice.buyerEmail ? { text: `Email: ${invoice.buyerEmail}`, fontSize: 9, color: mutedTextColor } : null,
    ].filter(Boolean)

    const createCard = (details: any[]) => ({
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: details,
              border: [true, true, true, true],
              borderColor: cardBorderColor,
              fillColor: cardBgColor,
              margin: [10, 8, 10, 8],
            },
          ],
        ],
      },
      layout: {
        defaultBorder: false,
      },
    })

    const partySection = {
      columns: [
        {
          width: '*',
          ...createCard(fromDetails),
        },
        {
          width: '*',
          ...createCard(buyerDetails),
        },
      ],
      columnGap: 12,
      margin: [0, 0, 0, 12],
    }

    const shipmentRows = [
      ['Order ID', invoice.orderId || invoiceNumber],
      ['AWB Number', invoice.awbNumber || '-'],
      ['Pickup Pincode', invoice.pickupPincode || '-'],
      ['Delivery Pincode', invoice.deliveryPincode || invoice.buyerPincode || '-'],
      ['Order Date', invoice.orderDate || '-'],
      ['Invoice Date', invoice.invoiceDate || '-'],
    ]
    const shipmentDetails = {
      stack: [
        { text: 'Shipment Details', bold: true, fontSize: 11, color: '#000', margin: [0, 0, 0, 6] },
        {
          table: {
            widths: ['*', 'auto'],
            body: shipmentRows.map(([label, value]) => [
              { text: label, fontSize: 9, color: mutedTextColor },
              { text: value || '-', alignment: 'right', fontSize: 9, color: '#000' },
            ]),
          },
          layout: {
            defaultBorder: false,
            hLineColor: () => '#e5e7eb',
            hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
            paddingTop: () => 4,
            paddingBottom: () => 4,
          },
        },
      ],
      margin: [0, 0, 0, 12],
    }

    const badgeBgColor = badgeIsCOD ? '#fed7aa' : '#d1fad4'
    const badgeBorderColor = badgeIsCOD ? '#f97316' : '#16a34a'
    const paymentIndicator = {
      text: badgeIsCOD ? 'PAY ON DELIVERY' : 'PAID',
      fontSize: fontSize + 1,
      bold: true,
      color: '#000',
      fillColor: badgeBgColor,
      lineHeight: 1.4,
      alignment: 'center',
      margin: [0, 4, 0, 4],
      border: [true, true, true, true],
      borderColor: badgeBorderColor,
    }

    const paymentBadgeSection = {
      columns: [
        { text: '', width: '*' },
        {
          width: 160,
          stack: [
            paymentIndicator,
            {
              text: badgeIsCOD ? 'Payable on Delivery' : 'Prepaid · Paid',
              fontSize: 9,
              color: '#000',
              alignment: 'center',
              margin: [0, 4, 0, 0],
            },
          ],
        },
      ],
      columnGap: 12,
      margin: [0, 0, 0, 12],
    }

    const itemsTable = {
      table: {
        headerRows: 1,
        widths: [24, '*', 62, 40, 70, 50, 70],
        body: [
          [
            { text: 'S.No', bold: true, fontSize: 9, color: mutedTextColor, alignment: 'center' },
            { text: 'Item Description', bold: true, fontSize: 9, color: mutedTextColor },
            { text: 'HSN/SAC', bold: true, fontSize: 9, color: mutedTextColor, alignment: 'center' },
            { text: 'Qty', bold: true, fontSize: 9, color: mutedTextColor, alignment: 'right' },
            { text: 'Unit Price', bold: true, fontSize: 9, color: mutedTextColor, alignment: 'right' },
            { text: 'Tax', bold: true, fontSize: 9, color: mutedTextColor, alignment: 'right' },
            { text: 'Total', bold: true, fontSize: 9, color: mutedTextColor, alignment: 'right' },
          ],
          ...productRows,
        ],
      },
      layout: {
        hLineColor: () => '#e5e7eb',
        vLineWidth: () => 0,
        hLineWidth: (i: number) => (i === 0 ? 1 : 0.5),
        paddingTop: () => 6,
        paddingBottom: () => 6,
      },
      margin: [0, 0, 0, 12],
    }

    const filteredCharges = chargesBreakdown.filter((item) => {
      if (item.label === 'COD Charges' && codCharges === 0) return false
      if (item.label === 'RTO Charges' && rtoCharges === 0) return false
      return true
    })

    const chargesTableBody: TableCell[][] = filteredCharges
      .filter((row) => row.label !== 'Grand Total')
      .map((row) =>
        ([
          { text: row.label, fontSize: 9, color: mutedTextColor },
          {
            text: formatCurrency(row.value),
            fontSize: 9,
            alignment: 'right',
            color: '#000',
          },
        ] as TableCell[]),
      )
    if (taxTotal > 0) {
      chargesTableBody.push([
        { text: 'Tax', fontSize: 9, color: mutedTextColor },
        { text: formatCurrency(taxTotal), fontSize: 9, alignment: 'right', color: '#000' },
      ] as TableCell[])
    }
    chargesTableBody.push([
      {
        text: 'Grand Total',
        fontSize: 11,
        bold: true,
        color: '#000',
        fillColor: grandTotalBg,
      },
      {
        text: formatCurrency(grandTotalModern),
        fontSize: 11,
        bold: true,
        alignment: 'right',
        color: '#000',
        fillColor: grandTotalBg,
      },
    ] as TableCell[])

    const chargesCard = {
      table: {
        widths: ['*', 'auto'],
        body: chargesTableBody,
      },
      layout: {
        defaultBorder: false,
      },
    }

    const gstRows = [
      { label: 'Taxable Amount', value: subtotal },
      ...(cgstTotal > 0 ? [{ label: 'CGST', value: cgstTotal }] : []),
      ...(sgstTotal > 0 ? [{ label: 'SGST', value: sgstTotal }] : []),
      ...(igstTotal > 0 ? [{ label: 'IGST', value: igstTotal }] : []),
    ]
    const gstSummary =
      gstRows.length > 1 || (gstRows.length === 1 && gstRows[0].value > 0)
        ? {
            table: {
              widths: ['*', 'auto'],
              body: gstRows.map((row) => [
                { text: row.label, fontSize: 9, color: mutedTextColor },
                { text: formatCurrency(row.value), fontSize: 9, alignment: 'right', color: '#000' },
              ]),
            },
            layout: {
              defaultBorder: false,
              paddingTop: () => 2,
              paddingBottom: () => 2,
            },
            margin: [0, 0, 0, 6],
          }
        : null

    const notesBlock = notesText
      ? {
          table: {
            widths: ['*'],
            body: [
              [
                {
                  stack: [
                    { text: 'Notes', style: 'sectionTitle' },
                    { text: notesText, fontSize: 9, color: '#000' },
                  ],
                },
              ],
            ],
          },
          layout: 'noBorders',
          margin: [0, 0, 0, 6],
        }
      : null

    const signatureSection = {
      columns: [
        {
          width: '*',
          stack: [
            { text: 'Authorized Signatory', fontSize: 10, bold: true, color: '#000' },
            {
              text: `Signed by ${sellerDisplayName || invoice.companyName || 'Seller'}`,
              fontSize: 9,
              color: mutedTextColor,
            },
            {
              canvas: [
                {
                  type: 'line',
                  x1: 0,
                  y1: 0,
                  x2: 180,
                  y2: 0,
                  lineWidth: 0.5,
                  color: cardBorderColor,
                },
              ],
              margin: [0, 12, 0, 6],
            },
            images.signature
              ? { image: 'signature', width: 160, alignment: 'left', margin: [0, 4, 0, 0] }
              : {
                  text: 'Signature provided via invoice settings',
                  fontSize: 9,
                  color: mutedTextColor,
                  italics: true,
                  margin: [0, 6, 0, 0],
                },
          ],
        },
      ],
      margin: [0, 24, 0, 0],
    }

    const totalsLayout = {
      columns: [
        {
          width: '*',
          stack: [gstSummary, notesBlock].filter(Boolean),
        },
        {
          width: 220,
          stack: [
            { text: 'Charges Breakdown', style: 'sectionTitle', margin: [0, 0, 0, 6] },
            chargesCard,
          ],
        },
      ],
      columnGap: 16,
      margin: [0, 0, 0, 12],
    }

    return [
      partySection,
      shipmentDetails,
      paymentBadgeSection,
      itemsTable,
      totalsLayout,
      signatureSection,
    ].filter(Boolean)
  }

  const contentClassic: any[] = [buildHeaderBand(), ...buildClassicLayout()]

  // -------------------
  // Thermal Layout
  // -------------------
  const contentThermal: any[] = [
    { text: invoice.companyName ?? 'DelExpress', alignment: 'center', bold: true },
    { text: 'TAX INVOICE', alignment: 'center', bold: true, margin: [0, 2, 0, 2] },
    {
      text: 'ORIGINAL FOR RECIPIENT',
      alignment: 'center',
      fontSize: fontSize - 1,
      color: '#4b5563',
      margin: [0, 0, 0, 2],
    },
    {
      table: {
        widths: ['*', '*'],
        body: [
          [
            { text: `Invoice: ${invoiceNumber}`, margin: [4, 4, 4, 4] },
            { text: `Date: ${invoice.invoiceDate}`, alignment: 'right', margin: [4, 4, 4, 4] },
          ],
        ],
      },
      layout: borderLayout,
      margin: [0, 0, 0, 4],
    },
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                { text: invoice.buyerName, bold: true },
                { text: invoice.buyerAddress },
                { text: `${invoice.buyerCity}, ${invoice.buyerState} - ${invoice.buyerPincode}` },
                { text: `Ph: ${invoice.buyerPhone}` },
              ],
              margin: [4, 4, 4, 4],
            },
          ],
        ],
      },
      layout: borderLayout,
      margin: [0, 0, 0, 4],
    },
    {
      table: { widths: ['*', 'auto', 'auto', 'auto'], body: productRowsThermal },
      layout: borderLayout,
      margin: [0, 0, 0, 4],
      fontSize,
    },
    {
      table: {
        widths: ['*', 'auto'],
        body: [
          ['Subtotal', formatCurrency(subtotal)],
          ['Shipping', formatCurrency(shipping)],
          ['Gift Wrap', formatCurrency(giftWrap)],
          ['Txn Fee', formatCurrency(txnFee)],
          ['Discount', formatCurrency(-discount)],
          ['Prepaid', formatCurrency(-prepaid)],
          [
            { text: 'Grand Total', bold: true },
            { text: formatCurrency(grandTotal), bold: true },
          ],
        ],
      },
      layout: borderLayout,
      margin: [0, 0, 0, 4],
      fontSize,
    },
    invoice.orderType === 'cod' && invoice.courierCod
      ? {
          text: `COD: ${formatCurrency(invoice.courierCod)}`,
          alignment: 'center',
          bold: true,
          color: dangerColor,
          margin: [0, 3, 0, 3],
        }
      : null,
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              stack: [
                { text: 'Notes', bold: true, margin: [0, 0, 0, 2] },
                ...(supportLine ? [{ text: supportLine }] : []),
                { text: 'Transit delays are beyond our control.' },
              ],
              margin: [4, 4, 4, 4],
              color: '#4b5563',
            },
          ],
        ],
      },
      layout: borderLayout,
      margin: [0, 0, 0, 4],
    },
    images.signature
      ? { image: 'signature', width: 56, alignment: 'right', margin: [0, 4, 0, 0] }
      : { text: 'Authorized Signatory', alignment: 'right', italics: true, fontSize, color: '#6b7280' },
    platformLogoDataUrl
      ? { image: 'platformLogo', width: 40, alignment: 'center', margin: [0, 4, 0, 0] }
      : null,
    {
      text: 'Powered by DelExpress',
      alignment: 'center',
      italics: true,
      margin: [0, 4, 0, 0],
      fontSize,
      color: '#6b7280',
    },
  ].filter(Boolean)

  // -------------------
  // Final Definition
  // -------------------
  // Images object is already created above, before content arrays

  const docDefinition: any = {
    content: isThermal ? contentThermal : contentClassic,
    ...(Object.keys(images).length > 0 && { images }),
    styles: {
      sectionHeader: { bold: true, fontSize: fontSize + 2, color: accentColor },
      sectionTitle: { bold: true, fontSize: fontSize + 1, color: sectionTitleColor },
      sectionTag: { bold: true, fontSize: 8, color: sectionTitleColor, characterSpacing: 1 },
    },
    defaultStyle: { font: 'Helvetica', fontSize, color: '#000' },
    pageMargins: isThermal ? [5, 5, 5, 5] : [40, 40, 40, 60],
    pageSize: isThermal ? { width: 220, height: 'auto' } : 'A4',
    footer: (currentPage: number, pageCount: number) => {
      const footerStack: any[] = [
        {
          text: 'This is a system generated invoice and does not require a physical signature.',
          fontSize: 8,
          color: mutedTextColor,
        },
        supportContact
          ? { text: `Support: ${supportContact}`, fontSize: 8, color: mutedTextColor }
          : null,
        termsText
          ? {
              text: `Terms & Conditions: ${termsText}`,
              fontSize: 7,
              color: mutedTextColor,
              margin: [0, 3, 0, 0],
            }
          : null,
        {
          text: 'Logistics services are subject to courier partner terms and applicable laws.',
          fontSize: 7,
          color: mutedTextColor,
          margin: [0, 3, 0, 0],
        },
        images.platformLogo
          ? { image: 'platformLogo', width: 60, alignment: 'center', margin: [0, 6, 0, 0] }
          : null,
        {
          text: `Page ${currentPage} of ${pageCount}`,
          fontSize: 7,
          color: mutedTextColor,
          alignment: 'right',
          margin: [0, 5, 0, 0],
        },
      ].filter(Boolean)
      return { stack: footerStack, margin: isThermal ? [5, 0, 5, 0] : [40, 0, 40, 0] }
    },
  }

  // Final safety: Helvetica can render ₹ incorrectly in some environments.
  // Normalize any remaining rupee glyphs in all PDF text nodes.
  const normalizeRupeeGlyphs = (node: any): any => {
    if (typeof node === 'string') return node.replace(/₹/g, 'Rs.')
    if (Array.isArray(node)) return node.map(normalizeRupeeGlyphs)
    if (node && typeof node === 'object') {
      for (const key of Object.keys(node)) {
        node[key] = normalizeRupeeGlyphs(node[key])
      }
      return node
    }
    return node
  }
  normalizeRupeeGlyphs(docDefinition)

  return new Promise<Buffer>((resolve, reject) => {
    try {
      const pdfDoc = printer.createPdfKitDocument(docDefinition)
      const chunks: Buffer[] = []
      pdfDoc.on('data', (chunk) => chunks.push(chunk))
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
      pdfDoc.on('error', (err) => {
        console.error('❌ PDF generation error:', err)
        // Provide more helpful error message
        if (err && typeof err === 'object' && 'message' in err) {
          const errorMsg = (err as any).message || String(err)
          if (errorMsg.includes('Unknown image format') || errorMsg.includes('Invalid image')) {
            reject(
              new Error(
                `Invoice PDF generation failed: Invalid image format. Please check logo/signature files are valid images (PNG, JPEG, GIF, or WebP). Original error: ${errorMsg}`,
              ),
            )
          } else {
            reject(new Error(`Invoice PDF generation failed: ${errorMsg}`))
          }
        } else {
          reject(err)
        }
      })
      pdfDoc.end()
    } catch (err: any) {
      console.error('❌ Error creating PDF document:', err)
      reject(new Error(`Failed to create invoice PDF: ${err?.message || String(err)}`))
    }
  })
}

type Filters = {
  status?: string
  userId?: string
  invoiceNumber?: string
  dateFrom?: string
  dateTo?: string
  awb?: string
}

export const getInvoicesService = async ({
  page,
  limit,
  filters,
}: {
  page: number
  limit: number
  filters: Filters
}) => {
  const offset = (page - 1) * limit

  const whereClauses = []

  if (filters.status) {
    whereClauses.push(eq(invoices.status, filters.status as any))
  }
  if (filters.userId) {
    whereClauses.push(eq(invoices.userId, filters.userId))
  }
  if (filters.invoiceNumber) {
    whereClauses.push(ilike(invoices.invoiceNumber, `%${filters.invoiceNumber}%`))
  }
  if (filters.dateFrom) {
    whereClauses.push(gte(invoices.invoiceDate, filters.dateFrom))
  }
  if (filters.dateTo) {
    whereClauses.push(lte(invoices.invoiceDate, filters.dateTo))
  }
  console.log('filters', filters)
  if (filters.awb) {
    // Look into items JSONB for orderId matching AWB
    whereClauses.push(
      sql`EXISTS (
        SELECT 1 
        FROM jsonb_array_elements(${invoices.items}) AS item
        WHERE item->>'awb' ILIKE ${'%' + filters.awb + '%'}
      )`,
    )
  }

  const whereCondition = whereClauses.length > 0 ? and(...whereClauses) : undefined

  // Fetch paginated invoices
  const data = await db
    .select()
    .from(invoices)
    .where(whereCondition!)
    .orderBy(desc(invoices.invoiceDate))
    .limit(limit)
    .offset(offset)

  // Count total
  const total = (
    await db
      .select({ count: sql<number>`count(*)` })
      .from(invoices)
      .where(whereCondition!)
  )[0].count as number

  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    data,
  }
}
