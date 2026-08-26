import { type NextRequest, NextResponse } from 'next/server'

const protectedPaths = [
  '/dashboard',
  '/transactions',
  '/schedules',
  '/stats',
  '/budget',
  '/settings',
  '/admin',
]

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(cookie => cookie.name.startsWith('sb-') && cookie.name.includes('auth-token'))
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const isProtected = protectedPaths.some(path => pathname.startsWith(path))
  const hasAuthCookie = hasSupabaseAuthCookie(request)

  if (!hasAuthCookie && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (hasAuthCookie && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg).*)',
  ],
}
