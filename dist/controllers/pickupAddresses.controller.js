"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPickupAddressHandler = createPickupAddressHandler;
exports.updatePickupAddressHandler = updatePickupAddressHandler;
exports.getPickupAddressesHandler = getPickupAddressesHandler;
exports.exportPickupAddressesHandler = exportPickupAddressesHandler;
exports.importPickupAddressesHandler = importPickupAddressesHandler;
const papaparse_1 = __importDefault(require("papaparse"));
const client_1 = require("../models/client");
const pickupAddresses_service_1 = require("../models/services/pickupAddresses.service");
const schema_1 = require("../schema/schema");
async function createPickupAddressHandler(req, res) {
    try {
        const userId = req.user?.sub;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const newAddress = await (0, pickupAddresses_service_1.createPickupAddressService)(req.body, userId);
        return res.status(201).json({ message: 'Pickup address created', data: newAddress });
    }
    catch (err) {
        console.error('Create Pickup Address Error:', err);
        // Surface pickup validation errors cleanly to the client
        const anyErr = err;
        if (anyErr?.code === 'DELHIVERY_WAREHOUSE_NAME_EXISTS') {
            return res.status(400).json({
                code: anyErr.code,
                field: anyErr.field ?? 'pickup.addressNickname',
                message: anyErr.message ??
                    'A pickup location with this nickname already exists. Please choose a different nickname.',
            });
        }
        if (anyErr?.code === 'PICKUP_PIN_NOT_SERVICEABLE') {
            return res.status(400).json({
                code: anyErr.code,
                field: anyErr.field ?? 'pickup.pincode',
                message: anyErr.message ??
                    'This pickup pincode is not serviceable for pickups. Please use a different pincode.',
            });
        }
        if (anyErr?.code === 'DELHIVERY_WAREHOUSE_GENERAL_ERROR') {
            return res.status(400).json({
                code: anyErr.code,
                message: anyErr.message ??
                    'Pickup location could not be verified. Please check the address details and try again.',
            });
        }
        return res.status(500).json({ message: 'Internal server error' });
    }
}
/**
 * PATCH /api/pickup-addresses/:id
 */
