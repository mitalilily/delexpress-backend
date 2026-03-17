// services/generateCustomLabelService.ts
import axios from 'axios'
import bwipjs from 'bwip-js'
import { eq } from 'drizzle-orm'
import fileType from 'file-type'
import PdfPrinter from 'pdfmake'
import { db } from '../client'
import { labelPreferences } from '../schema/labelPreferences'
import { userProfiles } from '../schema/userProfile'
import { getAdminInvoicePreferences } from './invoicePreferences.service'
import { presignDownload, presignUpload } from './upload.service'

function isValidDataUrl(str: string | null): boolean {
  return typeof str === 'string' && str.startsWith('data:image/')
}

// Helper function to convert buffer to data URL with proper MIME type detection
async function bufferToDataUrl(buffer: Buffer): Promise<string | null> {
  try {
    if (!buffer || buffer.length === 0) {
      console.warn('⚠️ Empty buffer provided to bufferToDataUrl')
      return null
    }
    const type = await fileType.fromBuffer(buffer)
    if (!type) {
      console.warn('⚠️ Could not detect image type, defaulting to PNG')
      return `data:image/png;base64,${buffer.toString('base64')}`
    }
    // Only allow image types
    if (!type.mime.startsWith('image/')) {
      console.warn(`⚠️ Invalid image type: ${type.mime}, defaulting to PNG`)
      return `data:image/png;base64,${buffer.toString('base64')}`
    }
    const dataUrl = `data:${type.mime};base64,${buffer.toString('base64')}`
    // Validate the data URL format
    if (!dataUrl.startsWith('data:image/')) {
      console.warn('⚠️ Invalid data URL format generated')
      return null
    }
    return dataUrl
  } catch (err) {
    console.warn('⚠️ Error detecting image type, defaulting to PNG:', err)
    try {
      return `data:image/png;base64,${buffer.toString('base64')}`
    } catch (bufferErr) {
      console.error('⚠️ Failed to convert buffer to base64:', bufferErr)
      return null
    }
  }
}

async function generateBarcodeBase64(text: string): Promise<string | null> {
  if (!text) return null
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128',
      text,
      scale: 3,
      height: 15,
      includetext: true,
      textxalign: 'center',
    })
    return `data:image/png;base64,${png.toString('base64')}`
  } catch (err) {
    console.warn('⚠️ Barcode generation failed:', err)
    return null
  }
}

const fonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
}

const DEFAULT_LABEL_SETTINGS = {
  printer_type: 'thermal',
  char_limit: 25,
  max_items: 3,
  order_info: {
    orderId: true,
    invoiceNumber: true,
    orderDate: false,
    invoiceDate: false,
    orderBarcode: true,
    invoiceBarcode: true,
    rtoRoutingCode: true,
    declaredValue: true,
    cod: true,
    awb: true,
    terms: true,
  },
  shipper_info: {
    shipperPhone: true,
    gstin: true,
    shipperAddress: true,
    rtoAddress: false,
    sellerBrandName: true,
    brandLogo: true,
  },
  product_info: {
    itemName: true,
    productCost: true,
    productQuantity: true,
    skuCode: false,
    dimension: false,
    deadWeight: false,
    otherCharges: true,
  },
  powered_by: 'DelExpress',
}

function mergeSettings(prefs: any) {
  if (!prefs) return DEFAULT_LABEL_SETTINGS
  return {
    printer_type: prefs.printer_type ?? DEFAULT_LABEL_SETTINGS.printer_type,
    char_limit: prefs.char_limit ?? DEFAULT_LABEL_SETTINGS.char_limit,
    max_items: prefs.max_items ?? DEFAULT_LABEL_SETTINGS.max_items,
    order_info: { ...(DEFAULT_LABEL_SETTINGS.order_info as any), ...(prefs.order_info || {}) },
    shipper_info: {
      ...(DEFAULT_LABEL_SETTINGS.shipper_info as any),
      ...(prefs.shipper_info || {}),
    },
    product_info: {
      ...(DEFAULT_LABEL_SETTINGS.product_info as any),
      ...(prefs.product_info || {}),
    },
    powered_by: prefs.powered_by ?? DEFAULT_LABEL_SETTINGS.powered_by,
  }
}

