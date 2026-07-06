export const LOCAL_AUTH_COOKIE = 'product_admin_local_session'
export const LOCAL_AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export function normalizeLocalSessionUserId(value: unknown) {
  if (typeof value !== 'string') return null

  const trimmed = value.trim()
  if (!/^[a-zA-Z0-9_-]{8,160}$/.test(trimmed)) return null

  return trimmed
}

export function getLocalSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: LOCAL_AUTH_MAX_AGE_SECONDS,
  }
}
