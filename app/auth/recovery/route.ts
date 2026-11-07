import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  if (code) {
    try {
      const supabase = await createClient()
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error) {
        return NextResponse.redirect(new URL('/reset-password', request.url))
      }
    } catch {
      // Invalid, expired, or unverifiable links must not open the password form.
    }
  }
  return NextResponse.redirect(new URL('/reset-password?error=invalid_link', request.url))
}
