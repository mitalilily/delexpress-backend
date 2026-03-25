"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPickupAddressService = createPickupAddressService;
exports.updatePickupAddressService = updatePickupAddressService;
exports.getPickupAddressesService = getPickupAddressesService;
// services/pickupAddresses.service.ts
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const pickupAddresses_1 = require("../schema/pickupAddresses");
const delhivery_service_1 = require("./couriers/delhivery.service");
const ekart_service_1 = require("./couriers/ekart.service");
function parseCoordinate(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
/**
 * Create Pickup + optional RTO
 */
async function createPickupAddressService(data, userId) {
    return await client_1.db.transaction(async (txn) => {
        const existing = await txn.query.pickupAddresses.findFirst({
            where: (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.userId, userId),
        });
        const isPrimary = !existing;
        // 🔹 Reset existing primary if new one is requested
        if (data.isPrimary && existing) {
            await txn
                .update(pickupAddresses_1.pickupAddresses)
                .set({ isPrimary: false })
                .where((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.userId, userId));
        }
        // 🔹 Insert pickup address
        const [pickupAddr] = await txn
            .insert(pickupAddresses_1.addresses)
            .values({
            userId,
            type: 'pickup',
            ...data.pickup,
        })
            .returning();
        // 🔹 Insert optional RTO address
        let rtoAddressId = null;
        let isRTOSame = true;
        let rtoAddressData = pickupAddr;
        if (data?.rtoAddress) {
            const [rtoAddr] = await txn
                .insert(pickupAddresses_1.addresses)
                .values({
                userId,
                type: 'rto',
                ...data.rtoAddress,
            })
                .returning();
            rtoAddressId = rtoAddr.id;
            isRTOSame = false;
            rtoAddressData = rtoAddr;
        }
        else {
            rtoAddressId = pickupAddr.id;
        }
        // 🔹 Link in pickup_addresses
        const [created] = await txn
            .insert(pickupAddresses_1.pickupAddresses)
            .values({
            userId,
            addressId: pickupAddr.id,
            rtoAddressId,
            isPrimary: data.isPrimary ?? isPrimary,
            isPickupEnabled: data.isPickupEnabled ?? true,
            isRTOSame,
        })
            .returning();
        // 🚚 Register pickup in Delhivery
        try {
            const delhivery = new delhivery_service_1.DelhiveryService();
            const delhiveryResp = await delhivery.createWarehouse({
                name: pickupAddr.addressNickname ?? pickupAddr.contactName ?? 'Default Warehouse',
                registered_name: 'DelExpress',
                phone: pickupAddr.contactPhone,
                email: pickupAddr.contactEmail ?? '',
                address: pickupAddr.addressLine1,
                city: pickupAddr.city,
                pin: pickupAddr.pincode.toString(),
                country: pickupAddr.country ?? 'India',
                return_address: rtoAddressData.addressLine1 ?? pickupAddr.addressLine1,
                return_city: rtoAddressData.city ?? pickupAddr.city,
                return_pin: rtoAddressData.pincode?.toString() ?? pickupAddr.pincode?.toString(),
                return_state: rtoAddressData.state ?? pickupAddr.state,
                return_country: 'India',
            });
            if (!delhiveryResp || delhiveryResp.success === false) {
                console.error('❌ Delhivery warehouse creation failed:', delhiveryResp);
                const errorToThrow = new Error('Delhivery warehouse registration failed');
                errorToThrow.code = 'DELHIVERY_WAREHOUSE_GENERAL_ERROR';
                throw errorToThrow;
            }
            console.log(`✅ Delhivery warehouse registered: ${pickupAddr.addressNickname}`);
        }
        catch (err) {
            const rawError = err?.response?.data ?? err;
            console.error('❌ Error registering Delhivery warehouse:', rawError);
            // Detect duplicate-warehouse error from Delhivery and throw a typed error
            const delhiveryErrorText = rawError?.error?.[0] || rawError?.message || rawError?.data?.message;
            if (typeof delhiveryErrorText === 'string') {
                if (delhiveryErrorText.includes('client-warehouse of client') &&
                    delhiveryErrorText.toLowerCase().includes('already exists')) {
                    const duplicateErr = new Error('A pickup location with this nickname already exists. Please choose a different nickname.');
                    duplicateErr.code = 'DELHIVERY_WAREHOUSE_NAME_EXISTS';
                    duplicateErr.field = 'pickup.addressNickname';
                    throw duplicateErr;
                }
                if (delhiveryErrorText.toLowerCase().includes('serviceability')) {
                    const serviceabilityErr = new Error('This pickup pincode is not serviceable for pickups. Please use a different pincode.');
                    serviceabilityErr.code = 'PICKUP_PIN_NOT_SERVICEABLE';
                    serviceabilityErr.field = 'pickup.pincode';
                    throw serviceabilityErr;
                }
            }
            const genericErr = new Error('Pickup location could not be verified. Please check the address details and try again.');
            genericErr.code = 'DELHIVERY_WAREHOUSE_GENERAL_ERROR';
            throw genericErr;
        }
        // 🔹 Register pickup in Ekart (mirror our warehouse)
        try {
            const ekart = new ekart_service_1.EkartService();
            const alias = pickupAddr.addressNickname || pickupAddr.contactName || `warehouse-${pickupAddr.id}`;
            const phoneRaw = String(pickupAddr.contactPhone || '');
            const phoneDigits = phoneRaw.replace(/\D/g, '');
            const geo = {
                lat: parseCoordinate(pickupAddr.latitude, 0),
                lon: parseCoordinate(pickupAddr.longitude, 0),
            };
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
            };
            await ekart.createWarehouse(payload);
            console.log(`✅ Ekart warehouse registered: ${alias}`);
        }
        catch (err) {
            console.warn('⚠️ Failed to register Ekart warehouse:', err?.response?.data || err?.message || err);
        }
        return created;
    });
}
/**
 * Update Pickup + optional RTO
 */
