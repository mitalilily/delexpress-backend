"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const shippingChargeCalculator_service_1 = require("../models/services/shippingChargeCalculator.service");
const schema_1 = require("../schema/schema");
async function recalculateAllWeightCharges() {
    console.log('🔄 Recalculating weight charges for all discrepancies...');
    // Get all pending discrepancies with missing additional charges
    const discrepancies = await client_1.db
        .select()
        .from(schema_1.weight_discrepancies)
        .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.additional_charge, '0.00'));
    console.log(`📋 Found ${discrepancies.length} discrepancies to recalculate`);
    for (const disc of discrepancies) {
        try {
            // Get the original order to find the shipping charge
            const orderTable = disc.order_type === 'b2c' ? schema_1.b2c_orders : schema_1.b2b_orders;
            const orderId = disc.order_type === 'b2c' ? disc.b2c_order_id : disc.b2b_order_id;
            if (!orderId)
                continue;
            const [order] = await client_1.db.select().from(orderTable).where((0, drizzle_orm_1.eq)(orderTable.id, orderId)).limit(1);
            if (!order) {
                console.warn(`⚠️  Order not found for discrepancy ${disc.id}`);
                continue;
            }
            const originalCharge = Number(order.order_amount || 0);
            if (originalCharge === 0) {
                console.warn(`⚠️  No original charge for order ${disc.order_number}`);
                continue;
            }
            // Calculate revised charge
            const chargeCalc = await (0, shippingChargeCalculator_service_1.calculateRevisedShippingCharge)({
                orderId,
                orderType: disc.order_type,
                courierPartner: disc.courier_partner || undefined,
                declaredWeight: Number(disc.declared_weight),
                chargedWeight: Number(disc.charged_weight),
                originalShippingCharge: originalCharge,
            });
            // Update discrepancy
            await client_1.db
                .update(schema_1.weight_discrepancies)
                .set({
                original_shipping_charge: originalCharge.toString(),
                revised_shipping_charge: chargeCalc.revisedCharge.toString(),
                additional_charge: chargeCalc.additionalCharge.toString(),
                updated_at: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, disc.id));
            console.log(`✅ ${disc.order_number}: ₹${originalCharge} → ₹${chargeCalc.revisedCharge.toFixed(2)} (${chargeCalc.calculationMethod})`);
        }
        catch (error) {
            console.error(`❌ Error processing ${disc.order_number}:`, error);
        }
    }
    console.log('✅ Recalculation complete!');
    process.exit(0);
}
recalculateAllWeightCharges().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
