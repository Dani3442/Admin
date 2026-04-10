type SanitizeTextOptions = {
  maxLength?: number
  preserveNewlines?: boolean
  trim?: boolean
}

const DEFAULT_MAX_LENGTH = 10_000

export function sanitizeTextValue(value: unknown, options: SanitizeTextOptions = {}) {
  if (typeof value !== 'string') return ''

  const {
    maxLength = DEFAULT_MAX_LENGTH,
    preserveNewlines = false,
    trim = true,
  } = options

  let nextValue = value.normalize('NFKC')

  nextValue = nextValue
    .replace(/\u0000/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[<>]/g, (char) => (char === '<' ? '‹' : '›'))

  if (preserveNewlines) {
    nextValue = nextValue
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
  } else {
    nextValue = nextValue.replace(/\s+/g, ' ')
  }

  if (trim) {
    nextValue = nextValue.trim()
  }

  if (nextValue.length > maxLength) {
    nextValue = nextValue.slice(0, maxLength)
  }

  return nextValue
}

export function sanitizeNullableText(
  value: unknown,
  options: SanitizeTextOptions = {}
) {
  const sanitized = sanitizeTextValue(value, options)
  return sanitized ? sanitized : null
}

export function sanitizeEmailValue(value: unknown) {
  return sanitizeTextValue(value, { maxLength: 320 }).toLowerCase()
}

export function sanitizeUrlValue(value: unknown) {
  const sanitized = sanitizeTextValue(value, { maxLength: 2048 })
  if (!sanitized) return null

  try {
    const url = new URL(sanitized)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

export function sanitizeDeepStrings(
  value: unknown,
  options: SanitizeTextOptions = {}
): unknown {
  if (typeof value === 'string') {
    return sanitizeTextValue(value, options)
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeDeepStrings(entry, options))
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, sanitizeDeepStrings(entry, options)])
    )
  }

  return value
}
