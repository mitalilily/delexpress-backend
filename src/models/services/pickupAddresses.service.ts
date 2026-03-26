// services/pickupAddresses.service.ts
import { and, asc, desc, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { CreatePickupDto, HydratedPickupAddress, UpdatePickupDto } from '../../types/generic.types'
import { db } from '../client'
import { addresses, pickupAddresses } from '../schema/pickupAddresses'
import { EkartService } from './couriers/ekart.service'

function parseCoordinate(value: string | null | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

/**
 * Create Pickup + optional RTO
 */

export async function createPickupAddressService(data: CreatePickupDto, userId: string) {
  return await db.transaction(async (txn) => {
    const existing = await txn.query.pickupAddresses.findFirst({
      where: eq(pickupAddresses.userId, userId),
    })

    const isPrimary = !existing

    // 🔹 Reset existing primary if new one is requested
    if (data.isPrimary && existing) {
      await txn
        .update(pickupAddresses)
        .set({ isPrimary: false })
        .where(eq(pickupAddresses.userId, userId))
    }

    // 🔹 Insert pickup address
    const [pickupAddr] = await txn
      .insert(addresses)
      .values({
        userId,
        type: 'pickup',
        ...data.pickup,
      })
      .returning()

    // 🔹 Insert optional RTO address
    let rtoAddressId: string | null = null
    let isRTOSame = true
    let rtoAddressData = pickupAddr

    if (data?.rtoAddress) {
      const [rtoAddr] = await txn
        .insert(addresses)
        .values({
          userId,
          type: 'rto',
          ...data.rtoAddress,
        })
        .returning()
      rtoAddressId = rtoAddr.id
      isRTOSame = false
      rtoAddressData = rtoAddr
    } else {
      rtoAddressId = pickupAddr.id
    }

    // 🔹 Link in pickup_addresses
    const [created] = await txn
      .insert(pickupAddresses)
      .values({
        userId,
        addressId: pickupAddr.id,
        rtoAddressId,
        isPrimary: data.isPrimary ?? isPrimary,
        isPickupEnabled: data.isPickupEnabled ?? true,
        isRTOSame,
      })
      .returning()

    console.log('ℹ️ Skipping Delhivery pickup sync; Ekart is the active pickup integration flow.')

    // 🔹 Register pickup in Ekart (mirror our warehouse)
    try {
      const ekart = new EkartService()
      const alias = pickupAddr.addressNickname || pickupAddr.contactName || `warehouse-${pickupAddr.id}`
      const phoneRaw = String(pickupAddr.contactPhone || '')
      const phoneDigits = phoneRaw.replace(/\D/g, '')
      const geo = {
        lat: parseCoordinate(pickupAddr.latitude, 0),
        lon: parseCoordinate(pickupAddr.longitude, 0),
      }
      const payload = {
        alias,
        contactName: pickupAddr.contactName || 'DelExpress',
        phone: Number(phoneDigits) || 0,
        email: pickupAddr.contactEmail || '',
        addressLine1: pickupAddr.addressLine1,
        addressLine2: pickupAddr.addressLine2 || '',
        city: pickupAddr.city,
        state: pickupAddr.state,
        pincode: Number(pickupAddr.pincode) || 0,
        country: (pickupAddr.country || 'India').toUpperCase(),
        geo,
        returnAddress: {
          contactName: pickupAddr.contactName || 'DelExpress',
          phone: Number(phoneDigits) || 0,
          addressLine1: pickupAddr.addressLine1,
          addressLine2: pickupAddr.addressLine2 || '',
          city: pickupAddr.city,
          state: pickupAddr.state,
          pincode: Number(pickupAddr.pincode) || 0,
          country: (pickupAddr.country || 'India').toUpperCase(),
          geo,
        },
      }
      await ekart.createWarehouse(payload)
      console.log(`✅ Ekart warehouse registered: ${alias}`)
    } catch (err: any) {
      console.warn('⚠️ Failed to register Ekart warehouse:', err?.response?.data || err?.message || err)
    }

    return created
  })
}
/**
 * Update Pickup + optional RTO
 */

export async function updatePickupAddressService(
  pickupId: string | null,
  userId: string,
  data: UpdatePickupDto & { id?: string },
) {
  try {
    const targetPickupId = pickupId ?? data.id
    if (!targetPickupId) throw new Error('Pickup ID is required')

    // ✅ Handle primary switch (if making this the new primary)
    if (data.isPrimary) {
      await db
        .update(pickupAddresses)
        .set({ isPrimary: false })
        .where(and(eq(pickupAddresses.userId, userId), ne(pickupAddresses.id, targetPickupId)))
    }

    // ✅ Update pickup record (flags only)
    const [pickup] = await db
      .update(pickupAddresses)
      .set({
        isPrimary: data.isPrimary,
        isPickupEnabled: data.isPickupEnabled ?? true,
      })
      .where(and(eq(pickupAddresses.id, targetPickupId), eq(pickupAddresses.userId, userId)))
      .returning()

    if (!pickup) return null

    // 🟡 If only flags are provided (no pickup or RTO details) — skip courier syncs
    const onlyFlagsChanged = !data.pickup && !data.rtoAddress
    if (onlyFlagsChanged) {
      console.log('⚙️ Only flags updated (isPrimary/isPickupEnabled). Skipping courier syncs.')
      return pickup
    }

    // ✅ Start transaction for atomic updates
    return await db.transaction(async (txn) => {
      // ✅ Update pickup address itself
      let updatedPickup: any = null
      if (data.pickup && pickup.addressId) {
        const { createdAt, ...safeData } = data.pickup
        const [addr] = await txn
          .update(addresses)
          .set({
            ...safeData,
            updatedAt: new Date(),
          })
          .where(eq(addresses.id, pickup.addressId))
          .returning()
        updatedPickup = addr
      }

      // ✅ Update / Create RTO address
      if (data.rtoAddress) {
        if (pickup.rtoAddressId) {
          const { createdAt, ...safeData } = data?.rtoAddress
          await txn
            .update(addresses)
            .set({ ...safeData, updatedAt: new Date() })
            .where(eq(addresses.id, pickup.rtoAddressId))
        } else {
          const [newRto] = await txn
            .insert(addresses)
            .values({
              userId,
              type: 'rto',
              contactName: data.rtoAddress.contactName!,
              contactPhone: data.rtoAddress.contactPhone!,
              addressLine1: data.rtoAddress.addressLine1!,
              city: data.rtoAddress.city!,
              state: data.rtoAddress.state!,
              country: data.rtoAddress.country ?? 'India',
              pincode: data.rtoAddress.pincode!,
              contactEmail: data.rtoAddress.contactEmail,
              addressLine2: data.rtoAddress.addressLine2,
              landmark: data.rtoAddress.landmark,
              gstNumber: data.rtoAddress.gstNumber,
            })
            .returning()

          await txn
            .update(pickupAddresses)
            .set({ rtoAddressId: newRto.id, isRTOSame: false })
            .where(eq(pickupAddresses.id, targetPickupId))
        }
      }

      if (updatedPickup) {
        console.log('ℹ️ Skipping Delhivery pickup update sync; Ekart is the active pickup integration flow.')
      } else {
        console.log('ℹ️ No pickup address change detected — skipped courier sync.')
      }

      return pickup
    })
  } catch (error) {
    console.error('❌ Failed to update pickup address:', error)
    throw new Error('Failed to update pickup address')
  }
}

/**
 * Get pickup addresses with hydrated pickup + rto
 */

export async function getPickupAddressesService(
  userId: string,
  filters: Record<string, any> = {},
  page = 1,
  limit = 10,
): Promise<{ data: HydratedPickupAddress[]; totalCount: number }> {
  const conditions: any[] = [eq(pickupAddresses.userId, userId)]

  // ✅ Pickup status filters
  if (filters.isPickupEnabled === 'active')
    conditions.push(eq(pickupAddresses.isPickupEnabled, true))
  if (filters.isPickupEnabled === 'inactive')
    conditions.push(eq(pickupAddresses.isPickupEnabled, false))
  if (filters.isPrimary !== undefined && filters.isPrimary !== '')
    conditions.push(eq(pickupAddresses.isPrimary, filters.isPrimary === 'true'))

  // ✅ Helper for pickup OR rto field
  const pickupOrRto = (field: string, value: string) => {
    const search = `%${value}%`
    return or(
      ilike((addresses as any)[field], search),
      sql<boolean>`EXISTS (
        SELECT 1 FROM addresses rto
        WHERE rto.id = ${pickupAddresses.rtoAddressId}
          AND rto.${sql.identifier(field)} ILIKE ${search}
      )`,
    )
  }

  // ✅ Field-specific filters
  if (filters.name) conditions.push(pickupOrRto('addressNickname', filters.name))
  if (filters.city) conditions.push(pickupOrRto('city', filters.city))
  if (filters.state) conditions.push(pickupOrRto('state', filters.state))
  if (filters.pincode) conditions.push(pickupOrRto('pincode', filters.pincode))

  // ✅ Sorting
  let sortByClause = desc(addresses.createdAt)
  switch (filters.sortBy) {
    case 'oldest':
      sortByClause = asc(addresses.createdAt)
      break
    case 'az':
      sortByClause = asc(addresses.contactName)
      break
    case 'za':
      sortByClause = desc(addresses.contactName)
      break
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // ✅ Count query
  const totalCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(pickupAddresses)
    .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
    .where(whereClause) // safe: Drizzle skips undefined

  const totalCount = Number(totalCountResult[0]?.count ?? 0)

  const offset = (page - 1) * limit

  // ✅ Data query
  const data = await db
    .select({
      pickupId: pickupAddresses.id,
      isPrimary: pickupAddresses.isPrimary,
      isPickupEnabled: pickupAddresses.isPickupEnabled,
      isRTOSame: pickupAddresses.isRTOSame,
      pickup: {
        id: addresses.id,
        userId: addresses.userId,
        type: addresses.type,
        contactName: addresses.contactName,
        contactPhone: addresses.contactPhone,
        addressNickname: addresses.addressNickname,
        contactEmail: addresses.contactEmail,
        addressLine1: addresses.addressLine1,
        addressLine2: addresses.addressLine2,
        landmark: addresses.landmark,
        city: addresses.city,
        state: addresses.state,
        country: addresses.country,
        pincode: addresses.pincode,
        latitude: addresses.latitude,
        longitude: addresses.longitude,
        gstNumber: addresses.gstNumber,
        createdAt: addresses.createdAt,
        updatedAt: addresses.updatedAt,
      },
      rto: sql/*sql*/ `
      CASE 
        WHEN ${pickupAddresses.isRTOSame} = false THEN (
          SELECT row_to_json(a)
          FROM addresses a
          WHERE a.id = ${pickupAddresses.rtoAddressId}
        )
        ELSE NULL
      END
    `.as('rto'),
    })
    .from(pickupAddresses)
    .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
    .where(whereClause)
    .orderBy(sortByClause)
    .limit(limit)
    .offset(offset)

  return { data: data as unknown as HydratedPickupAddress[], totalCount }
}
