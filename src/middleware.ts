import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  const { response, user } = await updateSession(req)
  const isAuthenticated = Boolean(user)

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    if (pathname.startsWith('/login') && isAuthenticated) {
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
