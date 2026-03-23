import axios, { AxiosInstance } from 'axios'
import { eq } from 'drizzle-orm'
import { HttpError } from '../../../utils/classes'
import { db } from '../../client'
import { courier_credentials } from '../../schema/courierCredentials'
import { XpressbeesConfig, getEffectiveCourierConfig } from '../courierCredentials.service'

export type XpressbeesServiceabilityRecord = {
  id: string
  name: string
  freight_charges?: number
  cod_charges?: number
  total_charges?: number
  min_weight?: number
  chargeable_weight?: number
  [key: string]: any
}

export type XpressbeesServiceabilityResponse = {
  serviceable: boolean
  records: XpressbeesServiceabilityRecord[]
  codAvailable: boolean
  prepaidAvailable: boolean
  tat: number | null
  raw: any
}

export type XpressbeesShipmentResponse = {
  status: boolean
  data?: {
    order_id?: number | string
    shipment_id?: number | string
    awb_number?: string
    courier_id?: string
    courier_name?: string
    status?: string
    additional_info?: string
    payment_type?: string
    fwd_destination_code?: string
    label?: string
    manifest?: string
  }
  message?: string
  [key: string]: any
}

export class XpressbeesService {
  private baseApi = process.env.XPRESSBEES_API_BASE || 'https://shipment.xpressbees.com'
  private apiToken = process.env.XPRESSBEES_API_TOKEN || ''
  private username = process.env.XPRESSBEES_USERNAME || ''
  private password = process.env.XPRESSBEES_PASSWORD || ''
  private tokenEndpoint = process.env.XPRESSBEES_TOKEN_ENDPOINT || '/api/users/login'
  private shipmentEndpoint = process.env.XPRESSBEES_SHIPMENT_ENDPOINT || '/api/shipments2'
  private reverseShipmentEndpoint =
    process.env.XPRESSBEES_REVERSE_SHIPMENT_ENDPOINT || '/api/reverseshipments'

  private static cachedConfig: XpressbeesConfig | null | undefined

  static clearCachedConfig() {
    XpressbeesService.cachedConfig = undefined
  }

  private log(prefix: string, details: any) {
    console.log(`[Xpressbees] ${prefix}`, details)
  }

  private sanitizeForLogs(value: any, keyPath = ''): any {
    if (value == null) return value
    if (Array.isArray(value)) {
      return value.map((item, index) => this.sanitizeForLogs(item, `${keyPath}[${index}]`))
    }

    if (typeof value === 'object') {
      const result: Record<string, any> = {}
      for (const [key, nested] of Object.entries(value)) {
        const nextPath = keyPath ? `${keyPath}.${key}` : key
        const loweredKey = key.toLowerCase()

        if (
          [
            'authorization',
            'password',
            'token',
            'api_token',
            'apikey',
            'apikey',
            'secret',
          ].includes(loweredKey)
        ) {
          result[key] = nested ? '[redacted]' : nested
          continue
        }

        if (loweredKey === 'phone' || loweredKey === 'alternate_phone') {
          const normalized = String(nested ?? '').replace(/\D/g, '')
          result[key] =
            normalized.length > 4
              ? `${normalized.slice(0, 2)}****${normalized.slice(-2)}`
              : normalized
          continue
        }

        if (loweredKey === 'email' || loweredKey === 'username' || loweredKey === 'login_id') {
          const normalized = String(nested ?? '').trim()
          if (!normalized || !normalized.includes('@')) {
            result[key] = normalized ? `${normalized.slice(0, 2)}***` : normalized
          } else {
            const [local, domain] = normalized.split('@')
            result[key] = `${local.slice(0, 2)}***@${domain}`
          }
          continue
        }

        if (loweredKey.startsWith('address')) {
          result[key] = nested ? '[address redacted]' : nested
          continue
        }

        result[key] = this.sanitizeForLogs(nested, nextPath)
      }
      return result
    }

    if (typeof value === 'string') {
      if (keyPath.toLowerCase().includes('label')) {
        return value.length > 120 ? `${value.slice(0, 120)}...` : value
      }
      return value
    }

    return value
  }

