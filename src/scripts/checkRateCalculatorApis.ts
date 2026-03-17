/* eslint-disable @typescript-eslint/no-var-requires */
import assert from 'node:assert/strict'

type MockReq = {
  body?: Record<string, any>
  query?: Record<string, any>
  user?: { sub?: string }
  userId?: string
}

type MockRes = {
  statusCode: number
  body: any
  status: (code: number) => MockRes
  json: (payload: any) => MockRes
}

const createRes = (): MockRes => {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: any) {
      this.body = payload
      return this
    },
  }
  return res
}

const run = async () => {
  const shiprocketService = require('../models/services/shiprocket.service')
  const b2bAdminService = require('../models/services/b2bAdmin.service')

  const originalFetchB2C = shiprocketService.fetchAvailableCouriersWithRates
  const originalFetchB2B = shiprocketService.fetchAvailableCouriersWithRatesB2B
  const originalFetchAdmin = shiprocketService.fetchAvailableCouriersWithRatesAdmin
  const originalCalculateB2BRate = b2bAdminService.calculateB2BRate

  let b2cCall: any = null
  let b2bCall: any = null
  let adminCall: any = null
  let calcCall: any = null

  try {
    shiprocketService.fetchAvailableCouriersWithRates = async (params: any, userId: string) => {
      b2cCall = { params, userId }
      return [{ id: 1, name: 'Mock B2C', rate: 100, edd: '2 Days' }]
    }

    shiprocketService.fetchAvailableCouriersWithRatesB2B = async (params: any, userId: string) => {
      b2bCall = { params, userId }
      return [{ id: 2, name: 'Mock B2B', rate: 200, edd: '3 Days' }]
    }

    shiprocketService.fetchAvailableCouriersWithRatesAdmin = async (
      params: any,
      planId: string,
    ) => {
      adminCall = { params, planId }
      return [{ id: 3, name: 'Mock Admin', rate: 250, edd: '4 Days' }]
    }

    b2bAdminService.calculateB2BRate = async (params: any) => {
      calcCall = params
      return {
        rate: 321,
        charges: { total: 321, baseFreight: 300, overheads: [] },
        origin: { zoneCode: 'A' },
        destination: { zoneCode: 'B' },
      }
    }

    const { fetchAvailableCouriersToUser } = require('../controllers/courierIntegration.controller')
    const { fetchAvailableCouriersForAdmin } = require('../controllers/admin/courier.controller')
    const { calculateRateController } = require('../controllers/admin/b2b/b2bAdmin.controller')
    const { getShippingRatesController } = require('../controllers/externalApi/shipping.controller')

    {
      const req: MockReq = { body: { destination: 110001 }, user: { sub: 'user-1' } }
      const res = createRes()
      await fetchAvailableCouriersToUser(req as any, res as any)
      assert.equal(res.statusCode, 400)
      assert.equal(res.body?.success, false)
    }

    {
      const req: MockReq = {
        body: {
          origin: 400001,
          destination: 560001,
          payment_type: 'cod',
          order_amount: 1500,
          shipment_type: 'b2c',
          weight: 750,
          length: 10,
          breadth: 10,
          height: 10,
          context: 'rate_calculator',
        },
        user: { sub: 'user-1' },
      }
      const res = createRes()
      await fetchAvailableCouriersToUser(req as any, res as any)
      assert.equal(res.statusCode, 200)
      assert.equal(res.body?.success, true)
      assert.equal(res.body?.data?.[0]?.name, 'Mock B2C')
      assert.equal(b2cCall?.userId, 'user-1')
      assert.equal(b2cCall?.params?.isCalculator, true)
    }

    {
      const req: MockReq = {
        body: {
          origin: 400001,
          destination: 560001,
          payment_type: 'prepaid',
          shipment_type: 'b2b',
          weight: 5000,
        },
        user: { sub: 'user-2' },
      }
      const res = createRes()
      await fetchAvailableCouriersToUser(req as any, res as any)
      assert.equal(res.statusCode, 200)
      assert.equal(res.body?.success, true)
      assert.equal(res.body?.data?.[0]?.name, 'Mock B2B')
      assert.equal(b2bCall?.params?.shipment_type, 'b2b')
      assert.equal(b2bCall?.userId, 'user-2')
    }

    {
      const req: MockReq = { body: { destination: 560001 }, userId: 'api-user' }
      const res = createRes()
      await getShippingRatesController(req as any, res as any)
      assert.equal(res.statusCode, 200)
      assert.equal(res.body?.success, true)
      assert.ok(Array.isArray(res.body?.data?.rates))
      assert.equal(res.body?.data?.rates?.[0]?.courier_name, 'Mock B2C')
    }

    {
      const req: MockReq = {
        body: {
          origin: 400001,
          destination: 560001,
          payment_type: 'cod',
          order_amount: 1200,
          weight: 1000,
          length: 12,
          breadth: 10,
          height: 8,
          context: 'rate_calculator',
        },
      }
      const res = createRes()
      await fetchAvailableCouriersForAdmin(req as any, res as any)
      assert.equal(res.statusCode, 200)
      assert.equal(res.body?.success, true)
      assert.equal(res.body?.data?.[0]?.name, 'Mock Admin')
      assert.equal(adminCall?.params?.isCalculator, true)
    }

    {
      const req: MockReq = {
        body: {
          originPincode: '400001',
          destinationPincode: '560001',
          weightKg: 12.5,
          paymentMode: 'COD',
          invoiceValue: 2500,
          courierId: 7,
          serviceProvider: 'delhivery',
          pieceCount: 2,
          deliveryTime: 'before 11:00',
          planId: 'plan-1',
        },
      }
      const res = createRes()
      await calculateRateController(req as any, res as any)
      assert.equal(res.statusCode, 200)
      assert.equal(res.body?.success, true)
      assert.equal(res.body?.data?.rate, 321)
      assert.equal(calcCall?.originPincode, '400001')
      assert.equal(calcCall?.destinationPincode, '560001')
      assert.equal(calcCall?.courierScope?.courierId, 7)
      assert.equal(calcCall?.courierScope?.serviceProvider, 'delhivery')
    }

    console.log('PASS: rate calculator API smoke checks passed')
  } finally {
    shiprocketService.fetchAvailableCouriersWithRates = originalFetchB2C
    shiprocketService.fetchAvailableCouriersWithRatesB2B = originalFetchB2B
    shiprocketService.fetchAvailableCouriersWithRatesAdmin = originalFetchAdmin
    b2bAdminService.calculateB2BRate = originalCalculateB2BRate
  }
}

run().catch((error) => {
  console.error('FAIL: rate calculator API smoke checks failed')
  console.error(error)
  process.exit(1)
})
