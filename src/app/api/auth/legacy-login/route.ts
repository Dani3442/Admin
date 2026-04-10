import { NextRequest, NextResponse } from 'next/server'
import { migrateLegacyUserPassword } from '@/lib/supabase/admin-users'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeEmailValue } from '@/lib/input-security'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const email = sanitizeEmailValue(body?.email)
  const password = String(body?.password || '')

  const rateLimit = consumeRateLimit({
    key: `api:auth:legacy-login:${getClientIpFromHeaders(req.headers)}:${email}`,
    limit: 10,
    windowMs: 15 * 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  if (!email || !password) {
    return NextResponse.json({ error: 'Missing credentials' }, { status: 400 })
  }

  const result = await migrateLegacyUserPassword(email, password)
  if (!result.migrated) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  return NextResponse.json({ migrated: true })
}
