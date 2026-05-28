import { type NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.next()
    }

    // 클라이언트 구성 (middleware에서는 쿠키로만 작동)
    let response = NextResponse.next()

    const supabase = createServerClient(
      supabaseUrl,
      supabaseKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            )
          },
        },
      }
    )

    const { data: { session } } = await supabase.auth.getSession()

    // 보호된 라우트 (라우트 그룹 (app)은 실제 경로에 안 나타나므로 실제 경로로 체크)
    const protectedPaths = ['/dashboard', '/transactions', '/stats', '/budget', '/settings', '/admin']
    const isProtected = protectedPaths.some((p) =>
      request.nextUrl.pathname.startsWith(p)
    )
    if (!session && isProtected) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // 로그인 후 /login, /signup 접근 시 /dashboard로 리다이렉트
    if (session && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/signup')) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    return response
  } catch {
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg).*)',
  ],
}