  private async ensureConfigLoaded() {
    if (XpressbeesService.cachedConfig === undefined) {
      XpressbeesService.cachedConfig = await getEffectiveCourierConfig<XpressbeesConfig>(
        'xpressbees',
        'b2c',
      )
    }

    const cfg = XpressbeesService.cachedConfig
    if (cfg) {
      this.baseApi = cfg.apiBase || this.baseApi
      this.apiToken = cfg.apiToken || this.apiToken
      this.username = cfg.email || this.username
      this.password = cfg.password || this.password
    }
    this.baseApi = this.normalizeBaseApi(this.baseApi)
    this.log('Config loaded', {
      baseApi: this.baseApi,
      hasApiToken: Boolean(this.apiToken),
      hasUsername: Boolean(this.username),
      hasPassword: Boolean(this.password),
      source: cfg ? 'courier_credentials_or_env_fallback' : 'env_only',
    })
  }

  private normalizeBaseApi(value: string): string {
    const base = String(value || '').trim() || 'https://shipment.xpressbees.com'
    return base.replace(/\/+$/, '')
  }

  private buildEndpoint(path: string): string {
    return this.buildEndpointForBase(this.baseApi, path)
  }

  private buildEndpointForBase(baseApi: string, path: string): string {
    const normalizedPath = `/${String(path || '').replace(/^\/+/, '')}`
    const baseHasApiSuffix = /\/api$/i.test(baseApi)
    if (baseHasApiSuffix && normalizedPath.startsWith('/api/')) {
      return normalizedPath.replace(/^\/api/i, '')
    }
    return normalizedPath
  }

  private getBaseCandidates(): string[] {
    const candidates = new Set<string>()
    const push = (value: string) => {
      const normalized = this.normalizeBaseApi(value)
      if (normalized) candidates.add(normalized)
    }

    push(this.baseApi)

    const rawEnvAlternates = String(process.env.XPRESSBEES_ALT_API_BASE || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    for (const alt of rawEnvAlternates) push(alt)

    const currentBaseWithoutApi = this.baseApi.replace(/\/api$/i, '')
    if (/shipment\.xpressbees\.com/i.test(currentBaseWithoutApi)) {
      push(
        currentBaseWithoutApi.replace(/shipment\.xpressbees\.com/i, 'xbclientapi.xpressbees.com'),
      )
      push(
        `${currentBaseWithoutApi.replace(/shipment\.xpressbees\.com/i, 'xbclientapi.xpressbees.com')}/api`,
      )
    }
    if (/xbclientapi\.xpressbees\.com/i.test(currentBaseWithoutApi)) {
      push(
        currentBaseWithoutApi.replace(/xbclientapi\.xpressbees\.com/i, 'shipment.xpressbees.com'),
      )
      push(
        `${currentBaseWithoutApi.replace(/xbclientapi\.xpressbees\.com/i, 'shipment.xpressbees.com')}/api`,
      )
    }

    return Array.from(candidates)
  }

  private createHttpClient(baseURL: string, token: string): AxiosInstance {
    return axios.create({
      baseURL,
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })
  }

  private isRetryableEndpointError(err: any): boolean {
    const status = Number(err?.response?.status || 0)
    return status === 404 || status === 405
  }

  private extractErrorMessage(err: any, fallback: string): string {
    const candidates = [
      err?.response?.data?.message,
      err?.response?.data?.description,
      err?.response?.data?.error,
      err?.message,
    ]

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim()
      }
    }

