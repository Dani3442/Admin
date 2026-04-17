export function serializeDateOnly(date: Date | string | null | undefined): string | null {
  if (!date) return null

  const normalized = typeof date === 'string' ? new Date(date) : date
  if (!(normalized instanceof Date) || Number.isNaN(normalized.getTime())) return null

  const year = normalized.getFullYear()
  const month = String(normalized.getMonth() + 1).padStart(2, '0')
  const day = String(normalized.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

export function parseDateOnly(value: Date | string | null | undefined): Date | null {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()))
  }

  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const dateOnlyMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null

  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()))
}
