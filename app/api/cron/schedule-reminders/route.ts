import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY

if (publicKey && privateKey) {
  webpush.setVapidDetails('mailto:noreply@budget-tracker.app', publicKey, privateKey)
}

export async function GET(request: Request) {
  // Vercel 크론은 CRON_SECRET이 설정되면 Authorization 헤더로 호출함
  const secret = process.env.CRON_SECRET
  if (secret) {
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const missing: string[] = []
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (!publicKey) missing.push('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
  if (!privateKey) missing.push('VAPID_PRIVATE_KEY')
  if (missing.length) {
    return Response.json({ error: 'not configured', missing }, { status: 500 })
  }

  // 크론은 로그인 세션이 없으므로 서비스롤로 RLS 우회 (서버 전용)
  const admin = createClient(url, serviceKey)

  // KST 기준 오늘 (크론은 00:00 UTC = 09:00 KST 실행)
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

  const { data: schedules } = await admin
    .from('schedules')
    .select('id, title, household_id')
    .eq('date', today)
    .eq('notified', false)

  if (!schedules || schedules.length === 0) {
    return Response.json({ sent: 0, schedules: 0 })
  }

  const householdIds = [...new Set(schedules.map((s) => s.household_id))]
  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('household_id, subscription')
    .in('household_id', householdIds)

  const subsByHousehold: Record<string, unknown[]> = {}
  for (const s of subs ?? []) {
    ;(subsByHousehold[s.household_id] ??= []).push(s.subscription)
  }

  let sent = 0
  await Promise.all(
    schedules.flatMap((sch) => {
      const list = subsByHousehold[sch.household_id] ?? []
      const payload = JSON.stringify({
        title: `오늘 일정: ${sch.title}`,
        body: '',
        url: '/dashboard',
      })
      return list.map(async (sub) => {
        try {
          await webpush.sendNotification(sub as webpush.PushSubscription, payload)
          sent++
        } catch {
          // 만료된 구독 등은 무시
        }
      })
    })
  )

  await admin
    .from('schedules')
    .update({ notified: true })
    .in(
      'id',
      schedules.map((s) => s.id)
    )

  return Response.json({ sent, schedules: schedules.length })
}