async function updatePickupAddressService(pickupId, userId, data) {
    try {
        const targetPickupId = pickupId ?? data.id;
        if (!targetPickupId)
            throw new Error('Pickup ID is required');
        // ✅ Handle primary switch (if making this the new primary)
        if (data.isPrimary) {
            await client_1.db
                .update(pickupAddresses_1.pickupAddresses)
                .set({ isPrimary: false })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.userId, userId), (0, drizzle_orm_1.ne)(pickupAddresses_1.pickupAddresses.id, targetPickupId)));
        }
        // ✅ Update pickup record (flags only)
        const [pickup] = await client_1.db
            .update(pickupAddresses_1.pickupAddresses)
            .set({
            isPrimary: data.isPrimary,
            isPickupEnabled: data.isPickupEnabled ?? true,
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.id, targetPickupId), (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.userId, userId)))
            .returning();
        if (!pickup)
            return null;
        // 🟡 If only flags are provided (no pickup or RTO details) — skip courier syncs
        const onlyFlagsChanged = !data.pickup && !data.rtoAddress;
        if (onlyFlagsChanged) {
            console.log('⚙️ Only flags updated (isPrimary/isPickupEnabled). Skipping courier syncs.');
            return pickup;
        }
        // ✅ Start transaction for atomic updates
        return await client_1.db.transaction(async (txn) => {
            // ✅ Update pickup address itself
            let updatedPickup = null;
            if (data.pickup && pickup.addressId) {
                const { createdAt, ...safeData } = data.pickup;
                const [addr] = await txn
                    .update(pickupAddresses_1.addresses)
                    .set({
                    ...safeData,
                    updatedAt: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(pickupAddresses_1.addresses.id, pickup.addressId))
                    .returning();
                updatedPickup = addr;
            }
            // ✅ Update / Create RTO address
            if (data.rtoAddress) {
                if (pickup.rtoAddressId) {
                    const { createdAt, ...safeData } = data?.rtoAddress;
                    await txn
                        .update(pickupAddresses_1.addresses)
                        .set({ ...safeData, updatedAt: new Date() })
                        .where((0, drizzle_orm_1.eq)(pickupAddresses_1.addresses.id, pickup.rtoAddressId));
                }
                else {
                    const [newRto] = await txn
                        .insert(pickupAddresses_1.addresses)
                        .values({
                        userId,
                        type: 'rto',
                        contactName: data.rtoAddress.contactName,
                        contactPhone: data.rtoAddress.contactPhone,
                        addressLine1: data.rtoAddress.addressLine1,
                        city: data.rtoAddress.city,
                        state: data.rtoAddress.state,
                        country: data.rtoAddress.country ?? 'India',
                        pincode: data.rtoAddress.pincode,
                        contactEmail: data.rtoAddress.contactEmail,
                        addressLine2: data.rtoAddress.addressLine2,
                        landmark: data.rtoAddress.landmark,
                        gstNumber: data.rtoAddress.gstNumber,
                    })
                        .returning();
                    await txn
                        .update(pickupAddresses_1.pickupAddresses)
                        .set({ rtoAddressId: newRto.id, isRTOSame: false })
                        .where((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.id, targetPickupId));
                }
            }
            // 🟢 Sync with Delhivery (only if pickup address actually changed)
            try {
                if (updatedPickup) {
                    const delhivery = new delhivery_service_1.DelhiveryService();
                    const delhiveryResp = await delhivery.updateWarehouse({
                        name: updatedPickup?.addressNickname ?? updatedPickup?.contactName ?? 'Default Warehouse',
                        address: updatedPickup?.addressLine1,
                        pin: updatedPickup?.pincode?.toString(),
                        phone: updatedPickup?.contactPhone,
                    });
                    if (!delhiveryResp || delhiveryResp.success === false) {
                        console.error('❌ Failed to update warehouse in Delhivery:', delhiveryResp);
                        throw new Error('Warehouse update failed');
                    }
                    console.log(`✅ Warehouse updated in Delhivery: ${updatedPickup?.addressNickname}`);
                }
                else {
                    console.log('ℹ️ No pickup address change detected — skipped Delhivery update.');
                }
            }
            catch (err) {
                console.error('❌ Delhivery warehouse update error:', err.message);
                throw new Error('Failed to update warehouse');
            }
            return pickup;
        });
    }
    catch (error) {
        console.error('❌ Failed to update pickup address:', error);
        throw new Error('Failed to update pickup address');
    }
}
/**
 * Get pickup addresses with hydrated pickup + rto
 */
