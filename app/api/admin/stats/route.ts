import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean)
  return adminEmails.includes(email.toLowerCase())
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isAdminEmail(user.email)) {
    return Response.json({ error: 'forbidden' }, { status: 403 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return Response.json({ error: 'service role key not configured' }, { status: 500 })
  }

  const admin = createServiceClient(url, serviceKey)
  const { data, error } = await admin.rpc('admin_get_stats')
  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json(data)
}
