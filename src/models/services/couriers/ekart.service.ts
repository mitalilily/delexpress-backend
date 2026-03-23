import axios, { AxiosInstance } from 'axios'
import {
  DEFAULT_EKART_BASE_URL,
  EkartConfig,
  getEffectiveCourierConfig,
  normalizeEkartBaseUrl,
} from '../courierCredentials.service'
import { HttpError } from '../../../utils/classes'

export type EkartServiceabilityDetail = {
  status: boolean
  pincode: number
  remark?: string
  details?: {
    cod?: boolean
    max_cod_amount?: number
    forward_pickup?: boolean
    forward_drop?: boolean
    reverse_pickup?: boolean
    reverse_drop?: boolean
    city?: string
    state?: string
  }
}

export type EkartCreateShipmentResponse = {
  status: boolean
  remark?: string
  tracking_id?: string
  vendor?: string
  barcodes?: {
    wbn?: string
    order?: string
    cod?: string
  }
}

export type EkartPairServiceabilityResponse = {
  serviceable: boolean
  availability: Record<string, any> | null
  records: any[]
  codAvailable: boolean
  prepaidAvailable: boolean
  tat: number | null
  raw: any
}

export type EkartTrackResponse = {
  _id: string
  track: {
    status: string
    ctime: number
    pickupTime?: number
    desc?: string
    location?: string
    ndrStatus?: string
    attempts?: number
    ndrActions?: string[]
    details?: any[]
  }
  edd?: number
  order_number?: string
}

export class EkartService {
  private baseApi: string = process.env.EKART_BASE_API || DEFAULT_EKART_BASE_URL
  private baseAuth: string = process.env.EKART_BASE_AUTH || DEFAULT_EKART_BASE_URL
  private clientId = process.env.EKART_CLIENT_ID || ''
  private username = process.env.EKART_USERNAME || ''
  private password = process.env.EKART_PASSWORD || ''

  private token: string | null = null
  private tokenExpiry: number | null = null
  private static cachedConfig: EkartConfig | null | undefined

  static clearCachedConfig() {
    EkartService.cachedConfig = undefined
  }

  private log(prefix: string, details: any) {
    console.log(`[Ekart] ${prefix}`, details)
  }

  private normalizeBaseUrl(value?: string | null) {
    return normalizeEkartBaseUrl(value) || DEFAULT_EKART_BASE_URL
  }