async function getPickupAddressesService(userId, filters = {}, page = 1, limit = 10) {
    const conditions = [(0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.userId, userId)];
    // ✅ Pickup status filters
    if (filters.isPickupEnabled === 'active')
        conditions.push((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.isPickupEnabled, true));
    if (filters.isPickupEnabled === 'inactive')
        conditions.push((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.isPickupEnabled, false));
    if (filters.isPrimary !== undefined && filters.isPrimary !== '')
        conditions.push((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.isPrimary, filters.isPrimary === 'true'));
    // ✅ Helper for pickup OR rto field
    const pickupOrRto = (field, value) => {
        const search = `%${value}%`;
        return (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(pickupAddresses_1.addresses[field], search), (0, drizzle_orm_1.sql) `EXISTS (
        SELECT 1 FROM addresses rto
        WHERE rto.id = ${pickupAddresses_1.pickupAddresses.rtoAddressId}
          AND rto.${drizzle_orm_1.sql.identifier(field)} ILIKE ${search}
      )`);
    };
    // ✅ Field-specific filters
    if (filters.name)
        conditions.push(pickupOrRto('addressNickname', filters.name));
    if (filters.city)
        conditions.push(pickupOrRto('city', filters.city));
    if (filters.state)
        conditions.push(pickupOrRto('state', filters.state));
    if (filters.pincode)
        conditions.push(pickupOrRto('pincode', filters.pincode));
    // ✅ Sorting
    let sortByClause = (0, drizzle_orm_1.desc)(pickupAddresses_1.addresses.createdAt);
    switch (filters.sortBy) {
        case 'oldest':
            sortByClause = (0, drizzle_orm_1.asc)(pickupAddresses_1.addresses.createdAt);
            break;
        case 'az':
            sortByClause = (0, drizzle_orm_1.asc)(pickupAddresses_1.addresses.contactName);
            break;
        case 'za':
            sortByClause = (0, drizzle_orm_1.desc)(pickupAddresses_1.addresses.contactName);
            break;
    }
    const whereClause = conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined;
    // ✅ Count query
    const totalCountResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(pickupAddresses_1.pickupAddresses)
        .innerJoin(pickupAddresses_1.addresses, (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.addressId, pickupAddresses_1.addresses.id))
        .where(whereClause); // safe: Drizzle skips undefined
    const totalCount = Number(totalCountResult[0]?.count ?? 0);
    const offset = (page - 1) * limit;
    // ✅ Data query
    const data = await client_1.db
        .select({
        pickupId: pickupAddresses_1.pickupAddresses.id,
        isPrimary: pickupAddresses_1.pickupAddresses.isPrimary,
        isPickupEnabled: pickupAddresses_1.pickupAddresses.isPickupEnabled,
        isRTOSame: pickupAddresses_1.pickupAddresses.isRTOSame,
        pickup: {
            id: pickupAddresses_1.addresses.id,
            userId: pickupAddresses_1.addresses.userId,
            type: pickupAddresses_1.addresses.type,
            contactName: pickupAddresses_1.addresses.contactName,
            contactPhone: pickupAddresses_1.addresses.contactPhone,
            addressNickname: pickupAddresses_1.addresses.addressNickname,
            contactEmail: pickupAddresses_1.addresses.contactEmail,
            addressLine1: pickupAddresses_1.addresses.addressLine1,
            addressLine2: pickupAddresses_1.addresses.addressLine2,
            landmark: pickupAddresses_1.addresses.landmark,
            city: pickupAddresses_1.addresses.city,
            state: pickupAddresses_1.addresses.state,
            country: pickupAddresses_1.addresses.country,
            pincode: pickupAddresses_1.addresses.pincode,
            latitude: pickupAddresses_1.addresses.latitude,
            longitude: pickupAddresses_1.addresses.longitude,
            gstNumber: pickupAddresses_1.addresses.gstNumber,
            createdAt: pickupAddresses_1.addresses.createdAt,
            updatedAt: pickupAddresses_1.addresses.updatedAt,
        },
        rto: (0, drizzle_orm_1.sql /*sql*/) `
      CASE 
        WHEN ${pickupAddresses_1.pickupAddresses.isRTOSame} = false THEN (
          SELECT row_to_json(a)
          FROM addresses a
          WHERE a.id = ${pickupAddresses_1.pickupAddresses.rtoAddressId}
        )
        ELSE NULL
      END
    `.as('rto'),
    })
        .from(pickupAddresses_1.pickupAddresses)
        .innerJoin(pickupAddresses_1.addresses, (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.addressId, pickupAddresses_1.addresses.id))
        .where(whereClause)
        .orderBy(sortByClause)
        .limit(limit)
        .offset(offset);
    return { data: data, totalCount };
}
