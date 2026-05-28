import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY

if (publicKey && privateKey) {
  webpush.setVapidDetails('mailto:noreply@budget-tracker.app', publicKey, privateKey)
}

export async function POST(request: Request) {
  if (!publicKey || !privateKey) {
    return Response.json({ error: 'VAPID keys not configured' }, { status: 500 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { householdId, kind } = body
  if (!householdId) {
    return Response.json({ error: 'householdId required' }, { status: 400 })
  }

  // 같은 가계부의 다른 멤버 구독만 조회 (RLS가 멤버 외 접근 차단)
  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, subscription')
    .eq('household_id', householdId)
    .neq('user_id', user.id)

  if (!subs || subs.length === 0) {
    return Response.json({ sent: 0 })
  }

  // 보낸 사람 이름 (닉네임 우선)
  const { data: me } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  const name = me?.nickname || me?.email?.split('@')[0] || '멤버'

  let title: string
  if (kind === 'schedule') {
    // "{이름}님이 일정 추가 📌 {제목} (매월)"
    const { scheduleTitle, scheduleIcon, recurrence, date } = body
    const recLabel =
      recurrence === 'weekly'
        ? '매주'
        : recurrence === 'monthly'
        ? '매월'
        : recurrence === 'yearly'
        ? '매년'
        : ''
    const dateLabel = typeof date === 'string' ? date.slice(5).replace('-', '/') : ''
    const suffix = recLabel || dateLabel
    title = [
      `${name}님이 일정 추가`,
      `${scheduleIcon ?? '📌'} ${scheduleTitle ?? ''}`.trim(),
      suffix ? `(${suffix})` : '',
    ]
      .filter(Boolean)
      .join(' ')
  } else {
    const { amount, type, category } = body
    const typeLabel = type === 'income' ? '수입' : '지출'
    const amountStr =
      typeof amount === 'number' ? amount.toLocaleString() : `${amount ?? ''}`
    // iOS는 제목 줄을 항상 표시(비우면 앱 이름)하므로, 전체 문장을 제목 한 줄에 넣고 본문은 비움
    // "{이름}님이 {금액}원 {카테고리} {지출/수입} 추가"
    title = [`${name}님이`, `${amountStr}원`, category, `${typeLabel} 추가`]
      .filter(Boolean)
      .join(' ')
  }

  const payload = JSON.stringify({
    title,
    body: '',
    url: '/dashboard',
  })

  let sent = 0
  await Promise.all(
    subs.map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription as webpush.PushSubscription, payload)
        sent++
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        // 만료/삭제된 구독 정리 (본인 소유 구독만 RLS상 삭제됨)
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint)
        }
      }
    })
  )

  return Response.json({ sent })
}