async function updatePickupAddressHandler(req, res) {
    try {
        const userId = req.user?.sub;
        const addressId = req.params.id;
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        if (!addressId) {
            return res.status(400).json({ message: 'Missing address ID' });
        }
        const updatedAddress = await (0, pickupAddresses_service_1.updatePickupAddressService)(addressId, userId, req.body);
        if (!updatedAddress) {
            return res.status(404).json({ message: 'Pickup address not found or not owned by user' });
        }
        return res.status(200).json({
            message: 'Pickup address updated successfully',
            data: updatedAddress,
        });
    }
    catch (err) {
        console.error('Update Pickup Address Error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}
async function getPickupAddressesHandler(req, res) {
    try {
        const userId = req.user?.sub;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const { page = 1, limit = 10, ...filters } = req.query;
        const { data, totalCount } = await (0, pickupAddresses_service_1.getPickupAddressesService)(userId, filters, Number(page), Number(limit));
        return res.status(200).json({ data, totalCount });
    }
    catch (err) {
        console.error('Get Pickup Addresses Error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
}
async function exportPickupAddressesHandler(req, res) {
    try {
        const userId = req.user?.sub;
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const { data } = await (0, pickupAddresses_service_1.getPickupAddressesService)(userId, req.query, 1, 9999);
        const transformed = data?.map((row) => ({
            'Pickup Contact': row.pickup.contactName,
            'Pickup Phone': row.pickup.contactPhone,
            'Pickup City': row.pickup.city,
            'Pickup State': row.pickup.state,
            'Pickup Pincode': row.pickup.pincode,
            'Is Primary': row.isPrimary ? 'Yes' : 'No',
            Status: row.isPickupEnabled ? 'Active' : 'Inactive',
            'RTO Contact': row.rto ? row.rto.contactName : '',
            'RTO City': row.rto ? row.rto.city : '',
            'Last Updated': new Date(row.pickup.updatedAt ?? '').toLocaleString('en-IN'),
        }));
        const csv = papaparse_1.default.unparse(transformed);
        res.header('Content-Type', 'text/csv; charset=utf-8');
        res.attachment('pickup-addresses.csv');
        return res.send('\uFEFF' + csv);
    }
    catch (err) {
        console.error('Export Pickup Addresses Error:', err);
        return res.status(500).json({ message: 'Failed to export addresses' });
    }
}
async function importPickupAddressesHandler(req, res) {
    const userId = req.user?.sub;
    if (!userId)
        return res.status(401).json({ message: 'Unauthorized' });
    const rows = req.body;
    const errors = [];
    try {
        for (let i = 0; i < rows.length; i++) {
            const p = rows[i];
            const idxLabel = `Row ${i + 1}`;
            // 🔹 Validate pickup required fields
            if (!p.contactName)
                errors.push(`${idxLabel}: pickup contact name missing`);
            if (!p.contactPhone)
                errors.push(`${idxLabel}: pickup phone missing`);
            if (!p.addressLine1)
                errors.push(`${idxLabel}: pickup address missing`);
            if (!p.city)
                errors.push(`${idxLabel}: pickup city missing`);
            if (!p.state)
                errors.push(`${idxLabel}: pickup state missing`);
            if (!p.pincode || isNaN(+p.pincode))
                errors.push(`${idxLabel}: pickup pincode invalid`);
        }
        if (errors.length) {
            return res.status(400).json({ errors });
        }
        for (const p of rows) {
            // 1️⃣ Insert Pickup Address
            const [pickupAddr] = await client_1.db
                .insert(schema_1.addresses)
                .values({
                userId,
                type: 'pickup',
                contactName: p.contactName,
                contactPhone: p.contactPhone,
                contactEmail: p.contactEmail ?? '',
                addressLine1: p.addressLine1,
                addressLine2: p.addressLine2 ?? '',
                landmark: p.landmark ?? '',
                city: p.city,
                state: p.state,
                country: p.country ?? 'India',
                pincode: p.pincode,
                latitude: p.latitude ?? '',
                longitude: p.longitude ?? '',
                gstNumber: p.gstNumber ?? '',
            })
                .returning();
            // 2️⃣ Optional RTO Address
            let rtoAddressId = null;
            let isRTOSame = true;
            if (p.rtoContactName &&
                p.rtoContactPhone &&
                p.rtoAddressLine1 &&
                p.rtoCity &&
                p.rtoState &&
                p.rtoPincode) {
                const [rtoAddr] = await client_1.db
                    .insert(schema_1.addresses)
                    .values({
                    userId,
                    type: 'rto',
                    contactName: p.rtoContactName,
                    contactPhone: p.rtoContactPhone,
                    contactEmail: p.rtoContactEmail ?? '',
                    addressLine1: p.rtoAddressLine1,
                    addressLine2: p.rtoAddressLine2 ?? '',
                    landmark: p.rtoLandmark ?? '',
                    city: p.rtoCity,
                    state: p.rtoState,
                    country: p.rtoCountry ?? 'India',
                    pincode: p.rtoPincode,
                    latitude: p.rtoLatitude ?? '',
                    longitude: p.rtoLongitude ?? '',
                    gstNumber: p.rtoGstNumber ?? '',
                })
                    .returning();
                rtoAddressId = rtoAddr.id;
                isRTOSame = false;
            }
            // 3️⃣ Link into pickup_addresses
            await client_1.db.insert(schema_1.pickupAddresses).values({
                userId,
                addressId: pickupAddr.id,
                rtoAddressId,
                isPrimary: false,
                isPickupEnabled: true,
                isRTOSame: isRTOSame,
            });
        }
        return res.status(200).json({ message: 'Imported successfully.' });
    }
    catch (e) {
        console.error('Import Pickup Addresses Error:', e);
        return res.status(500).json({ message: 'Internal server error.' });
    }
}