export async function generateLabelForOrder(order: any, userId: string, tx: any = db) {
  console.log('ORDER', order)

  // Load preferences
  const [prefsRow] = await tx
    .select()
    .from(labelPreferences)
    .where(eq(labelPreferences.user_id, userId))
  const prefs = prefsRow ?? undefined
  const settings: any = mergeSettings(prefs)

  // Load user profile (logo)
  const [profileOfUser] = await tx
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
  let logoBase64: string | null = null
  if (settings.shipper_info?.brandLogo && profileOfUser?.companyInfo?.companyLogoUrl) {
    try {
      const logoUrl = await presignDownload(profileOfUser.companyInfo.companyLogoUrl)
      const finalUrl = Array.isArray(logoUrl) ? (logoUrl.length > 0 ? logoUrl[0] : null) : logoUrl
      if (finalUrl) {
        const logoResp = await axios.get(finalUrl, {
          responseType: 'arraybuffer',
        })
        const buffer = Buffer.from(logoResp.data)
        const dataUrl = await bufferToDataUrl(buffer)
        if (dataUrl && isValidDataUrl(dataUrl)) {
          logoBase64 = dataUrl
        }
      }
    } catch (err) {
      console.warn('⚠️ Failed to fetch company logo:', err)
    }
  }

  const adminPrefs = await getAdminInvoicePreferences()
  // Always show DelExpress platform logo (Powered by ...)
  let platformLogoBase64: string | null = null
  try {
    const platformLogoKey = adminPrefs?.logoFile ?? 'logo-white.png'
    const logoUrl = await presignDownload(platformLogoKey)
    const finalUrl = Array.isArray(logoUrl) ? logoUrl[0] : logoUrl
    if (finalUrl) {
      const logoResp = await axios.get(finalUrl, {
        responseType: 'arraybuffer',
      })
      const buffer = Buffer.from(logoResp.data)
      const dataUrl = await bufferToDataUrl(buffer)
      if (dataUrl && isValidDataUrl(dataUrl)) {
        platformLogoBase64 = dataUrl
      }
    }
  } catch (err) {
    console.warn('⚠️ Failed to fetch platform logo:', err)
  }

  // Normalize fields
  const consignee = {
    name: order.buyer_name ?? order.consignee_name ?? '',
    address: order.address ?? '',
    city: order.city ?? '',
    state: order.state ?? '',
    pincode: order.pincode ?? '',
    phone: order.buyer_phone ?? order.phone ?? '',
  }

  const pickup =
    typeof order.pickup_details === 'string'
      ? JSON.parse(order.pickup_details || '{}')
      : order.pickup_details ?? {}

  const rto =
    typeof order.rto_details === 'string'
      ? JSON.parse(order.rto_details || '{}')
      : order.rto_details ?? {}

  const products = Array.isArray(order.products)
    ? order.products
    : JSON.parse(order.products ?? '[]')
  const paymentType = (order.payment_type ?? order.order_type ?? order.type ?? '')
    .toString()
    .toLowerCase()

  const pages: any[] = []
  const primaryColor = '#1a237e'
  const accentColor = '#eef3ff'
  const isEnabled = (value: unknown) => (value === undefined ? true : value === true)
  const awbEnabled = isEnabled(settings.order_info?.awb)
  const showOrderId = isEnabled(settings.order_info?.orderId)
  const showInvoiceNumber = isEnabled(settings.order_info?.invoiceNumber)
  const showOrderDate = isEnabled(settings.order_info?.orderDate)
  const showInvoiceDate = isEnabled(settings.order_info?.invoiceDate)
  const showOrderBarcode = isEnabled(settings.order_info?.orderBarcode)
  const showInvoiceBarcode = isEnabled(settings.order_info?.invoiceBarcode)
  const showRtoRoutingCode = isEnabled(settings.order_info?.rtoRoutingCode)
  const showDeclaredValue = isEnabled(settings.order_info?.declaredValue)
  const showCodBanner = isEnabled(settings.order_info?.cod)
  const showTerms = isEnabled(settings.order_info?.terms)
  const showCustomerPhone = isEnabled(settings.order_info?.customerPhone)
  const showBrandName = isEnabled(settings.shipper_info?.sellerBrandName)
  const showShipperAddress = isEnabled(settings.shipper_info?.shipperAddress)
  const showShipperPhone = isEnabled(settings.shipper_info?.shipperPhone)
  const showShipperGst = isEnabled(settings.shipper_info?.gstin)
  const showRto = isEnabled(settings.shipper_info?.rtoAddress)
  const showBrandLogo = isEnabled(settings.shipper_info?.brandLogo)
  const includeProductName = isEnabled(settings.product_info?.itemName)
  const includeCost = isEnabled(settings.product_info?.productCost)
  const includeQty = isEnabled(settings.product_info?.productQuantity)
  const includeSku = isEnabled(settings.product_info?.skuCode)
  const includeDimension = isEnabled(settings.product_info?.dimension)
  const includeDeadWeight = isEnabled(settings.product_info?.deadWeight)
  const showOrderValueSection = isEnabled(settings.product_info?.otherCharges)
  const showPlatformBranding = Boolean(settings.powered_by?.toString().trim())
  const charLimit = Math.max(10, Number(settings.char_limit ?? 25))
  const maxItems = Math.max(1, Number(settings.max_items ?? 3))

  // For Delhivery, prefer barcode_img coming from provider APIs (if stored on order);
  // otherwise fall back to a locally generated AWB barcode.
  let awbBarcode: string | null = null
  const providerKey = (order.integration_type || order.courier_partner || '')
    .toString()
    .toLowerCase()

  // Check for barcode from courier APIs - can be URL or data URL
  const barcodeSource =
    order.barcode_img || order.barcode_url || order.barcode_image || order.barcode || null

  if (providerKey.includes('delhivery') && barcodeSource) {
    try {
      // Check if it's already a data URL
      if (isValidDataUrl(barcodeSource)) {
        awbBarcode = barcodeSource
        console.log('✅ Using barcode from courier API (data URL format)')
      } else if (typeof barcodeSource === 'string' && barcodeSource.startsWith('http')) {
        // It's a URL - download and convert to data URL
        console.log(`📥 Downloading barcode from courier API: ${barcodeSource}`)
        try {
          const barcodeResponse = await axios.get(barcodeSource, {
            responseType: 'arraybuffer',
            timeout: 10000,
          })
          const barcodeBuffer = Buffer.from(barcodeResponse.data)
          const dataUrl = await bufferToDataUrl(barcodeBuffer)
          if (dataUrl && isValidDataUrl(dataUrl)) {
            awbBarcode = dataUrl
            console.log('✅ Barcode downloaded and converted to data URL')
          } else {
            console.warn('⚠️ Failed to convert downloaded barcode to data URL')
          }
        } catch (downloadErr: any) {
          console.warn(
            `⚠️ Failed to download barcode from URL: ${barcodeSource}`,
            downloadErr?.message || downloadErr,
          )
        }
      } else {
        console.warn(`⚠️ Barcode from courier API is in unexpected format: ${typeof barcodeSource}`)
      }
    } catch (err: any) {
      console.warn(`⚠️ Error processing barcode from courier API:`, err?.message || err)
    }
  }

  // Fallback to generating AWB barcode locally if no courier barcode available
  if (!awbBarcode && awbEnabled && order.awb_number) {
    awbBarcode = await generateBarcodeBase64(order.awb_number)
    console.log('✅ Generated AWB barcode locally')
  }
  const orderBarcode =
    showOrderBarcode && order.order_number ? await generateBarcodeBase64(order.order_number) : null
  const invoiceBarcode =
    showInvoiceBarcode && order.invoice_number
      ? await generateBarcodeBase64(order.invoice_number)
      : null

  const toAmount = (value: unknown) => {
    const n = Number(value ?? 0)
    return Number.isFinite(n) ? n : 0
  }
  const formatCurrency = (value: number | string | null | undefined) =>
    `Rs. ${toAmount(value).toFixed(2)}`

  const buildAddress = (addr: Record<string, any>) => {
    const lines = [
      addr.address,
      [addr.city, addr.state].filter(Boolean).join(', '),
      addr.pincode,
    ].filter((line) => typeof line === 'string' && line.trim().length > 0)

    return lines.join('\n')
  }

  // Register images in pdfmake's images dictionary FIRST
  // Only add images that are valid data URLs
  const images: Record<string, string> = {}
  if (showBrandLogo && logoBase64 && isValidDataUrl(logoBase64)) {
    images.logo = logoBase64
  }
  if (showPlatformBranding && platformLogoBase64 && isValidDataUrl(platformLogoBase64)) {
    images.platformLogo = platformLogoBase64
  }
  if (awbBarcode && isValidDataUrl(awbBarcode)) {
    images.awbBarcode = awbBarcode
  }
  if (orderBarcode && isValidDataUrl(orderBarcode)) {
    images.orderBarcode = orderBarcode
  }
  if (invoiceBarcode && isValidDataUrl(invoiceBarcode)) {
    images.invoiceBarcode = invoiceBarcode
  }

  const chunk = products.slice(0, maxItems)
  const pageContent: any[] = []

  const trimText = (value: any, max = charLimit) => {
    const text = String(value ?? '').trim()
    if (!text) return '-'
    return text.length > max ? `${text.slice(0, max)}...` : text
  }

  const sellerBrandName =
    profileOfUser?.companyInfo?.companyName ||
    profileOfUser?.companyInfo?.displayName ||
    pickup?.warehouse_name ||
    ''
  const normalizedSortCode = String(order?.sort_code ?? '').trim()

  const headerLeftStack: any[] = []
  if (showBrandLogo && images.logo) {
    headerLeftStack.push({ image: 'logo', width: 44, margin: [0, 0, 0, 2] })
  }
  if (showBrandName && sellerBrandName) {
    headerLeftStack.push({
      text: trimText(sellerBrandName, 40),
      bold: true,
      fontSize: 9,
      color: primaryColor,
      margin: [0, 0, 0, 2],
    })
  }
  headerLeftStack.push({
    text: (order.courier_partner || 'Courier').toUpperCase(),
    fontSize: 8,
    color: '#334155',
    bold: true,
  })

  const dimensionLabel =
    order.length && order.breadth && order.height
      ? `${order.length} x ${order.breadth} x ${order.height} cm`
      : ''
  const weightLines: string[] = []
  if (includeDeadWeight) {
    const deadWeightKg = Number(order.weight ?? order.actual_weight ?? 0) / 1000
    const volumetricWeightKg = Number(order.volumetric_weight ?? 0) / 1000
    const chargeableWeightKg = Number(order.charged_weight ?? order.weight ?? 0) / 1000
    const slabWeightKg =
      order.charged_slabs && chargeableWeightKg
        ? chargeableWeightKg / Number(order.charged_slabs)
        : null
    const slabsApplied = order.charged_slabs ?? null
    const freightValue = Number(order.freight_charges ?? 0)

    weightLines.push(`Dead Weight: ${deadWeightKg ? deadWeightKg.toFixed(3) + ' kg' : '-'}`)
    weightLines.push(
      `Volumetric Weight: ${volumetricWeightKg ? volumetricWeightKg.toFixed(3) + ' kg' : 'calculated'}`,
    )
    weightLines.push(
      `Chargeable Weight: ${chargeableWeightKg ? chargeableWeightKg.toFixed(3) + ' kg' : '-'}`,
    )
    weightLines.push(`Slab: ${slabWeightKg ? (slabWeightKg * 1000).toFixed(0) + ' g' : 'from rate card'}`)
    weightLines.push(`Slabs Applied: ${slabsApplied ?? '-'}`)
    weightLines.push(`Freight: ${formatCurrency(freightValue)}`)
  }
  const shipmentMetricLines: string[] = []
  if (includeDimension && dimensionLabel) {
    shipmentMetricLines.push(`Dimensions: ${dimensionLabel}`)
  }
  if (weightLines.length > 0) {
    shipmentMetricLines.push(...weightLines)
  }

  const headerRightStack: any[] = []
  if (awbEnabled && order.awb_number) {
    headerRightStack.push({
      text: 'AWB',
      color: primaryColor,
      bold: true,
      alignment: 'center',
    })
    headerRightStack.push({
      text: order.awb_number,
      fontSize: 12,
      bold: true,
      alignment: 'center',
      margin: [0, 3, 0, 2],
    })
  }
  if (awbBarcode && isValidDataUrl(awbBarcode)) {
    headerRightStack.push({
      image: awbBarcode,
      width: 128,
      alignment: 'center',
      margin: [0, 3, 0, 4],
    })
  } else if (awbEnabled && images.awbBarcode) {
    headerRightStack.push({
      image: 'awbBarcode',
      width: 118,
      alignment: 'center',
      margin: [0, 3, 0, 4],
    })
  }
  if (showRtoRoutingCode && normalizedSortCode) {
    headerRightStack.push({
      text: `Sort Code: ${normalizedSortCode}`,
      fontSize: 8,
      bold: true,
      alignment: 'center',
      color: primaryColor,
      margin: [0, 0, 0, 1],
    })
  }
  if (showCodBanner) {
    headerRightStack.push({
      text: paymentType === 'cod' ? 'COD' : 'PREPAID',
      fontSize: 8,
      bold: true,
      alignment: 'center',
      color: paymentType === 'cod' ? '#b45309' : '#166534',
      margin: [0, 2, 0, 0],
    })
  }
  pageContent.push({
    table: {
      widths: ['*', 136],
      body: [[{ stack: headerLeftStack }, { stack: headerRightStack }]],
    },
    layout: 'noBorders',
    margin: [0, 0, 0, 6],
  })

  const shipToStack: any[] = [
    { text: 'SHIP TO', bold: true, fontSize: 8, color: primaryColor, margin: [0, 0, 0, 2] },
    { text: trimText(consignee.name, 36), fontSize: 8, bold: true },
    {
      text: trimText(
        [
          consignee.address,
          [consignee.city, consignee.state].filter(Boolean).join(', '),
          consignee.pincode,
        ]
          .filter(Boolean)
          .join(' | '),
        90,
      ),
      fontSize: 7,
      margin: [0, 1, 0, 0],
    },
  ]
  if (showCustomerPhone && consignee.phone) {
    shipToStack.push({ text: `Ph: ${trimText(consignee.phone, 20)}`, fontSize: 7, margin: [0, 1, 0, 0] })
  }

  const fromLine = [
    pickup.warehouse_name,
    pickup.address,
    [pickup.city, pickup.state].filter(Boolean).join(', '),
    pickup.pincode,
  ]
    .filter(Boolean)
    .join(' | ')

  const shipFromStack: any[] = [
    { text: 'SHIP FROM', bold: true, fontSize: 8, color: primaryColor, margin: [0, 0, 0, 2] },
  ]
  if (showShipperAddress) {
    shipFromStack.push({
      text: trimText(fromLine, 90),
      fontSize: 7,
    })
  }
  if (showShipperPhone && pickup.phone) {
    shipFromStack.push({ text: `Ph: ${trimText(pickup.phone, 20)}`, fontSize: 7, margin: [0, 1, 0, 0] })
  }
  if (showShipperGst && pickup.gst_number) {
    shipFromStack.push({
      text: `GSTIN: ${trimText(pickup.gst_number, 25)}`,
      fontSize: 7,
      margin: [0, 1, 0, 0],
    })
  }

  pageContent.push({
    table: {
      widths: ['*', '*'],
      body: [[{ stack: shipToStack }, { stack: shipFromStack }]],
    },
    layout: {
      hLineColor: () => '#dbeafe',
      vLineColor: () => '#dbeafe',
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5,
      fillColor: () => accentColor,
    },
    margin: [0, 0, 0, 5],
  })

  if (shipmentMetricLines.length > 0) {
    pageContent.push({
      table: {
        widths: ['*'],
        body: [
          [{ text: 'Shipment Metrics', bold: true, fontSize: 7, color: primaryColor }],
          [{ text: shipmentMetricLines.join('\n'), fontSize: 7, margin: [0, 1, 0, 0] }],
        ],
      },
      layout: {
        hLineColor: () => '#dbeafe',
        vLineColor: () => '#dbeafe',
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 4,
        paddingBottom: () => 4,
        fillColor: () => accentColor,
      },
      margin: [0, 0, 0, 5],
    })
  }

  const infoLineParts: string[] = []
  if (showOrderId && order.order_number) infoLineParts.push(`Order: ${order.order_number}`)
  if (showInvoiceNumber && order.invoice_number)
    infoLineParts.push(`Invoice: ${order.invoice_number}`)
  if (showOrderDate && order.order_date) infoLineParts.push(`Order Dt: ${order.order_date}`)
  if (showInvoiceDate && order.invoice_date) infoLineParts.push(`Inv Dt: ${order.invoice_date}`)
  if (showDeclaredValue) infoLineParts.push(`Declared: ${formatCurrency(order.order_amount)}`)

  if (infoLineParts.length > 0) {
    pageContent.push({
      text: infoLineParts.join(' | '),
      fontSize: 7,
      margin: [0, 0, 0, 4],
      color: '#334155',
    })
  }

  if (includeProductName && chunk.length > 0) {
    const productHeaders: any[] = []
    const productWidths: any[] = []
    if (includeProductName) {
      productHeaders.push({ text: 'Item', bold: true, fontSize: 7 })
      productWidths.push('*')
    }
    if (includeQty) {
      productHeaders.push({ text: 'Qty', bold: true, fontSize: 7, alignment: 'right' })
      productWidths.push(28)
    }
    if (includeCost) {
      productHeaders.push({ text: 'Price', bold: true, fontSize: 7, alignment: 'right' })
      productWidths.push(42)
    }
    if (includeSku) {
      productHeaders.push({ text: 'SKU', bold: true, fontSize: 7 })
      productWidths.push(46)
    }
    if (includeDimension) {
      productHeaders.push({ text: 'Dim', bold: true, fontSize: 7 })
      productWidths.push(46)
    }
    if (includeDeadWeight) {
      productHeaders.push({ text: 'Weight', bold: true, fontSize: 7, alignment: 'right' })
      productWidths.push(40)
    }

    const productRows = chunk.map((p: any) => {
      const rowCells: any[] = []
      const itemName = p.name ?? p.productName ?? p.box_name ?? '-'
      const qty = Number(p.qty ?? p.quantity ?? 1)
      const price = Number(p.price ?? 0)
      const sku = p.sku ?? p.skuCode ?? '-'
      const dim =
        p.length && p.breadth && p.height
          ? `${p.length}x${p.breadth}x${p.height}`
          : order.length && order.breadth && order.height
          ? `${order.length}x${order.breadth}x${order.height}`
          : '-'
      const deadWeight = order.weight ? `${order.weight}g` : '-'

      if (includeProductName) rowCells.push({ text: trimText(itemName, charLimit), fontSize: 7 })
      if (includeQty) rowCells.push({ text: String(qty), alignment: 'right', fontSize: 7 })
      if (includeCost)
        rowCells.push({ text: formatCurrency(price), alignment: 'right', fontSize: 7 })
      if (includeSku) rowCells.push({ text: trimText(sku, 14), fontSize: 7 })
      if (includeDimension) rowCells.push({ text: trimText(dim, 18), fontSize: 7 })
      if (includeDeadWeight) rowCells.push({ text: deadWeight, alignment: 'right', fontSize: 7 })

      return rowCells
    })

    pageContent.push({
      table: {
        headerRows: 1,
        widths: productWidths,
        body: [productHeaders, ...productRows],
      },
      layout: {
        hLineColor: () => '#e2e8f0',
        vLineColor: () => '#e2e8f0',
        paddingLeft: () => 5,
        paddingRight: () => 5,
        paddingTop: () => 3,
        paddingBottom: () => 3,
      },
      margin: [0, 0, 0, 5],
    })
  }

  if (showOrderValueSection) {
    const productValue = products.reduce((sum: number, p: any) => {
      const qty = toAmount(p?.qty ?? p?.quantity ?? 1)
      const price = toAmount(p?.price)
      const discount = toAmount(p?.discount)
      return sum + Math.max(0, price * qty - discount)
    }, 0)
    const normalizedOrderValue = toAmount(order.order_amount)
    const orderValue = normalizedOrderValue > 0 ? normalizedOrderValue : productValue
    const codCollectibleRaw = toAmount(order.cod_amount ?? order.order_amount)
    const codCollectible =
      paymentType === 'cod'
        ? codCollectibleRaw > 0
          ? codCollectibleRaw
          : orderValue
        : 0

    const summaryParts = [`Order Value: ${formatCurrency(orderValue)}`]
    summaryParts.push(
      paymentType === 'cod'
        ? `Collect on Delivery: ${formatCurrency(codCollectible)}`
        : 'Payment: PREPAID',
    )

    pageContent.push({
      text: summaryParts.join(' | '),
      fontSize: 7,
      margin: [0, 0, 0, 4],
      color: '#334155',
    })
  }

  if (showRto && rto.address) {
    pageContent.push({
      table: {
        widths: ['*'],
        body: [[{ text: `RTO: ${trimText(buildAddress(rto), 120)}`, fontSize: 7, bold: true }]],
      },
      layout: {
        hLineColor: () => '#dbeafe',
        vLineColor: () => '#dbeafe',
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 4,
        paddingBottom: () => 4,
        fillColor: () => '#f8fafc',
      },
      margin: [0, 0, 0, 4],
    })
  }

  const additionalBarcodes: any[] = []
  if (showOrderBarcode && images.orderBarcode) {
    additionalBarcodes.push({
      stack: [
        { text: 'Order Barcode', fontSize: 6, alignment: 'center', color: '#64748b' },
        { image: 'orderBarcode', width: 88, alignment: 'center', margin: [0, 1, 0, 0] },
      ],
    })
  }
  if (showInvoiceBarcode && images.invoiceBarcode) {
    additionalBarcodes.push({
      stack: [
        { text: 'Invoice Barcode', fontSize: 6, alignment: 'center', color: '#64748b' },
        { image: 'invoiceBarcode', width: 88, alignment: 'center', margin: [0, 1, 0, 0] },
      ],
    })
  }
  if (additionalBarcodes.length > 0) {
    pageContent.push({
      stack: [
        { text: 'Reference Barcodes', fontSize: 7, color: primaryColor, bold: true, margin: [0, 0, 0, 2] },
        {
          table: {
            widths: additionalBarcodes.map(() => '*'),
            body: [additionalBarcodes],
          },
          layout: 'noBorders',
        },
      ],
      margin: [0, 1, 0, 5],
    })
  }

  if (showTerms) {
    pageContent.push({
      text: 'T&C: Inspect shipment before accepting. Report issues immediately to support.',
      fontSize: 6,
      color: '#64748b',
      italics: true,
      margin: [0, 1, 0, 2],
    })
  }

  if (showPlatformBranding) {
    const footerStack: any[] = []
    if (images.platformLogo) {
      footerStack.push({ image: 'platformLogo', width: 40, alignment: 'center', margin: [0, 0, 0, 1] })
    }
    footerStack.push({
      text: `Powered by ${settings.powered_by}`,
      fontSize: 6,
      alignment: 'center',
      color: '#94a3b8',
      italics: true,
    })
    pageContent.push({ stack: footerStack, margin: [0, 1, 0, 0] })
  }

  // Push pageContent to pages array - CRITICAL: Without this, label will be empty!
  if (pageContent.length === 0) {
    console.warn('⚠️ pageContent is empty - label may be blank')
  }
  pages.push({ stack: pageContent })

  const docDefinition: any = {
    defaultStyle: { font: 'Helvetica' },
    pageSize: settings.printer_type === 'thermal' ? { width: 288, height: 432 } : 'A4',
    content: pages,
    pageMargins: [10, 10, 10, 10], // Reduced margins for more space
    ...(Object.keys(images).length > 0 && { images }),
  }

  try {
    const printer = new PdfPrinter(fonts)
    const pdfDoc = printer.createPdfKitDocument(docDefinition)
    const chunks: Buffer[] = []
    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      pdfDoc.on('data', (chunk) => chunks.push(chunk))
      pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
      pdfDoc.on('error', (err) => reject(err))
      pdfDoc.end()
    })

    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error('PDF buffer is empty or invalid')
    }

    console.log(
      `📄 PDF generated successfully (${pdfBuffer.length} bytes) for order ${order?.order_number}`,
    )

    // Upload
    const { uploadUrl, key } = await presignUpload({
      filename: `label-${order?.order_number ?? order?.id}.pdf`,
      contentType: 'application/pdf',
      userId,
      folderKey: 'labels',
    })

    if (!uploadUrl || !key) {
      throw new Error('Failed to get presigned URL for label upload')
    }

    const finalUploadUrl = Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl
    const uploadResponse = await axios.put(finalUploadUrl, pdfBuffer, {
      headers: { 'Content-Type': 'application/pdf' },
      validateStatus: (status) => status >= 200 && status < 300, // Only accept 2xx status codes
    })

    // Verify upload succeeded
    if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
      throw new Error(`Label upload failed with status ${uploadResponse.status}`)
    }

    if (!key) {
      throw new Error('Label key is missing after upload')
    }

    const finalKey = Array.isArray(key) ? key[0] : key

    // Validate key is not empty and is a string
    if (!finalKey || typeof finalKey !== 'string' || finalKey.trim().length === 0) {
      throw new Error('Label key is invalid or empty after upload')
    }

    const trimmedKey = finalKey.trim()
    console.log(`✅ Label uploaded successfully: ${trimmedKey} (status: ${uploadResponse.status})`)
    return trimmedKey
  } catch (err: any) {
    console.error(
      `❌ Failed to generate/upload label for order ${order?.order_number}:`,
      err?.message || err,
      err?.stack,
    )
    throw new Error(`Label generation/upload failed: ${err?.message || err}`)
  }
}
