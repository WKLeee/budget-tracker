import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    if (request.headers.get('authorization') !== `Bearer ${secret}`) {
      return Response.json({ error: 'unauthorized' }, { status: 401 })
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    const missing: string[] = []
    if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
    return Response.json({ error: 'not configured', missing }, { status: 500 })
  }

  const admin = createClient(url, serviceKey)

  // KST 기준 오늘
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000)
  const today = kstNow.toISOString().slice(0, 10)
  const todayDay = kstNow.getUTCDate()
  const lastDayOfMonth = new Date(
    kstNow.getUTCFullYear(),
    kstNow.getUTCMonth() + 1,
    0
  ).getDate()
  const isLastDay = todayDay === lastDayOfMonth

  const { data: rules } = await admin
    .from('recurring_transactions')
    .select('id, household_id, user_id, type, amount, category_id, memo, day_of_month, last_executed_date')
    .eq('enabled', true)

  if (!rules || rules.length === 0) {
    return Response.json({ inserted: 0, rules: 0 })
  }

  // 오늘 실행할 규칙 필터링:
  // - day_of_month == todayDay (정확히 일치)
  // - day_of_month > lastDayOfMonth 이고 오늘이 월말이면 자동 클램프
  // - last_executed_date가 오늘이면 이미 처리됨 (중복 방지)
  const todayRules = rules.filter(r => {
    if (r.last_executed_date === today) return false
    if (r.day_of_month === todayDay) return true
    if (r.day_of_month > lastDayOfMonth && isLastDay) return true
    return false
  })

  if (todayRules.length === 0) {
    return Response.json({ inserted: 0, rules: rules.length, matched: 0 })
  }

  // 거래 일괄 삽입
  const inserts = todayRules.map(r => ({
    household_id: r.household_id,
    user_id: r.user_id,
    type: r.type,
    amount: r.amount,
    category_id: r.category_id,
    memo: r.memo,
    date: today,
  }))

  const { error: insertError } = await admin.from('transactions').insert(inserts)
  if (insertError) {
    return Response.json({ error: 'insert failed', detail: insertError.message }, { status: 500 })
  }

  // last_executed_date 갱신
  await admin
    .from('recurring_transactions')
    .update({ last_executed_date: today })
    .in('id', todayRules.map(r => r.id))

  return Response.json({ inserted: todayRules.length, rules: rules.length })
}
