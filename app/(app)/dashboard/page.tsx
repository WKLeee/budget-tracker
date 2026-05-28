'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getScheduleCategory,
  RECURRENCE_LABELS,
  RECURRENCE_COLORS,
  scheduleMatchesDate,
} from '@/lib/scheduleCategories'
import { sortByDefaultOrder } from '@/lib/categories'
import EditTransactionModal from '@/components/EditTransactionModal'
import EditScheduleModal from '@/components/EditScheduleModal'
import EditRecurringRuleModal from '@/components/EditRecurringRuleModal'

interface Transaction {
  id: string
  user_id: string
  type: 'income' | 'expense'
  amount: number
  memo: string
  date: string
  category_id: string | null
  categories: { name: string; icon: string } | null
  profiles: { email: string; nickname: string | null } | null
  isRecurring?: boolean
}

interface RecurringRule {
  id: string
  user_id: string
  type: 'income' | 'expense'
  amount: number
  memo: string | null
  day_of_month: number
  enabled: boolean
  category_id: string | null
  last_executed_date: string | null
  categories: { name: string; icon: string } | null
}

interface Category {
  id: string
  name: string
  icon: string
  type: 'income' | 'expense'
}

interface Schedule {
  id: string
  title: string
  memo: string | null
  date: string
  time: string | null
  category: string | null
  recurrence: string | null
}

