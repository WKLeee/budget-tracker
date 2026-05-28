'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Transaction {
  id: string
  user_id: string
  type: 'income' | 'expense'
  amount: number
  memo: string
  date: string
  categories: { name: string; icon: string } | null
  profiles: { email: string; nickname: string | null } | null
}

interface Schedule {
  id: string
  title: string
  memo: string | null
  date: string
}

export default function DashboardPage() {
  const supabase = createClient()
  const [thisMonth, setThisMonth] = useState({ income: 0, expense: 0 })
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [householdId, setHouseholdId] = useState('')
  const [myId, setMyId] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })
  const [schedTitle, setSchedTitle] = useState('')
  const [savingSched, setSavingSched] = useState(false)

  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() // 0-indexed
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const todayStr = `${monthPrefix}-${String(now.getDate()).padStart(2, '0')}`

  const loadSchedules = useCallback(
    async (hid: string) => {
      const { data } = await supabase
        .from('schedules')
        .select('id, title, memo, date')
        .eq('household_id', hid)
        .gte('date', `${monthPrefix}-01`)
        .lte('date', `${monthPrefix}-31`)
        .order('date')
      setSchedules((data as Schedule[]) || [])
    },
    [supabase, monthPrefix]
  )

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        setMyId(user.id)

        const { data: memberRows } = await supabase
          .from('household_members')
          .select('household_id, joined_at')
          .eq('user_id', user.id)
          .order('joined_at', { ascending: false })

        const members = memberRows?.[0]
        if (!members) return
        setHouseholdId(members.household_id)

        const { data: transData } = await supabase
          .from('transactions')
          .select(`
            id,
            user_id,
            type,
            amount,
            memo,
            date,
            categories (name, icon)
          `)
          .eq('household_id', members.household_id)
          .gte('date', `${monthPrefix}-01`)
          .lte('date', `${monthPrefix}-31`)
          .order('date', { ascending: false })

        if (transData) {
          const income = transData
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + (t.amount || 0), 0)
          const expense = transData
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + (t.amount || 0), 0)
          setThisMonth({ income, expense })

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
  }, [supabase, monthPrefix, loadSchedules])

  const handleAddSchedule = async () => {
    if (!schedTitle.trim() || !householdId || !myId) return
    setSavingSched(true)
    const { error } = await supabase.from('schedules').insert({
      household_id: householdId,
      user_id: myId,
      title: schedTitle.trim(),
      date: selectedDate,
    })
    setSavingSched(false)
    if (error) {
      alert('일정 추가 실패: ' + error.message)
      return
    }
    setSchedTitle('')
    loadSchedules(householdId)
  }

  const handleDeleteSchedule = async (id: string) => {
    const { error } = await supabase.from('schedules').delete().eq('id', id)
    if (error) {
      alert('일정 삭제 실패: ' + error.message)
      return
    }
    loadSchedules(householdId)
  }

  if (isLoading) {
    return <div className="p-4">로딩 중...</div>
  }

  const balance = thisMonth.income - thisMonth.expense

  const dailyTotals: Record<string, { income: number; expense: number }> = {}
  for (const t of transactions) {
    const d = dailyTotals[t.date] ?? { income: 0, expense: 0 }
    if (t.type === 'income') d.income += t.amount
    else d.expense += t.amount
    dailyTotals[t.date] = d
  }

  const scheduleDates = new Set(schedules.map(s => s.date))

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const short = (n: number) =>
    n >= 10000 ? `${(n / 10000).toFixed(1).replace(/\.0$/, '')}만` : `${n}`

  const selectedTransactions = transactions.filter(t => t.date === selectedDate)
  const selectedSchedules = schedules.filter(s => s.date === selectedDate)
  const weekdays = ['일', '월', '화', '수', '목', '금', '토']

  return (
    <div className="p-4 max-w-md mx-auto">
      {/* 요약 카드 */}
      <div className="space-y-3 mb-6">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg p-4">
          <p className="text-sm opacity-80">이번 달 잔액</p>
          <p className="text-3xl font-bold mt-2">{balance.toLocaleString()}원</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">수입</p>
            <p className="text-lg font-bold text-green-600 mt-1">
              +{thisMonth.income.toLocaleString()}원
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">지출</p>
            <p className="text-lg font-bold text-red-600 mt-1">
              -{thisMonth.expense.toLocaleString()}원
            </p>
          </div>
        </div>
      </div>

      {/* 달력 */}
      <div className="mb-6">
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          {year}년 {month + 1}월
        </h2>

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
                {scheduleDates.has(dateStr) && (
                  <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-indigo-500" />
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
        <div className="space-y-2">
          {selectedSchedules.map(s => (
            <div
              key={s.id}
              className="flex items-center justify-between py-2 border-b border-gray-100"
            >
              <span className="text-sm text-gray-900">
                📌 {s.title}
                {s.memo ? <span className="text-gray-500"> · {s.memo}</span> : null}
              </span>
              <button
                type="button"
                onClick={() => handleDeleteSchedule(s.id)}
                className="text-gray-400 hover:text-red-500 text-lg leading-none px-2"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input
            type="text"
            value={schedTitle}
            onChange={(e) => setSchedTitle(e.target.value)}
            placeholder="일정 추가 (예: 월세 내는 날)"
            maxLength={50}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <button
            type="button"
            onClick={handleAddSchedule}
            disabled={savingSched}
            className="px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white text-sm font-medium rounded-lg whitespace-nowrap"
          >
            추가
          </button>
        </div>
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
              <div
                key={trans.id}
                className="flex items-center justify-between py-3 border-b border-gray-100"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {trans.categories?.icon} {trans.categories?.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {trans.profiles?.nickname || trans.profiles?.email.split('@')[0]}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