  private maskPhone(value: any) {
    const normalized = String(value ?? '').replace(/\D/g, '')
    if (!normalized) return ''
    if (normalized.length <= 4) return normalized
    return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`
  }

  private sanitizeShipmentPayload(payload: any) {
    return {
      order_number: payload?.order_number,
      payment_type: payload?.payment_type ?? payload?.payment_mode ?? null,
      courier_id: payload?.courier_id ?? null,
      package_weight: payload?.package_weight ?? payload?.package?.weight ?? null,
      package_length: payload?.package_length ?? payload?.package?.length ?? null,
      package_breadth: payload?.package_breadth ?? payload?.package?.breadth ?? null,
      package_height: payload?.package_height ?? payload?.package?.height ?? null,
      order_amount: payload?.order_amount ?? payload?.total_amount ?? null,
      collectable_amount: payload?.collectable_amount ?? payload?.cod_amount ?? null,
      tax_value: payload?.tax_value ?? payload?.taxValue ?? null,
      consignee_gst_amount: payload?.consignee_gst_amount ?? payload?.consigneeGstAmount ?? null,
      invoice_number: payload?.invoice_number ?? null,
      invoice_date: payload?.invoice_date ?? null,
      invoice_amount: payload?.invoice_amount ?? null,
      seller_name: payload?.seller_name ?? null,
      consignee_name: payload?.consignee_name ?? payload?.drop?.name ?? null,
      consignee_phone: this.maskPhone(
        payload?.consignee_phone ?? payload?.consignee_alternate_phone ?? payload?.drop?.phone,
      ),
      pickup: payload?.pickup
        ? {
            name: payload.pickup.name ?? payload.seller_name ?? null,
            city: payload.pickup.city,
            state: payload.pickup.state,
            pincode: payload.pickup.pincode,
            phone: this.maskPhone(payload.pickup.phone),
          }
        : payload?.pickup_location
          ? {
              name: payload.pickup_location.name ?? payload.seller_name ?? null,
              city: payload.pickup_location.city ?? null,
              state: payload.pickup_location.state ?? null,
              pincode: payload.pickup_location.pin ?? null,
              phone: this.maskPhone(payload.pickup_location.phone),
            }
          : null,
      consignee: payload?.drop
        ? {
            name: payload.drop.name ?? null,
            city: payload.drop.city,
            state: payload.drop.state,
            pincode: payload.drop.pincode,
            phone: this.maskPhone(payload.drop.phone),
          }
        : null,
      order_items_count: Array.isArray(payload?.items)
        ? payload.items.length
        : Array.isArray(payload?.order_items)
          ? payload.order_items.length
          : 0,
    }
  }

  private toNumber(value: any, fallback = 0) {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : fallback
  }

  private deriveTaxValue(payload: any) {
    const directTaxValue = this.toNumber(payload?.tax_value ?? payload?.taxValue, NaN)
    if (Number.isFinite(directTaxValue) && directTaxValue >= 0) {
      return Number(directTaxValue.toFixed(2))
    }

    const items = Array.isArray(payload?.order_items) ? payload.order_items : []
    const computed = items.reduce((sum: number, item: any) => {
      const qty = this.toNumber(item?.qty ?? item?.quantity, 1)
      const price = this.toNumber(item?.price, 0)
      const discount = this.toNumber(item?.discount, 0)
      const taxRate = this.toNumber(item?.tax_rate ?? item?.taxRate, 0)
      const lineTaxableValue = Math.max(0, price * qty - discount)
      return sum + lineTaxableValue * (taxRate / 100)
    }, 0)

    return Number(Math.max(0, computed).toFixed(2))
  }

  private getNormalizedInvoiceDate(payload: any) {
    const rawValue = String(payload?.invoice_date ?? '').trim()
    if (rawValue) {
      const isoDateMatch = rawValue.match(/^(\d{4}-\d{2}-\d{2})/)
      if (isoDateMatch) return isoDateMatch[1]

      const parsed = new Date(rawValue)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed.toISOString().slice(0, 10)
      }
    }

    return new Date().toISOString().slice(0, 10)
  }

  private sanitizeText(value: any, fallback = '') {
    const normalized = String(value ?? '').trim()
    return normalized || fallback
  }

  private sanitizePhoneNumber(value: any, fallback = '') {
    const digits = String(value ?? '').replace(/\D/g, '')
    if (!digits) return fallback
    return digits.length <= 10 ? digits : digits.slice(-10)
  }

  private normalizePin(value: any, fallback = 0) {
    const digits = String(value ?? '').replace(/\D/g, '')
    if (!digits) return fallback
    return Number(digits.slice(0, 6))
  }

  private buildEkartShipmentPayload(payload: any) {
    const paymentMode =
      String(payload?.payment_type || '').toLowerCase() === 'cod'
        ? 'COD'
        : String(payload?.payment_type || '').toLowerCase() === 'reverse'
          ? 'Pickup'
          : 'Prepaid'

    const rawItems = Array.isArray(payload?.order_items) ? payload.order_items : []
    const normalizedItems = rawItems
      .map((item: any) => {
        const quantity = this.toNumber(item?.qty ?? item?.quantity, 1)
        const price = this.toNumber(item?.price, 0)
        const discount = this.toNumber(item?.discount, 0)
        const taxRate = this.toNumber(item?.tax_rate ?? item?.taxRate, 0)
        const directTaxValue = this.toNumber(item?.tax_value ?? item?.taxValue, NaN)
        const taxableAmount = Math.max(0, price * quantity - discount)
        const taxValue = Number.isFinite(directTaxValue)
          ? directTaxValue
          : Number((taxableAmount * (taxRate / 100)).toFixed(2))

        return {
          name: this.sanitizeText(item?.name, 'Product'),
          sku: this.sanitizeText(item?.sku, 'SKU'),
          quantity: quantity > 0 ? quantity : 1,
          price,
          hsn: this.sanitizeText(item?.hsn ?? item?.hsnCode),
          tax_value: Math.max(0, taxValue),
        }
      })
      .filter((item: any) => item.quantity > 0)

    if (!normalizedItems.length) {
      normalizedItems.push({
        name: 'Package',
        sku: 'PKG',
        quantity: 1,
        price: this.toNumber(payload?.order_amount, 0),
        hsn: '',
        tax_value: 0,
      })
    }

    const totalQuantity = normalizedItems.reduce((sum: number, item: any) => sum + item.quantity, 0)
    const taxableAmount = normalizedItems.reduce(
      (sum: number, item: any) => sum + item.price * item.quantity,
      0,
    )
    const totalTaxValue = Number(
      normalizedItems.reduce((sum: number, item: any) => sum + this.toNumber(item.tax_value, 0), 0).toFixed(2),
    )
    const orderAmount = this.toNumber(payload?.order_amount ?? payload?.invoice_amount, 0)
    const computedTotalAmount = orderAmount > 0 ? orderAmount : taxableAmount + totalTaxValue
    const codAmount = paymentMode === 'COD' ? computedTotalAmount : 0

    const sellerName = this.sanitizeText(payload?.company?.name || payload?.pickup?.name, 'DelExpress')
    const sellerAddress = [
      this.sanitizeText(payload?.pickup?.address),
      this.sanitizeText(payload?.pickup?.address_2),
      this.sanitizeText(payload?.pickup?.city),
      this.sanitizeText(payload?.pickup?.state),
    ]
      .filter(Boolean)
      .join(', ')

    const consigneeName = this.sanitizeText(payload?.consignee?.name, 'Consignee')
    const consigneePhone = this.sanitizePhoneNumber(payload?.consignee?.phone)
    const pickupPhone = this.sanitizePhoneNumber(payload?.pickup?.phone)
    const returnPhone = this.sanitizePhoneNumber(payload?.rto?.phone || payload?.pickup?.phone)

    const pickupContact = {
      name: this.sanitizeText(payload?.pickup?.name, sellerName),
      phone: pickupPhone,
      address1: this.sanitizeText(payload?.pickup?.address),
      address2: this.sanitizeText(payload?.pickup?.address_2),
      city: this.sanitizeText(payload?.pickup?.city),
      state: this.sanitizeText(payload?.pickup?.state),
      pincode: this.normalizePin(payload?.pickup?.pincode),
    }

    const dropContact = {
      name: consigneeName,
      phone: consigneePhone,
      address1: this.sanitizeText(payload?.consignee?.address),
      address2: this.sanitizeText(payload?.consignee?.address_2),
      city: this.sanitizeText(payload?.consignee?.city),
      state: this.sanitizeText(payload?.consignee?.state),
      pincode: this.normalizePin(payload?.consignee?.pincode),
    }

    const returnContact = {
      name: this.sanitizeText(payload?.rto?.name, pickupContact.name),
      phone: returnPhone,
      address1: this.sanitizeText(payload?.rto?.address, pickupContact.address1),
      address2: this.sanitizeText(payload?.rto?.address_2, pickupContact.address2),
      city: this.sanitizeText(payload?.rto?.city, pickupContact.city),
      state: this.sanitizeText(payload?.rto?.state, pickupContact.state),
      pincode: this.normalizePin(payload?.rto?.pincode || payload?.pickup?.pincode),
    }

    const invoiceDate = this.getNormalizedInvoiceDate(payload)
    const invoiceNumber = this.sanitizeText(payload?.invoice_number || payload?.order_number)
    const categoryOfGoods = this.sanitizeText(
      payload?.category_of_goods || normalizedItems.map((item: any) => item.name).join(', '),
      'General Merchandise',
    )

    return {
      trackingId: payload?.order_number,
      referenceId: payload?.order_id || payload?.order_number,
      order_number: payload?.order_number,
      order_id: payload?.order_id,
      order_date: invoiceDate,
      invoice_number: invoiceNumber,
      invoice_date: invoiceDate,
      invoice_amount: computedTotalAmount,
      seller_name: sellerName,
      seller_address: sellerAddress,
      seller_gst_tin: this.sanitizeText(payload?.company?.gst || payload?.pickup?.gst_number),
      seller_gst_amount: totalTaxValue,
      consignee_name: consigneeName,
      consignee_phone: consigneePhone,
      consignee_alternate_phone: consigneePhone,
      consignee_gst_tin: this.sanitizeText(payload?.consignee?.gstin),
      consignee_gst_amount: totalTaxValue,
      integrated_gst_amount: 0,
      category_of_goods: categoryOfGoods,
      products_desc: normalizedItems.map((item: any) => item.name).join(', '),
      paymentType: paymentMode,
      payment_mode: paymentMode,
      codAmount,
      cod_amount: codAmount,
      invoiceAmount: computedTotalAmount,
      total_amount: computedTotalAmount,
      order_amount: computedTotalAmount,
      collectable_amount: codAmount,
      tax_value: totalTaxValue,
      taxable_amount: taxableAmount,
      commodity_value: String(taxableAmount),
      quantity: totalQuantity || 1,
      pickup: pickupContact,
      drop: dropContact,
      returnAddress: returnContact,
      pickup_location: {
        name: this.sanitizeText(
          payload?.pickup_location_alias || payload?.pickup?.warehouse_name || payload?.pickup?.name,
          pickupContact.name,
        ),
      },
      drop_location: {
        name: dropContact.name,
        address: dropContact.address1,
        city: dropContact.city,
        state: dropContact.state,
        pin: dropContact.pincode,
        phone: dropContact.phone,
      },
      return_location: {
        name: this.sanitizeText(
          payload?.return_location_alias || payload?.rto?.warehouse_name || returnContact.name,
          returnContact.name,
        ),
      },
      package: {
        weight: this.toNumber(payload?.package_weight, 0.5),
        length: this.toNumber(payload?.package_length, 10),
        breadth: this.toNumber(payload?.package_breadth, 10),
        height: this.toNumber(payload?.package_height, 10),
        items: normalizedItems,
      },
      items: normalizedItems,
    }
  }

  private extractErrorMessage(err: any, fallback: string) {
    const candidates = [
      err?.response?.data?.description,
      err?.response?.data?.message,
      err?.response?.data?.remark,
      err?.response?.data?.error,
      err?.response?.data?.details?.message,
      err?.message,
    ]

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim()
      }
    }

    return fallback
  }

  private async ensureConfigLoaded() {
    if (EkartService.cachedConfig === undefined) {
      EkartService.cachedConfig = await getEffectiveCourierConfig<EkartConfig>('ekart', 'b2c')
    }
    const cfg = EkartService.cachedConfig
    if (cfg) {
      this.clientId = cfg.clientId || this.clientId
      this.username = cfg.username || this.username
      this.password = cfg.password || this.password
      this.baseApi = cfg.baseApi || this.baseApi
      this.baseAuth = cfg.baseAuth || this.baseAuth
    }

    this.baseApi = this.normalizeBaseUrl(this.baseApi)
    this.baseAuth = this.normalizeBaseUrl(this.baseAuth || this.baseApi)
  }

  private async getHttp(): Promise<AxiosInstance> {
    const token = await this.getAccessToken()
    return axios.create({
      baseURL: this.baseApi,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    })
  }

  private async getAccessToken(): Promise<string> {
    await this.ensureConfigLoaded()

    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) return this.token

    const url = `${this.baseAuth}/integrations/v2/auth/token/${this.clientId}`
    this.log('Auth attempt', {
      url,
      clientId: this.clientId,
      hasUsername: Boolean(this.username),
      hasPassword: Boolean(this.password),
    })

    let res
    try {
      res = await axios.post(url, { username: this.username, password: this.password })
    } catch (err: any) {
      this.log('Auth failed', {
        url,
        status: err?.response?.status || null,
        statusText: err?.response?.statusText || null,
        response: err?.response?.data || null,
        message: err?.message || err,
      })
      throw new HttpError(
        Number(err?.response?.status || 502),
        this.extractErrorMessage(err, 'Ekart authentication failed'),
      )
    }

    const { access_token, expires_in, token_type } = res.data || {}

    if (!access_token || !token_type) {
      throw new Error('Invalid Ekart auth response')
    }

    this.token = access_token
    this.tokenExpiry = Date.now() + (expires_in ? Number(expires_in) * 1000 : 23 * 60 * 60 * 1000)
    return this.token || ''
  }

  // ---------- Serviceability ----------
  async checkPincodeServiceability(pincode: string | number): Promise<EkartServiceabilityDetail> {
    const http = await this.getHttp()
    const normalizedPincode = String(pincode ?? '').trim()
    const candidates = [
      {
        label: 'pincode-check-data',
        method: 'GET',
        url: `/data/serviceability/check/${normalizedPincode}`,
        execute: () => http.get(`/data/serviceability/check/${normalizedPincode}`),
      },
      {
        label: 'pincode-check-legacy',
        method: 'GET',
        url: `/api/v2/serviceability/${normalizedPincode}`,
        execute: () => http.get(`/api/v2/serviceability/${normalizedPincode}`),
      },
    ]

    const failures: Array<Record<string, any>> = []

    for (const candidate of candidates) {
      try {
        const res = await candidate.execute()
        this.log('Pincode serviceability', {
          candidate: candidate.label,
          method: candidate.method,
          url: candidate.url,
          pincode: normalizedPincode,
          status: res.status,
        })
        return res.data
      } catch (err: any) {
        const status = Number(err?.response?.status || 0)
        failures.push({
          candidate: candidate.label,
          method: candidate.method,
          url: candidate.url,
          status: status || null,
          message: this.extractErrorMessage(err, err?.message || 'Request failed'),
        })

        if (![404, 405].includes(status)) {
          throw new HttpError(
            Number(err?.response?.status || 502),
            this.extractErrorMessage(err, 'Ekart pincode serviceability failed'),
          )
        }
      }
    }

    this.log('Pincode serviceability failed', {
      pincode: normalizedPincode,
      failures,
    })
    throw new HttpError(502, 'Ekart pincode serviceability failed')
  }

  async checkPairServiceability(payload: {
    pickupPincode: string
    dropPincode: string
    length: string
    height: string
    width: string
    weight: string
    paymentType: 'COD' | 'Prepaid'
    serviceType?: 'SURFACE' | 'EXPRESS'
    codAmount?: string
    invoiceAmount: string
  }) {
    const http = await this.getHttp()
    const normalizedPaymentType =
      String(payload.paymentType || 'Prepaid').trim().toLowerCase() === 'cod'
        ? 'cod'
        : 'prepaid'
    const normalizedServiceType = String(payload.serviceType || '').trim()
    const normalizedRequest = {
      src: payload.pickupPincode,
      dest: payload.dropPincode,
      payment_type: normalizedPaymentType,
      service_type: normalizedServiceType,
      weight: payload.weight,
      length: payload.length,
      height: payload.height,
      width: payload.width,
      invoice_amount: payload.invoiceAmount,
      cod_amount: payload.codAmount,
      mps: 1,
      pickupPincode: payload.pickupPincode,
      dropPincode: payload.dropPincode,
      paymentType: payload.paymentType,
      serviceType: payload.serviceType,
      invoiceAmount: payload.invoiceAmount,
      codAmount: payload.codAmount,
    }

    const candidates = [
      {
        label: 'global-serviceability',
        method: 'GET',
        url: '/data/global/serviceability',
        execute: () =>
          http.get('/data/global/serviceability', {
            params: {
              src: normalizedRequest.src,
              dest: normalizedRequest.dest,
              payment_type: normalizedRequest.payment_type,
              service_type: normalizedRequest.service_type,
              weight: normalizedRequest.weight,
              mps: normalizedRequest.mps,
            },
          }),
      },
      {
        label: 'vendor-serviceability',
        method: 'POST',
        url: '/data/serviceability/vendor',
        execute: () => http.post('/data/serviceability/vendor', normalizedRequest),
      },
      {
        label: 'legacy-serviceability-v3',
        method: 'POST',
        url: '/data/v3/serviceability',
        execute: () => http.post('/data/v3/serviceability', payload),
      },
    ]

    let res: any = null
    let succeededWith: { label: string; method: string; url: string } | null = null
    const failures: Array<Record<string, any>> = []

    for (const candidate of candidates) {
      try {
        res = await candidate.execute()
        succeededWith = candidate
        break
      } catch (err: any) {
        const status = Number(err?.response?.status || 0)
        failures.push({
          candidate: candidate.label,
          method: candidate.method,
          url: candidate.url,
          status: status || null,
          message: this.extractErrorMessage(err, err?.message || 'Request failed'),
        })

        if (![404, 405].includes(status)) {
          this.log('Serviceability failed', {
            pickup: payload.pickupPincode,
            drop: payload.dropPincode,
            candidate: candidate.label,
            method: candidate.method,
            url: candidate.url,
            status: status || null,
            response: err?.response?.data || null,
            message: err?.message || err,
          })
          throw new HttpError(
            Number(err?.response?.status || 502),
            this.extractErrorMessage(err, 'Ekart serviceability failed'),
          )
        }
      }
    }

    if (!res || !succeededWith) {
      this.log('Serviceability failed', {
        pickup: payload.pickupPincode,
        drop: payload.dropPincode,
        failures,
      })
      const lastFailure = failures[failures.length - 1]
      throw new HttpError(Number(lastFailure?.status || 502), 'Ekart serviceability failed')
    }

    this.log('Serviceability response', {
      candidate: succeededWith.label,
      method: succeededWith.method,
      url: succeededWith.url,
      pickup: payload.pickupPincode,
      drop: payload.dropPincode,
      status: res.status,
    })

    const raw = res.data
    const records = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.records)
        ? raw.records
        : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(raw?.serviceability)
            ? raw.serviceability
            : Array.isArray(raw?.services)
              ? raw.services
              : raw && typeof raw === 'object'
                ? [raw]
                : []

    const availability =
      records.find((record: any) => record && typeof record === 'object') ??
      (raw && typeof raw === 'object' ? raw : null)

    const toBoolean = (...values: any[]) => {
      for (const value of values) {
        if (typeof value === 'boolean') return value
        if (typeof value === 'string') {
          const normalized = value.trim().toLowerCase()
          if (['true', 'yes', 'y', '1', 'serviceable', 'available'].includes(normalized)) {
            return true
          }
          if (['false', 'no', 'n', '0', 'unserviceable', 'unavailable'].includes(normalized)) {
            return false
          }
        }
        if (typeof value === 'number') return value > 0
      }
      return undefined
    }

    const hasTatSignal =
      (typeof availability?.tat === 'number' && availability.tat > 0) ||
      (availability?.tat &&
        typeof availability.tat === 'object' &&
        (Number(availability.tat.min ?? 0) > 0 || Number(availability.tat.max ?? 0) > 0)) ||
      (typeof raw?.tat === 'number' && raw.tat > 0) ||
      (raw?.tat &&
        typeof raw.tat === 'object' &&
        (Number(raw.tat.min ?? 0) > 0 || Number(raw.tat.max ?? 0) > 0))

    const hasChargeSignal = Boolean(
      availability?.forwardDeliveredCharges ||
        availability?.rtoDeliveredCharges ||
        availability?.reverseDeliveredCharges ||
        raw?.forwardDeliveredCharges ||
        raw?.rtoDeliveredCharges ||
        raw?.reverseDeliveredCharges,
    )

    const serviceable =
      toBoolean(
        availability?.is_serviceable,
        availability?.serviceable,
        availability?.available,
        availability?.status,
        raw?.is_serviceable,
        raw?.serviceable,
        raw?.available,
        raw?.status,
      ) ??
      (records.length > 0 && (hasTatSignal || hasChargeSignal))

    const codAvailable =
      toBoolean(
        availability?.cod,
        availability?.is_cod,
        availability?.cod_available,
        raw?.cod,
        raw?.is_cod,
        raw?.cod_available,
      ) ?? true

    const prepaidAvailable =
      toBoolean(
        availability?.prepaid,
        availability?.prepaid_available,
        availability?.is_prepaid,
        raw?.prepaid,
        raw?.prepaid_available,
        raw?.is_prepaid,
      ) ?? true

    const tatCandidates = [
      availability?.tat,
      availability?.tat?.min,
      availability?.tat?.max,
      availability?.tat_days,
      availability?.estimated_delivery_days,
      availability?.eta_days,
      raw?.tat,
      raw?.tat?.min,
      raw?.tat?.max,
      raw?.tat_days,
      raw?.estimated_delivery_days,
      raw?.eta_days,
    ]
    const tat = tatCandidates
      .map((value) => Number(value))
      .find((value) => Number.isFinite(value) && value > 0) ?? null

    return {
      serviceable,
      availability,
      records,
      codAvailable,
      prepaidAvailable,
      tat,
      raw,
    } satisfies EkartPairServiceabilityResponse
  }

  // Backward-compatible alias used by older callers
  async checkServiceability(payload: {
    pickupPincode: string
    dropPincode: string
    length: string
    height: string
    width: string
    weight: string
    paymentType: 'COD' | 'Prepaid'
    serviceType?: 'SURFACE' | 'EXPRESS'
    codAmount?: string
    invoiceAmount: string
  }) {
    return this.checkPairServiceability(payload)
  }

  // ---------- Booking ----------
  async createShipment(payload: any): Promise<EkartCreateShipmentResponse> {
    const http = await this.getHttp()
    const endpoint = '/api/v1/package/create'
    const normalizedPayload = this.buildEkartShipmentPayload(payload)
    const sanitizedPayload = this.sanitizeShipmentPayload(normalizedPayload)

    this.log('Create shipment request', {
      baseApi: this.baseApi,
      endpoint,
      payload: sanitizedPayload,
    })

    try {
      const res = await http.put(endpoint, normalizedPayload)
      this.log('Create shipment response', {
        baseApi: this.baseApi,
        endpoint,
        status: res.status,
        data: res.data,
      })
      return res.data
    } catch (err: any) {
      this.log('Create shipment failed', {
        baseApi: this.baseApi,
        endpoint,
        payload: sanitizedPayload,
        status: err?.response?.status || null,
        statusText: err?.response?.statusText || null,
        response: err?.response?.data || null,
        message: err?.message || err,
      })

      throw new HttpError(
        Number(err?.response?.status || 502),
        this.extractErrorMessage(err, 'Ekart shipment creation failed'),
      )
    }
  }

  async cancelShipment(trackingId: string) {
    const http = await this.getHttp()
    const res = await http.delete('/api/v1/package/cancel', { params: { tracking_id: trackingId } })
    return res.data
  }

  async updateDispatchDate(ids: string[], dispatchDate: string) {
    const http = await this.getHttp()
    const res = await http.post('/data/shipment/dispatch-date', { ids, dispatchDate })
    return res.data
  }

  async updateEwbn(id: string, ewbn: string) {
    const http = await this.getHttp()
    const res = await http.post('/data/shipment/ewbn', { id, ewbn })
    return res.data
  }

  // ---------- Tracking ----------
  async track(trackingId: string): Promise<EkartTrackResponse> {
    const http = await this.getHttp()
    const res = await http.get(`/api/v1/track/${trackingId}`)
    return res.data
  }

  async trackWbn(wbn: string) {
    const http = await this.getHttp()
    const res = await http.get(`/data/v1/elite/track/${wbn}`)
    return res.data
  }

  // ---------- Labels & Manifest ----------
  async downloadLabels(ids: string[], jsonOnly = false) {
    const http = await this.getHttp()
    const res = await http.post(
      '/api/v1/package/label',
      { ids },
      {
        params: { json_only: jsonOnly },
        responseType: jsonOnly ? 'json' : 'arraybuffer',
      },
    )
    return res.data
  }

  async generateManifest(ids: string[]) {
    const http = await this.getHttp()
    const res = await http.post('/data/v2/generate/manifest', { ids }, { responseType: 'json' })
    return res.data
  }

  // ---------- Address sync ----------
  async addAddress(payload: {
    alias: string
    phone: string | number
    address_line1: string
    address_line2?: string | null
    pincode: string | number
    city: string
    state: string
    country?: string
    geo?: { lat?: number; lon?: number }
  }) {
    const http = await this.getHttp()
    const body = {
      alias: payload.alias,
      phone: Number(payload.phone),
      address_line1: payload.address_line1,
      address_line2: payload.address_line2 ?? null,
      pincode: Number(payload.pincode),
      city: payload.city,
      state: payload.state,
      country: payload.country || 'India',
      geo: payload.geo ?? {},
    }
    const res = await http.post('/api/v2/address', body)
    return res.data
  }

  // Backward-compatible alias used by pickup registration flow
  async createWarehouse(payload: any) {
    return this.addAddress({
      alias: payload?.alias || payload?.name || 'Warehouse',
      phone: payload?.phone || payload?.contactPhone || 0,
      address_line1: payload?.addressLine1 || payload?.address_line1 || '',
      address_line2: payload?.addressLine2 || payload?.address_line2 || null,
      pincode: payload?.pincode || '',
      city: payload?.city || '',
      state: payload?.state || '',
      country: payload?.country || 'India',
    })
  }

  // ---------- NDR ----------
  async ndrAction(payload: {
    action: 'Re-Attempt' | 'RTO'
    wbn: string
    date?: number
    phone?: string
    address?: string
    instructions?: string
    links?: string[]
  }) {
    const http = await this.getHttp()
    const res = await http.post('/api/v2/package/ndr', payload)
    return res.data
  }

  // Backward-compatible alias used by NDR controllers
  async submitNdrAction(payload: any) {
    return this.ndrAction(payload)
  }
}
