import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ isAdmin: false })
  }

  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  const isAdmin = adminEmails.includes((user.email || '').toLowerCase())

  return Response.json({ isAdmin })
}