export default function DashboardPage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([])
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null)
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [refetchTick, setRefetchTick] = useState(0)
  const [selectedDate, setSelectedDate] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })

  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth()) // 0-indexed
  const year = viewYear
  const month = viewMonth
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  const goTo = (y: number, m: number) => {
    const d = new Date(y, m, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth())
    setSelectedDate(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    )
  }
  const goPrevMonth = () => goTo(viewYear, viewMonth - 1)
  const goNextMonth = () => goTo(viewYear, viewMonth + 1)
  const goPrevYear = () => goTo(viewYear - 1, viewMonth)
  const goNextYear = () => goTo(viewYear + 1, viewMonth)

  const loadSchedules = useCallback(
    async (hid: string) => {
      const [py, pm] = monthPrefix.split('-').map(Number)
      const lastDay = new Date(py, pm, 0).getDate()
      const monthEnd = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`
      const [oneTimeRes, recurringRes] = await Promise.all([
        supabase
          .from('schedules')
          .select('id, title, memo, date, time, category, recurrence')
          .eq('household_id', hid)
          .or('recurrence.is.null,recurrence.eq.none')
          .gte('date', `${monthPrefix}-01`)
          .lte('date', monthEnd)
          .order('date'),
        supabase
          .from('schedules')
          .select('id, title, memo, date, time, category, recurrence')
          .eq('household_id', hid)
          .in('recurrence', ['weekly', 'monthly', 'yearly'])
          .lte('date', monthEnd)
          .order('date'),
      ])
      const merged = [
        ...((oneTimeRes.data as Schedule[]) || []),
        ...((recurringRes.data as Schedule[]) || []),
      ]
      setSchedules(merged)
    },
    [supabase, monthPrefix]
  )

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: memberRows } = await supabase
          .from('household_members')
          .select('household_id, joined_at')
          .eq('user_id', user.id)
          .order('joined_at', { ascending: false })

        const members = memberRows?.[0]
        if (!members) return

        const lastDay = new Date(year, month + 1, 0).getDate()
        const monthEnd = `${monthPrefix}-${String(lastDay).padStart(2, '0')}`

        const { data: transData } = await supabase
          .from('transactions')
          .select(`
            id,
            user_id,
            type,
            amount,
            memo,
            date,
            category_id,
            categories (name, icon)
          `)
          .eq('household_id', members.household_id)
          .gte('date', `${monthPrefix}-01`)
          .lte('date', monthEnd)
          .order('date', { ascending: false })

        const { data: catData } = await supabase
          .from('categories')
          .select('id, name, icon, type')
          .eq('household_id', members.household_id)
        if (catData) setCategories(sortByDefaultOrder(catData as Category[]))

        const { data: ruleData } = await supabase
          .from('recurring_transactions')
          .select(`
            id, user_id, type, amount, memo, day_of_month, enabled,
            category_id, last_executed_date,
            categories (name, icon)
          `)
          .eq('household_id', members.household_id)
          .eq('enabled', true)
        if (ruleData) setRecurringRules(ruleData as unknown as RecurringRule[])

        if (transData) {
          const rows = transData as unknown as Transaction[]
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('*')
            .in('id', [...new Set(rows.map(t => t.user_id))])

          setTransactions(
            rows.map(t => {
              const profile = profilesData?.find(p => p.id === t.user_id)
              return {
                ...t,
                profiles: profile
                  ? { email: profile.email, nickname: profile.nickname ?? null }
                  : null,
              }
            })
          )
        }

        await loadSchedules(members.household_id)
      } catch (error) {
        console.error('데이터 조회 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [supabase, monthPrefix, loadSchedules, refetchTick])

  if (isLoading) {
    return <div className="p-4">로딩 중...</div>
  }

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // 매월 반복 거래를 viewed month의 가상 거래로 합성 (해당 월에 이미 실행되지 않은 것만)
  const virtualRecurringTxns: Transaction[] = recurringRules
    .filter(r => !r.last_executed_date || !r.last_executed_date.startsWith(monthPrefix))
    .map(r => {
      const day = Math.min(r.day_of_month, daysInMonth)
      return {
        id: `recurring-${r.id}`,
        user_id: r.user_id,
        type: r.type,
        amount: r.amount,
        memo: r.memo ?? '',
        date: `${monthPrefix}-${String(day).padStart(2, '0')}`,
        category_id: r.category_id,
        categories: r.categories,
        profiles: null,
        isRecurring: true,
      }
    })
  const allTransactions = [...transactions, ...virtualRecurringTxns]

  const dailyTotals: Record<string, { income: number; expense: number }> = {}
  for (const t of allTransactions) {
    const d = dailyTotals[t.date] ?? { income: 0, expense: 0 }
    if (t.type === 'income') d.income += t.amount
    else d.expense += t.amount
    dailyTotals[t.date] = d
  }
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const scheduleColorByDate: Record<string, string> = {}
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`
    const match = schedules.find(s => scheduleMatchesDate(s, dateStr))
    if (match) scheduleColorByDate[dateStr] = getScheduleCategory(match.category).color
  }

  const short = (n: number) =>
    n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만` : `${n}`

  const selectedTransactions = allTransactions.filter(t => t.date === selectedDate)
  const recurrenceRank: Record<string, number> = { yearly: 0, monthly: 1, weekly: 2, none: 3 }
  const selectedSchedules = schedules
    .filter(s => scheduleMatchesDate(s, selectedDate))
    .sort((a, b) => {
      const recDiff =
        (recurrenceRank[a.recurrence ?? 'none'] ?? 3) -
        (recurrenceRank[b.recurrence ?? 'none'] ?? 3)
      if (recDiff !== 0) return recDiff
      // 같은 반복 그룹 안에서는 시간순 (없는 건 뒤로)
      const at = a.time ?? '99:99'
      const bt = b.time ?? '99:99'
      return at < bt ? -1 : at > bt ? 1 : 0
    })
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="p-4 max-w-md mx-auto">
      {/* 달력 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goPrevYear}
              className="w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm font-bold"
              aria-label="이전 년"
            >
              «
            </button>
            <button
              type="button"
              onClick={goPrevMonth}
              className="w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100 flex items-center justify-center text-lg"
              aria-label="이전 달"
            >
              ‹
            </button>
          </div>
          <h2 className="text-lg font-bold text-gray-900">
            {year}년 {month + 1}월
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goNextMonth}
              className="w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100 flex items-center justify-center text-lg"
              aria-label="다음 달"
            >
              ›
            </button>
            <button
              type="button"
              onClick={goNextYear}
              className="w-9 h-9 rounded-lg text-gray-600 hover:bg-gray-100 flex items-center justify-center text-sm font-bold"
              aria-label="다음 년"
            >
              »
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {weekdays.map((w, i) => (
            <div
              key={w}
              className={`text-center text-xs font-medium py-1 ${
                i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-gray-500'
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`blank-${idx}`} />

            const dateStr = `${monthPrefix}-${String(day).padStart(2, '0')}`
            const totals = dailyTotals[dateStr]
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => setSelectedDate(dateStr)}
                className={`relative aspect-square rounded-lg flex flex-col items-center justify-start pt-1 px-0.5 border transition ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-transparent hover:bg-gray-50'
                }`}
              >
                {scheduleColorByDate[dateStr] && (
                  <span
                    className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: scheduleColorByDate[dateStr] }}
                  />
                )}
                <span
                  className={`text-xs ${
                    isToday
                      ? 'bg-indigo-600 text-white rounded-full w-5 h-5 flex items-center justify-center'
                      : 'text-gray-900'
                  }`}
                >
                  {day}
                </span>
                {totals?.expense ? (
                  <span className="text-[9px] leading-tight text-red-500 mt-0.5">
                    -{short(totals.expense)}
                  </span>
                ) : null}
                {totals?.income ? (
                  <span className="text-[9px] leading-tight text-green-600">
                    +{short(totals.income)}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>

      {/* 선택한 날짜의 일정 */}
      <div className="mb-6">
        <h2 className="text-base font-bold text-gray-900 mb-3">
          {Number(selectedDate.split('-')[1])}월 {Number(selectedDate.split('-')[2])}일 일정
        </h2>
        {selectedSchedules.length === 0 ? (
          <p className="text-gray-500 text-sm py-2">이 날의 일정이 없습니다</p>
        ) : (
          <div className="space-y-2">
            {selectedSchedules.map(s => {
              const cat = getScheduleCategory(s.category)
              const rec = s.recurrence ?? 'none'
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setEditingSchedule(s)}
                  className="w-full flex items-start justify-between py-2 border-b border-gray-100 gap-2 text-left hover:bg-gray-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {s.time && (
                        <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
                          {s.time}
                        </span>
                      )}
                      <span className="text-sm text-gray-900">
                        {cat.icon} {s.title}
                      </span>
                      {rec !== 'none' && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: `${RECURRENCE_COLORS[rec]}20`,
                            color: RECURRENCE_COLORS[rec],
                          }}
                        >
                          {RECURRENCE_LABELS[rec]}
                        </span>
                      )}
                    </div>
                    {s.memo ? (
                      <p className="text-xs text-gray-500 mt-1 whitespace-pre-wrap break-words">
                        {s.memo}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-gray-300 text-sm flex-shrink-0 pr-1">›</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 선택한 날짜의 거래 */}
      <div>
        <h2 className="text-base font-bold text-gray-900 mb-3">
          {Number(selectedDate.split('-')[1])}월 {Number(selectedDate.split('-')[2])}일 거래
        </h2>
        {selectedTransactions.length === 0 ? (
          <p className="text-gray-500 text-center py-6 text-sm">이 날의 거래가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {selectedTransactions.map(trans => (
              <button
                key={trans.id}
                type="button"
                onClick={() => {
                  if (trans.isRecurring) {
                    const ruleId = trans.id.replace(/^recurring-/, '')
                    const rule = recurringRules.find(r => r.id === ruleId)
                    if (rule) setEditingRule(rule)
                    return
                  }
                  setEditing(trans)
                }}
                className={`w-full flex items-center justify-between py-3 border-b border-gray-100 text-left transition ${
                  trans.isRecurring ? 'opacity-60 hover:bg-gray-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {trans.isRecurring && <span title="매월 반복">🔁 </span>}
                    {trans.categories?.icon} {trans.categories?.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {trans.isRecurring
                      ? '예정 (매월 자동 등록)'
                      : trans.profiles?.nickname || trans.profiles?.email.split('@')[0]}
                  </p>
                  {trans.memo && (
                    <p className="text-xs text-gray-600 mt-0.5">{trans.memo}</p>
                  )}
                </div>
                <p
                  className={`text-right font-bold ${
                    trans.type === 'income' ? 'text-green-600' : 'text-gray-900'
                  }`}
                >
                  {trans.type === 'income' ? '+' : '-'}
                  {trans.amount.toLocaleString()}원
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditTransactionModal
          transaction={editing}
          categories={categories}
          supabase={supabase}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setRefetchTick(t => t + 1)
          }}
        />
      )}

      {editingSchedule && (
        <EditScheduleModal
          schedule={editingSchedule}
          supabase={supabase}
          onClose={() => setEditingSchedule(null)}
          onSaved={() => {
            setEditingSchedule(null)
            setRefetchTick(t => t + 1)
          }}
        />
      )}

      {editingRule && (
        <EditRecurringRuleModal
          rule={editingRule}
          categories={categories}
          supabase={supabase}
          onClose={() => setEditingRule(null)}
          onSaved={() => {
            setEditingRule(null)
            setRefetchTick(t => t + 1)
          }}
        />
      )}
    </div>
  )
}
