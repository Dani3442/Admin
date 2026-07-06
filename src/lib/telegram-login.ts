import crypto from 'crypto'

export type TelegramLoginPayload = {
  id: string
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: string
  hash: string
}

const TELEGRAM_LOGIN_MAX_AGE_SECONDS = 24 * 60 * 60

export function getTelegramBotUsername() {
  const raw =
    process.env.TELEGRAM_BOT_USERNAME ||
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
    ''
  const username = raw.trim().replace(/^@/, '')

  return /^[A-Za-z0-9_]{5,64}$/.test(username) ? username : null
}

function normalizeTelegramField(value: unknown, maxLength = 256) {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const next = String(value).trim()
  if (!next) return null
  return next.length > maxLength ? next.slice(0, maxLength) : next
}

export function normalizeTelegramLoginPayload(raw: unknown): TelegramLoginPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const input = raw as Record<string, unknown>

  const id = normalizeTelegramField(input.id, 32)
  const authDate = normalizeTelegramField(input.auth_date, 32)
  const hash = normalizeTelegramField(input.hash, 128)
  if (!id || !authDate || !hash || !/^\d+$/.test(id) || !/^\d+$/.test(authDate)) {
    return null
  }

  return {
    id,
    first_name: normalizeTelegramField(input.first_name, 128) || undefined,
    last_name: normalizeTelegramField(input.last_name, 128) || undefined,
    username: normalizeTelegramField(input.username, 128) || undefined,
    photo_url: normalizeTelegramField(input.photo_url, 512) || undefined,
    auth_date: authDate,
    hash,
  }
}

export function verifyTelegramLoginPayload(payload: TelegramLoginPayload) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    return { ok: false as const, reason: 'bot_token_missing' as const }
  }

  const authDate = Number(payload.auth_date)
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (!Number.isFinite(authDate) || nowSeconds - authDate > TELEGRAM_LOGIN_MAX_AGE_SECONDS) {
    return { ok: false as const, reason: 'auth_date_expired' as const }
  }

  const data = Object.entries(payload)
    .filter(([key, value]) => key !== 'hash' && value !== undefined && value !== null)
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secret = crypto.createHash('sha256').update(token).digest()
  const calculatedHash = crypto.createHmac('sha256', secret).update(data).digest('hex')
  const expected = Buffer.from(payload.hash, 'hex')
  const actual = Buffer.from(calculatedHash, 'hex')

  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    return { ok: false as const, reason: 'hash_mismatch' as const }
  }

  return { ok: true as const }
}
