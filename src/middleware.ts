import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { LOCAL_AUTH_COOKIE, normalizeLocalSessionUserId } from '@/lib/local-auth-session'

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const { response, user } = await updateSession(req)
  const localUserId = normalizeLocalSessionUserId(req.cookies.get(LOCAL_AUTH_COOKIE)?.value)
  const isAuthenticated = Boolean(user || localUserId)

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    if (pathname.startsWith('/login') && user) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    return response
  }

  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
