export type CsvValue = string | number | boolean | Date | null | undefined

export function csvEscape(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const raw = value instanceof Date ? value.toISOString() : String(value)
  if (raw === '') return ''
  const escaped = raw.replace(/"/g, '""')
  return /[",\n\r]/.test(escaped) ? `"${escaped}"` : escaped
}

export function buildCsv(headers: string[], rows: CsvValue[][], includeBom = true): string {
  const lines = [
    headers.map((h) => csvEscape(h)).join(','),
    ...rows.map((row) => row.map((cell) => csvEscape(cell)).join(',')),
  ]
  const csv = lines.join('\n')
  return includeBom ? `\uFEFF${csv}` : csv
}
