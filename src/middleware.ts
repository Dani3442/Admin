import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isAuthenticated = Boolean(req.auth?.user)

  if (pathname.startsWith('/login') || pathname.startsWith('/api/auth')) {
    if (pathname.startsWith('/login') && isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }

    return NextResponse.next()
  }

  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
