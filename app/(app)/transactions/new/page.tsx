'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { sortByDefaultOrder } from '@/lib/categories'
import {
  DEFAULT_IMPORTANT_SCHEDULE_COLOR,
  IMPORTANT_SCHEDULE_COLORS,
} from '@/lib/importantScheduleColors'
import { SCHEDULE_CATEGORIES, getScheduleCategory } from '@/lib/scheduleCategories'
import AppLoading from '@/components/AppLoading'

interface Category {
  id: string
  name: string
  icon: string
  type: 'income' | 'expense'
}

interface RecurringRule {
  id: string
  type: 'income' | 'expense'
  amount: number
  memo: string | null
  day_of_month: number
  enabled: boolean
  category_id: string | null
  categories: { name: string; icon: string } | null
}

interface MemberOption {
  id: string
  label: string
}

function getTodayString() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function normalizeDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const parsed = new Date(`${value}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return null
  const normalized = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  return normalized === value ? value : null
}

export default function NewTransactionPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const initialDate = normalizeDateParam(searchParams.get('date')) ?? getTodayString()
  const [mode, setMode] = useState<'transaction' | 'schedule'>('transaction')
  const [txRecurrence, setTxRecurrence] = useState<'none' | 'monthly'>('none')
  const [recurDayOfMonth, setRecurDayOfMonth] = useState(1)
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([])
  const [recurringRefetch, setRecurringRefetch] = useState(0)
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [date, setDate] = useState(initialDate)
  const [transactionOwnerId, setTransactionOwnerId] = useState('shared')
  const [memberOptions, setMemberOptions] = useState<MemberOption[]>([])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [householdId, setHouseholdId] = useState('')
  const [schedTitle, setSchedTitle] = useState('')
  const [schedMemo, setSchedMemo] = useState('')
  const [schedTime, setSchedTime] = useState('')
  const [schedCategory, setSchedCategory] = useState('general')
  const [schedImportant, setSchedImportant] = useState(false)
  const [schedImportantColor, setSchedImportantColor] = useState(
    DEFAULT_IMPORTANT_SCHEDULE_COLOR
  )
  const [schedRecurrence, setSchedRecurrence] = useState<
    'none' | 'weekly' | 'monthly' | 'yearly'
  >('none')

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

        if (!members) {
          router.push('/settings')
          return
        }

        setHouseholdId(members.household_id)
        setTransactionOwnerId(user.id)

        const { data: membersData } = await supabase
          .from('household_members')
          .select('user_id')
          .eq('household_id', members.household_id)

        if (membersData && membersData.length > 0) {
          const memberIds = membersData.map(m => m.user_id)
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, email, nickname')
            .in('id', memberIds)

          setMemberOptions(
            memberIds.map(id => {
              const profile = profilesData?.find(p => p.id === id)
              return {
                id,
                label: profile?.nickname || profile?.email?.split('@')[0] || '멤버',
              }
            })
          )
        }

        const { data: catData } = await supabase
          .from('categories')
          .select('*')
          .eq('household_id', members.household_id)
          .order('is_default', { ascending: false })

        if (catData) {
          const sorted = sortByDefaultOrder(catData as Category[])
          setCategories(sorted)
          // 첫 번째 같은 타입의 카테고리 선택
          const defaultCat = sorted.find(c => c.type === 'expense')
          if (defaultCat) setSelectedCategory(defaultCat.id)
        }

        const { data: ruleData } = await supabase
          .from('recurring_transactions')
          .select(`
            id, type, amount, memo, day_of_month, enabled, category_id,
            categories (name, icon)
          `)
          .eq('household_id', members.household_id)
          .order('day_of_month')
        if (ruleData) setRecurringRules(ruleData as unknown as RecurringRule[])
      } catch (error) {
        console.error('데이터 조회 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [supabase, router, recurringRefetch])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (mode === 'schedule') {
      if (!schedTitle.trim() || !householdId) {
        alert('제목을 입력해주세요')
        return
      }
      setIsSaving(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        let importantOrder: number | null = null
        if (schedImportant) {
          const { data: lastImportant } = await supabase
            .from('schedules')
            .select('important_order')
            .eq('household_id', householdId)
            .eq('is_important', true)
            .order('important_order', { ascending: false, nullsFirst: false })
            .limit(1)
          importantOrder = (lastImportant?.[0]?.important_order ?? 0) + 1
        }

        const { error } = await supabase.from('schedules').insert({
          household_id: householdId,
          user_id: user.id,
          title: schedTitle.trim(),
          date,
          time: schedTime || null,
          memo: schedMemo.trim() || null,
          category: schedCategory,
          recurrence: schedRecurrence,
          is_important: schedImportant,
          important_color: schedImportant ? schedImportantColor : null,
          important_order: importantOrder,
        })
        if (error) {
          alert('일정 저장 실패: ' + error.message)
          return
        }

        // 다른 멤버에게 일정 추가 푸시 알림 (실패해도 저장에는 영향 없음)
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'schedule',
            householdId,
            scheduleTitle: schedTitle.trim(),
            scheduleIcon: getScheduleCategory(schedCategory).icon,
            recurrence: schedRecurrence,
            date,
          }),
        }).catch(() => {})

        router.push('/dashboard')
      } catch (error) {
        console.error('일정 저장 실패:', error)
        alert('일정 저장 중 오류가 발생했습니다')
      } finally {
        setIsSaving(false)
      }
      return
    }

    if (!amount || !selectedCategory || !householdId) {
      alert('모든 필드를 입력해주세요')
      return
    }

    setIsSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // 매월 반복 → recurring_transactions 테이블에 저장 (목록만 갱신, redirect X)
      if (txRecurrence === 'monthly') {
        const { error } = await supabase.from('recurring_transactions').insert({
          household_id: householdId,
          user_id: transactionOwnerId === 'shared' ? null : transactionOwnerId,
          type: transactionType,
          amount: Math.round(Number(amount)),
          category_id: selectedCategory,
          memo: memo || null,
          day_of_month: recurDayOfMonth,
          enabled: true,
        })
        if (error) {
          alert('고정 거래 저장 실패: ' + error.message)
          return
        }
        setAmount('')
        setMemo('')
        setRecurringRefetch(t => t + 1)
        return
      }

      const { error } = await supabase.from('transactions').insert({
        household_id: householdId,
        user_id: transactionOwnerId === 'shared' ? null : transactionOwnerId,
        type: transactionType,
        amount: Math.round(Number(amount)),
        category_id: selectedCategory,
        memo,
        date,
      })

      if (error) {
        alert('거래 저장 실패: ' + error.message)
        return
      }

      // 다른 멤버에게 푸시 알림 (실패해도 저장에는 영향 없음)
      const catName = categories.find(c => c.id === selectedCategory)?.name
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          householdId,
          amount: Math.round(Number(amount)),
          type: transactionType,
          category: catName,
        }),
      }).catch(() => {})

      router.push('/dashboard')
    } catch (error) {
      console.error('거래 저장 실패:', error)
      alert('거래 저장 중 오류가 발생했습니다')
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <AppLoading />
  }

  const filteredCategories = categories.filter(c => c.type === transactionType)

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {mode === 'schedule' ? '일정 추가' : '거래 추가'}
      </h1>

      {/* 모드 토글: 거래 / 일정 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          type="button"
          onClick={() => setMode('transaction')}
          className={`flex items-center justify-center gap-2 py-3 rounded-lg text-base font-semibold transition ${
            mode === 'transaction'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          <span className="text-lg">💰</span>
          <span>거래</span>
        </button>
        <button
          type="button"
          onClick={() => setMode('schedule')}
          className={`flex items-center justify-center gap-2 py-3 rounded-lg text-base font-semibold transition ${
            mode === 'schedule'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          <span className="text-lg">📅</span>
          <span>일정</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {mode === 'transaction' && (
          <>
            {/* 타입 선택 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">거래 유형</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTransactionType('expense')
                    setSelectedCategory('')
                  }}
                  className={`flex-1 py-2 rounded-lg font-medium transition ${
                    transactionType === 'expense'
                      ? 'bg-red-700 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  지출
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTransactionType('income')
                    setSelectedCategory('')
                  }}
                  className={`flex-1 py-2 rounded-lg font-medium transition ${
                    transactionType === 'income'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  수입
                </button>
              </div>
            </div>

            {/* 멤버 선택 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">멤버</label>
              <select
                value={transactionOwnerId}
                onChange={(e) => setTransactionOwnerId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="shared">공동</option>
                {memberOptions.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 금액 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">금액 (원)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg"
                required
              />
            </div>

            {/* 카테고리 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">카테고리</label>
              {filteredCategories.length === 0 ? (
                <p className="text-gray-500 text-sm">카테고리가 없습니다</p>
              ) : (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                >
                  <option value="">선택해주세요</option>
                  {filteredCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.icon} {cat.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}

        {mode === 'schedule' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">제목</label>
              <input
                type="text"
                value={schedTitle}
                onChange={(e) => setSchedTitle(e.target.value)}
                placeholder="예: 월세 내는 날"
                maxLength={50}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                required
              />
              <p className="text-xs text-gray-500 mt-2">알림은 그날 오전 8시에 와요</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">카테고리</label>
              <div className="grid grid-cols-3 gap-2">
                {SCHEDULE_CATEGORIES.map(cat => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setSchedCategory(cat.key)}
                    className={`flex items-center justify-center gap-1 py-2 rounded-lg border text-sm transition ${
                      schedCategory === cat.key
                        ? 'border-indigo-500 bg-indigo-50 text-gray-900'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                    style={
                      schedCategory === cat.key
                        ? { borderColor: cat.color, backgroundColor: `${cat.color}15` }
                        : undefined
                    }
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">반복</label>
              <div className="grid grid-cols-4 gap-2">
                {(['none', 'weekly', 'monthly', 'yearly'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setSchedRecurrence(r)}
                    className={`py-2 rounded-lg text-sm font-medium border transition ${
                      schedRecurrence === r
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {r === 'none'
                      ? '한 번'
                      : r === 'weekly'
                      ? '매주'
                      : r === 'monthly'
                      ? '매월'
                      : '매년'}
                  </button>
                ))}
              </div>
              {schedRecurrence !== 'none' && (
                <p className="text-xs text-gray-500 mt-2">
                  {schedRecurrence === 'weekly'
                    ? '선택한 요일마다 반복돼요'
                    : schedRecurrence === 'monthly'
                    ? '매월 같은 날짜마다 반복돼요'
                    : '매년 같은 날짜마다 반복돼요'}
                </p>
              )}
            </div>

            <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-4 py-3">
              <span>
                <span className="block text-sm font-medium text-gray-900">중요 일정</span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  일정 탭 최상단에 따로 표시돼요
                </span>
              </span>
              <input
                type="checkbox"
                checked={schedImportant}
                onChange={(e) => setSchedImportant(e.target.checked)}
                className="h-5 w-5 accent-indigo-600"
              />
            </label>

            {schedImportant && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  중요 일정 색상
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {IMPORTANT_SCHEDULE_COLORS.map(color => (
                    <button
                      key={color.key}
                      type="button"
                      onClick={() => setSchedImportantColor(color.key)}
                      title={color.label}
                      aria-label={color.label}
                      className={`h-10 rounded-lg border-2 transition ${
                        schedImportantColor === color.key
                          ? 'border-gray-900 scale-105'
                          : 'border-white shadow-sm'
                      }`}
                      style={{ background: color.background }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">날짜</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  시간 <span className="text-gray-400 text-xs">(선택)</span>
                </label>
                <input
                  type="time"
                  value={schedTime}
                  onChange={(e) => setSchedTime(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">메모</label>
              <textarea
                value={schedMemo}
                onChange={(e) => setSchedMemo(e.target.value)}
                placeholder="선택사항"
                rows={3}
                maxLength={500}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
              />
            </div>
          </>
        )}

        {/* 거래: 반복 선택 + 날짜 또는 매월 N일 */}
        {mode === 'transaction' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">반복</label>
              <div className="grid grid-cols-2 gap-2">
                {(['none', 'monthly'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setTxRecurrence(r)}
                    className={`py-2 rounded-lg text-sm font-medium border transition ${
                      txRecurrence === r
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                        : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {r === 'none' ? '한 번' : '매월 반복'}
                  </button>
                ))}
              </div>
            </div>

            {/* 고정 거래 목록 (매월 반복 선택했을 때) */}
            {txRecurrence === 'monthly' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  내 고정 거래 ({recurringRules.length})
                </label>
                {recurringRules.length === 0 ? (
                  <p className="text-sm text-gray-500 py-2">아직 등록된 고정 거래가 없어요</p>
                ) : (
                  <div className="space-y-2">
                    {recurringRules.map(r => (
                      <div
                        key={r.id}
                        className={`flex items-center justify-between p-3 rounded-lg border ${
                          r.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">
                            {r.categories?.icon} {r.categories?.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            매월 {r.day_of_month}일 · {r.type === 'income' ? '+' : '-'}
                            {r.amount.toLocaleString()}원
                            {r.memo ? ` · ${r.memo}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                          <button
                            type="button"
                            onClick={async () => {
                              const { error } = await supabase
                                .from('recurring_transactions')
                                .update({ enabled: !r.enabled })
                                .eq('id', r.id)
                              if (error) {
                                alert('변경 실패: ' + error.message)
                                return
                              }
                              setRecurringRefetch(t => t + 1)
                            }}
                            className={`text-xs px-2 py-1 rounded ${
                              r.enabled
                                ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
                                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                            }`}
                          >
                            {r.enabled ? '켜짐' : '꺼짐'}
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!window.confirm('이 고정 거래를 삭제할까요?')) return
                              const { error } = await supabase
                                .from('recurring_transactions')
                                .delete()
                                .eq('id', r.id)
                              if (error) {
                                alert('삭제 실패: ' + error.message)
                                return
                              }
                              setRecurringRefetch(t => t + 1)
                            }}
                            className="text-gray-400 hover:text-red-500 text-lg leading-none px-1"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {txRecurrence === 'none' ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">날짜</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  required
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">매월 며칠</label>
                <select
                  value={recurDayOfMonth}
                  onChange={(e) => setRecurDayOfMonth(Number(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>
                      매월 {d}일
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-2">
                  해당 일자에 자동으로 거래가 추가돼요. 그달에 그 날짜가 없으면(예: 2월 31일) 그달 마지막 날에 처리.
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">메모</label>
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="선택사항"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
          </>
        )}

        {/* 저장 버튼 */}
        <button
          type="submit"
          disabled={isSaving}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition"
        >
          {isSaving ? '저장 중...' : '저장'}
        </button>
      </form>
    </div>
  )
}
