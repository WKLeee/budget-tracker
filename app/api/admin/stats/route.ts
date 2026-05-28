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

async function getUserActivitySummaries(url: string, serviceKey: string) {
  const admin = createServiceClient(url, serviceKey)
  const { data, error } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  })

  if (error) {
    throw error
  }

  const recentUsers = data.users
    .map(user => ({
      email: user.email || '(no email)',
      created_at: user.created_at,
    }))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, 10)

  const recentActiveUsers = data.users
    .filter(user => user.last_sign_in_at)
    .map(user => ({
      email: user.email || '(no email)',
      last_sign_in_at: user.last_sign_in_at!,
    }))
    .sort((a, b) => Date.parse(b.last_sign_in_at) - Date.parse(a.last_sign_in_at))
    .slice(0, 10)

  return {
    recentUsers,
    recentActiveUsers,
  }
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

  try {
    const { recentUsers, recentActiveUsers } = await getUserActivitySummaries(
      url,
      serviceKey
    )
    return Response.json({
      ...data,
      recent_users: recentUsers,
      recent_active_users: recentActiveUsers,
    })
  } catch {
    return Response.json(data)
  }
}
