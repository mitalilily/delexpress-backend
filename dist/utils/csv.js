"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.csvEscape = csvEscape;
exports.buildCsv = buildCsv;
function csvEscape(value) {
    if (value === null || value === undefined)
        return '';
    const raw = value instanceof Date ? value.toISOString() : String(value);
    if (raw === '')
        return '';
    const escaped = raw.replace(/"/g, '""');
    return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped;
}
function buildCsv(headers, rows, includeBom = true) {
    const lines = [
        headers.map((h) => csvEscape(h)).join(','),
        ...rows.map((row) => row.map((cell) => csvEscape(cell)).join(',')),
    ];
    const csv = lines.join('\n');
    return includeBom ? `\uFEFF${csv}` : csv;
}
