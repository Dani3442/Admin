import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { LOCAL_AUTH_COOKIE } from '@/lib/local-auth-session'

export async function POST() {
  const cookieStore = await cookies()
  const response = NextResponse.json({ ok: true })

  response.cookies.set(LOCAL_AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  })

  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      response.cookies.set(cookie.name, '', {
        path: '/',
        maxAge: 0,
      })
    }
  }

  return response
}
