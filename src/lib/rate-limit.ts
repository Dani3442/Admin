type RateLimitBucket = {
  count: number
  resetAt: number
}

type ConsumeRateLimitInput = {
  key: string
  limit: number
  windowMs: number
}

type ConsumeRateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

declare global {
  var __productAdminRateLimitStore__: Map<string, RateLimitBucket> | undefined
}

function getStore() {
  if (!globalThis.__productAdminRateLimitStore__) {
    globalThis.__productAdminRateLimitStore__ = new Map()
  }

  return globalThis.__productAdminRateLimitStore__
}

function getBucketKey(key: string) {
  return key.trim().toLowerCase()
}

export function getClientIpFromHeaders(headers: Headers | null | undefined) {
  if (!headers) return 'unknown'

  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    const forwardedIp = forwardedFor.split(',')[0]?.trim()
    if (forwardedIp) return forwardedIp
  }

  const realIp = headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  return 'unknown'
}

export function consumeRateLimit({
  key,
  limit,
  windowMs,
}: ConsumeRateLimitInput): ConsumeRateLimitResult {
  const now = Date.now()
  const store = getStore()
  const bucketKey = getBucketKey(key)
  const existing = store.get(bucketKey)

  if (!existing || existing.resetAt <= now) {
    store.set(bucketKey, { count: 1, resetAt: now + windowMs })
    return {
      allowed: true,
      remaining: Math.max(limit - 1, 0),
      retryAfterSeconds: Math.ceil(windowMs / 1000),
    }
  }

  if (existing.count >= limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
    }
  }

  existing.count += 1
  store.set(bucketKey, existing)

  return {
    allowed: true,
    remaining: Math.max(limit - existing.count, 0),
    retryAfterSeconds: Math.max(Math.ceil((existing.resetAt - now) / 1000), 1),
  }
}

export function clearRateLimit(key: string) {
  getStore().delete(getBucketKey(key))
}
