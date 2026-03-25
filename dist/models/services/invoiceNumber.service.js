"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reserveInvoiceSequence = reserveInvoiceSequence;
exports.formatInvoiceNumber = formatInvoiceNumber;
exports.resolveInvoiceNumber = resolveInvoiceNumber;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const invoiceSequences_1 = require("../schema/invoiceSequences");
const DEFAULT_PREFIX = 'INV';
const SEQUENCE_PAD = 6;
const toSafeString = (value) => (value ? value.trim() : '');
async function reserveInvoiceSequence(userId, tx) {
    const dao = tx ?? client_1.db;
    const [result] = await dao
        .insert(invoiceSequences_1.invoiceSequences)
        .values({
        userId,
        lastSequence: 1,
    })
        .onConflictDoUpdate({
        target: invoiceSequences_1.invoiceSequences.userId,
        set: {
            lastSequence: (0, drizzle_orm_1.sql) `${invoiceSequences_1.invoiceSequences.lastSequence} + 1`,
            updatedAt: (0, drizzle_orm_1.sql) `now()`,
        },
    })
        .returning({ lastSequence: invoiceSequences_1.invoiceSequences.lastSequence });
    const sequence = result?.lastSequence ?? 1n;
    return Number(sequence);
}
function formatInvoiceNumber(prefix, sequence, suffix) {
    const seqString = String(sequence).padStart(SEQUENCE_PAD, '0');
    const trimmedPrefix = toSafeString(prefix) || DEFAULT_PREFIX;
    const trimmedSuffix = toSafeString(suffix);
    return `${trimmedPrefix}${seqString}${trimmedSuffix ? trimmedSuffix : ''}`;
}
async function resolveInvoiceNumber({ userId, existingInvoiceNumber, prefix, suffix, tx, }) {
    const existing = toSafeString(existingInvoiceNumber);
    if (existing)
        return existing;
    const sequence = await reserveInvoiceSequence(userId, tx);
    return formatInvoiceNumber(prefix ?? DEFAULT_PREFIX, sequence, suffix ?? '');
}
