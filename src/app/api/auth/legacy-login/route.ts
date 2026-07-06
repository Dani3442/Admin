import { NextRequest, NextResponse } from 'next/server'
import { verifyLegacyLocalUserPassword } from '@/lib/supabase/admin-users'
import { createClient as createServerSupabaseClient } from '@/lib/supabase/server'
import { prisma } from '@/lib/prisma'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeEmailValue } from '@/lib/input-security'
import { getLocalSessionCookieOptions, LOCAL_AUTH_COOKIE } from '@/lib/local-auth-session'

async function verifySupabasePassword(email: string, password: string) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.user?.email) return null

    return data.user.email.trim().toLowerCase()
  } catch {
    return null
  }
}

async function findActiveLocalUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      isActive: true,
    },
  })
}

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

  const legacyResult = await verifyLegacyLocalUserPassword(email, password)
  let userId = legacyResult.authenticated ? legacyResult.userId : null

  if (!userId) {
    const supabaseEmail = await verifySupabasePassword(email, password)
    if (supabaseEmail) {
      const localUser = await findActiveLocalUserByEmail(supabaseEmail)
      if (localUser?.isActive) {
        userId = localUser.id
      }
    }
  }

  if (!userId) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const response = NextResponse.json({ authenticated: true })
  response.cookies.set(LOCAL_AUTH_COOKIE, userId, getLocalSessionCookieOptions())

  return response
}