    return fallback
  }

  private async requestWithFallback<T>({
    method,
    pathCandidates,
    data,
    logPayload = true,
  }: {
    method: 'get' | 'post'
    pathCandidates: string[]
    data?: any
    logPayload?: boolean
  }): Promise<T> {
    await this.ensureConfigLoaded()
    const token = await this.getApiToken()
    const baseCandidates = this.getBaseCandidates()
    const dedupedPaths = Array.from(new Set(pathCandidates.filter(Boolean)))
    let lastError: any = null
    const attemptedUrls: string[] = []

    for (const baseCandidate of baseCandidates) {
      const http = this.createHttpClient(baseCandidate, token)
      for (const pathCandidate of dedupedPaths) {
        const requestPath = this.buildEndpointForBase(baseCandidate, pathCandidate)
        const requestUrl = `${baseCandidate}${requestPath}`
        attemptedUrls.push(requestUrl)
        try {
          this.log('API attempt', {
            method,
            url: requestUrl,
            payload: logPayload ? this.sanitizeForLogs(data) : undefined,
          })
          const response = await http.request<T>({
            method,
            url: requestPath,
            data,
          })

          if (baseCandidate !== this.baseApi) {
            this.log('Resolved alternate Xpressbees base URL', {
              previousBaseApi: this.baseApi,
              resolvedBaseApi: baseCandidate,
            })
            this.baseApi = baseCandidate
          }

          this.log('API response', {
            method,
            url: requestUrl,
            payload: logPayload ? this.sanitizeForLogs(data) : undefined,
            response: this.sanitizeForLogs(response.data),
          })

          return response.data
        } catch (err: any) {
          lastError = err
          this.log('API attempt failed', {
            method,
            url: requestUrl,
            payload: logPayload ? this.sanitizeForLogs(data) : undefined,
            status: err?.response?.status || null,
            statusText: err?.response?.statusText || null,
            response:
              typeof err?.response?.data === 'string'
                ? err.response.data.slice(0, 300)
                : this.sanitizeForLogs(err?.response?.data) || null,
            message: err?.message || err,
          })

          if (!this.isRetryableEndpointError(err)) {
            throw err
          }
        }
      }
    }

    const allAttemptsWereEndpointMisses =
      attemptedUrls.length > 0 &&
      this.isRetryableEndpointError(lastError) &&
      attemptedUrls.length >= dedupedPaths.length

    if (allAttemptsWereEndpointMisses) {
      throw new HttpError(
        502,
        ` API endpoint not found for the configured base URL. Tried: ${attemptedUrls.join(
          ', ',
        )}. Verify the  API base URL in courier credentials and confirm your account's shipment endpoint.`,
      )
    }

    if (lastError) {
      throw new HttpError(
        Number(lastError?.response?.status || 502),
        this.extractErrorMessage(lastError, 'Xpressbees API request failed'),
      )
    }

    throw lastError
  }

  private async getHttp(): Promise<AxiosInstance> {
    await this.ensureConfigLoaded()
    const token = await this.getApiToken()

    return this.createHttpClient(this.baseApi, token)
  }

  private extractTokenFromResponse(raw: any): string {
    const fromDirectCandidates = [
      raw?.token,
      raw?.access_token,
      raw?.jwt,
      raw?.data?.token,
      raw?.data?.access_token,
      raw?.data?.jwt,
      raw?.data?.accessToken,
      raw?.accessToken,
      raw?.result?.token,
      raw?.result?.access_token,
      raw?.result?.accessToken,
      raw?.data?.data?.token,
      raw?.data?.data?.access_token,
      raw?.data?.data?.accessToken,
      raw?.data?.jwt_token,
      raw?.data?.auth_token,
      raw?.auth_token,
      raw?.data?.authToken,
      raw?.authToken,
    ]

    for (const candidate of fromDirectCandidates) {
      const token = String(candidate || '').trim()
      if (token) return token
    }

    const visited = new Set<any>()
    const deepSearch = (value: any): string => {
      if (!value || typeof value !== 'object') return ''
      if (visited.has(value)) return ''
      visited.add(value)

      if (Array.isArray(value)) {
        for (const item of value) {
          const token = deepSearch(item)
          if (token) return token
        }
        return ''
      }

      for (const [key, nested] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase()
        if (
          [
            'token',
            'access_token',
            'accesstoken',
            'jwt',
            'jwt_token',
            'auth_token',
            'authtoken',
          ].includes(normalizedKey)
        ) {
          const token = String(nested || '').trim()
          if (token) return token
        }
      }

      for (const nested of Object.values(value)) {
        const token = deepSearch(nested)
        if (token) return token
      }

      return ''
    }

    const recursiveToken = deepSearch(raw)
    if (recursiveToken) return recursiveToken

    const candidates = [raw?.data, raw?.result]

    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const token = candidate.trim()
        if (token && token.length > 20 && !token.startsWith('{')) return token
      }
    }
    return ''
  }

  private async persistGeneratedToken(token: string) {
    try {
      await db
        .update(courier_credentials)
        .set({
          apiKey: token,
          updatedAt: new Date(),
        })
        .where(eq(courier_credentials.provider, 'xpressbees'))
      this.log('Persisted generated API token to courier credentials', {
        tokenPreview: `${token.slice(0, 4)}...${token.slice(-4)}`,
      })
    } catch (err: any) {
      this.log('Token persist skipped', err?.message || err)
    }
  }

  private async generateApiToken(): Promise<string> {
    await this.ensureConfigLoaded()

    if (!this.username || !this.password) {
      throw new Error(
        'Xpressbees API token is not configured and username/password are missing. Save bearer token or login credentials in courier credentials.',
      )
    }

    const loginHttp = axios.create({
      baseURL: this.baseApi,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    })

    const payloadVariants = [
      { email: this.username, password: this.password },
      { username: this.username, password: this.password },
      { login_id: this.username, password: this.password },
    ]
    const endpointCandidates = Array.from(
      new Set(
        [
          this.tokenEndpoint,
          '/api/users/login',
          '/api/login',
          '/api/generate-token',
          '/api/token',
          '/api/auth/login',
        ].filter(Boolean),
      ),
    )

    let lastError: any = null
    this.log('Generating API token', {
      baseApi: this.baseApi,
      endpointCandidates,
      hasUsername: Boolean(this.username),
      hasPassword: Boolean(this.password),
      tokenEndpointOverride: process.env.XPRESSBEES_TOKEN_ENDPOINT || null,
    })

    for (const endpoint of endpointCandidates) {
      for (const body of payloadVariants) {
        try {
          const requestPath = this.buildEndpoint(endpoint)
          this.log('Auth attempt', {
            url: `${this.baseApi}${requestPath}`,
            payloadKeys: Object.keys(body),
            login: this.username,
          })
          const res = await loginHttp.post(requestPath, body)
          const token = this.extractTokenFromResponse(res.data)
          this.log('Auth response', {
            url: `${this.baseApi}${requestPath}`,
            status: res.status,
            hasToken: Boolean(token),
            responseKeys: Object.keys(res.data || {}),
          })
          if (!token) {
            this.log('Auth response body (no token extracted)', {
              url: `${this.baseApi}${requestPath}`,
              body:
                typeof res.data === 'string'
                  ? res.data.slice(0, 500)
                  : JSON.stringify(res.data).slice(0, 1000),
            })
          }
          if (token) {
            this.apiToken = token
            this.tokenEndpoint = endpoint
            await this.persistGeneratedToken(token)
            this.log('Generated API token via login credentials', {
              endpoint,
              login: this.username,
            })
            return token
          }
        } catch (err: any) {
          lastError = err
          this.log('Auth attempt failed', {
            url: `${this.baseApi}${this.buildEndpoint(endpoint)}`,
            payloadKeys: Object.keys(body),
            status: err?.response?.status || null,
            statusText: err?.response?.statusText || null,
            response:
              typeof err?.response?.data === 'string'
                ? err.response.data.slice(0, 300)
                : err?.response?.data || null,
            message: err?.message || err,
          })
        }
      }
    }

    throw new Error(
      `Failed to generate Xpressbees API token. Tried ${endpointCandidates.join(', ')}. ${
        lastError?.response?.data?.message || lastError?.message || 'unknown error'
      }. Set XPRESSBEES_TOKEN_ENDPOINT if your account uses a different login path.`,
    )
  }

  async getApiToken(forceRefresh = false): Promise<string> {
    await this.ensureConfigLoaded()
    if (!forceRefresh && this.apiToken) return this.apiToken
    return this.generateApiToken()
  }

  async checkServiceability(payload: {
    origin: string
    destination: string
    payment_type: 'cod' | 'prepaid'
    order_amount: string
    weight: string
    length: string
    breadth: string
    height: string
  }): Promise<XpressbeesServiceabilityResponse> {
    const raw = await this.requestWithFallback<any>({
      method: 'post',
      pathCandidates: ['/api/courier/serviceability', '/courier/serviceability'],
      data: payload,
    })
    const records = Array.isArray(raw?.data) ? raw.data : []
    const status = raw?.status === true

    this.log('Serviceability', {
      origin: payload.origin,
      destination: payload.destination,
      status,
      records: records.length,
    })

    return {
      serviceable: status && records.length > 0,
      records,
      codAvailable:
        payload.payment_type === 'prepaid'
          ? true
          : records.some(
              (record: XpressbeesServiceabilityRecord) => Number(record?.cod_charges ?? 0) >= 0,
            ),
      prepaidAvailable: true,
      tat: null,
      raw,
    }
  }

  async listNdr() {
    return this.requestWithFallback<any>({
      method: 'get',
      pathCandidates: ['/api/ndr', '/ndr'],
    })
  }

  async listCouriers() {
    return this.requestWithFallback<any>({
      method: 'get',
      pathCandidates: ['/api/courier', '/courier'],
    })
  }

  async submitNdrAction(payload: any[]) {
    const items = Array.isArray(payload) ? payload : [payload]
    return this.requestWithFallback<any>({
      method: 'post',
      pathCandidates: ['/api/ndr/create', '/ndr/create'],
      data: items,
    })
  }

  async createShipment(payload: any): Promise<XpressbeesShipmentResponse> {
    const body = {
      order_number: payload.order_number,
      unique_order_number: payload.unique_order_number || 'no',
      shipping_charges: Number(payload.shipping_charges ?? 0),
      discount: Number(payload.discount ?? 0),
      cod_charges: Number(payload.cod_charges ?? 0),
      payment_type: payload.payment_type,
      order_amount: Number(payload.order_amount ?? 0),
      package_weight: Number(payload.package_weight ?? 0),
      package_length: Number(payload.package_length ?? 0),
      package_breadth: Number(payload.package_breadth ?? 0),
      package_height: Number(payload.package_height ?? 0),
      request_auto_pickup:
        String(payload.request_auto_pickup || '').toLowerCase() === 'yes' ? 'yes' : 'no',
      consignee: {
        name: payload?.consignee?.name,
        address: payload?.consignee?.address,
        address_2: payload?.consignee?.address_2 || '',
        city: payload?.consignee?.city,
        state: payload?.consignee?.state,
        pincode: String(payload?.consignee?.pincode || ''),
        phone: String(payload?.consignee?.phone || ''),
      },
      pickup: {
        warehouse_name: payload?.pickup?.warehouse_name,
        name: payload?.pickup?.name,
        address: payload?.pickup?.address,
        address_2: payload?.pickup?.address_2 || '',
        city: payload?.pickup?.city,
        state: payload?.pickup?.state,
        pincode: String(payload?.pickup?.pincode || ''),
        phone: String(payload?.pickup?.phone || ''),
      },
      is_rto_different: payload?.is_rto_different || 'no',
      ...(payload?.rto
        ? {
            rto: {
              warehouse_name: payload.rto.warehouse_name,
              name: payload.rto.name,
              address: payload.rto.address,
              address_2: payload.rto.address_2 || '',
              city: payload.rto.city,
              state: payload.rto.state,
              pincode: String(payload.rto.pincode || ''),
              phone: String(payload.rto.phone || ''),
            },
          }
        : {}),
      order_items: Array.isArray(payload?.order_items)
        ? payload.order_items.map((item: any) => ({
            name: item?.name,
            qty: String(item?.qty ?? 1),
            price: String(item?.price ?? 0),
            sku: item?.sku || '',
          }))
        : [],
      courier_id: payload?.courier_id ? String(payload.courier_id) : '',
      collectable_amount:
        payload?.payment_type === 'cod'
          ? String(payload?.collectable_amount ?? payload?.order_amount ?? 0)
          : '0',
    }
    return this.requestWithFallback<XpressbeesShipmentResponse>({
      method: 'post',
      pathCandidates: [
        this.shipmentEndpoint,
        '/api/shipments2',
        '/shipments2',
        '/api/shipments',
        '/shipments',
      ],
      data: body,
    })
  }

  async createReverseShipment(payload: any): Promise<XpressbeesShipmentResponse> {
    const body = {
      order_id: payload.order_id,
      request_auto_pickup:
        String(payload.request_auto_pickup || '').toLowerCase() === 'yes' ? 'yes' : 'no',
      consignee: {
        name: payload?.consignee?.name,
        address: payload?.consignee?.address,
        address_2: payload?.consignee?.address_2 || '',
        city: payload?.consignee?.city,
        state: payload?.consignee?.state,
        pincode: String(payload?.consignee?.pincode || ''),
        phone: String(payload?.consignee?.phone || ''),
        alternate_phone: String(payload?.consignee?.alternate_phone || ''),
      },
      pickup: {
        warehouse_name: payload?.pickup?.warehouse_name,
        name: payload?.pickup?.name,
        address: payload?.pickup?.address,
        address_2: payload?.pickup?.address_2 || '',
        city: payload?.pickup?.city,
        state: payload?.pickup?.state,
        pincode: String(payload?.pickup?.pincode || ''),
        phone: String(payload?.pickup?.phone || ''),
      },
      categories: payload?.categories || 'General',
      product_name: payload?.product_name || 'Return Item',
      product_qty: String(payload?.product_qty ?? 1),
      product_amount: String(payload?.product_amount ?? payload?.order_amount ?? 0),
      package_weight: Number(payload?.package_weight ?? 0),
      package_length: String(payload?.package_length ?? 0),
      package_breadth: String(payload?.package_breadth ?? 0),
      package_height: String(payload?.package_height ?? 0),
      qccheck: String(payload?.qccheck ?? '0'),
      uploadedimage: payload?.uploadedimage || '',
      uploadedimage_2: payload?.uploadedimage_2 || '',
      uploadedimage_3: payload?.uploadedimage_3 || '',
      uploadedimage_4: payload?.uploadedimage_4 || '',
      product_usage: String(payload?.product_usage ?? '0'),
      product_damage: String(payload?.product_damage ?? '0'),
      brandname: String(payload?.brandname ?? '0'),
      brandnametype: payload?.brandnametype || '',
      productsize: String(payload?.productsize ?? '0'),
      productsizetype: payload?.productsizetype || '',
      productcolor: String(payload?.productcolor ?? '0'),
      productcolourtype: payload?.productcolourtype || '',
    }
    return this.requestWithFallback<XpressbeesShipmentResponse>({
      method: 'post',
      pathCandidates: [
        this.reverseShipmentEndpoint,
        '/api/reverseshipments',
        '/reverseshipments',
        '/api/reverse-shipments',
        '/reverse-shipments',
      ],
      data: body,
    })
  }

  async generateManifest(awbs: string[]) {
    return this.requestWithFallback<any>({
      method: 'post',
      pathCandidates: [
        `${this.shipmentEndpoint}/manifest`,
        '/api/shipments2/manifest',
        '/shipments2/manifest',
        '/api/shipments/manifest',
        '/shipments/manifest',
      ],
      data: { awbs },
    })
  }

  async cancelShipment(awb: string) {
    return this.requestWithFallback<any>({
      method: 'post',
      pathCandidates: [
        `${this.shipmentEndpoint}/cancel`,
        '/api/shipments2/cancel',
        '/shipments2/cancel',
        '/api/shipments/cancel',
        '/shipments/cancel',
      ],
      data: { awb },
    })
  }
}
