'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sortByDefaultOrder } from '@/lib/categories'
import EditTransactionModal from '@/components/EditTransactionModal'
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

interface Category {
  id: string
  name: string
  icon: string
  type: 'income' | 'expense'
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

export default function TransactionsPage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [recurringRules, setRecurringRules] = useState<RecurringRule[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [isLoading, setIsLoading] = useState(true)

  const [editing, setEditing] = useState<Transaction | null>(null)
  const [editingRule, setEditingRule] = useState<RecurringRule | null>(null)

  const fetchTransactions = useCallback(async () => {
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

      const [year, month] = selectedMonth.split('-')
      const lastDay = new Date(Number(year), Number(month), 0).getDate()

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
        .gte('date', `${year}-${month}-01`)
        .lte('date', `${year}-${month}-${lastDay}`)
        .order('date', { ascending: false })

      const rows = (transData as unknown as Transaction[]) || []

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

      const { data: ruleData } = await supabase
        .from('recurring_transactions')
        .select(`
          id, user_id, type, amount, memo, day_of_month, enabled,
          category_id, last_executed_date,
          categories (name, icon)
        `)
        .eq('household_id', members.household_id)
        .eq('enabled', true)
      setRecurringRules((ruleData as unknown as RecurringRule[]) || [])
    } catch (error) {
      console.error('거래 조회 실패:', error)
    } finally {
      setIsLoading(false)
    }
  }, [supabase, selectedMonth])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // 카테고리 조회 (수정 시 카테고리 변경용)
  useEffect(() => {
    const fetchCategories = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: memberRows } = await supabase
        .from('household_members')
        .select('household_id, joined_at')
        .eq('user_id', user.id)
        .order('joined_at', { ascending: false })

      const householdId = memberRows?.[0]?.household_id
      if (!householdId) return

      const { data: catData } = await supabase
        .from('categories')
        .select('id, name, icon, type')
        .eq('household_id', householdId)

      if (catData) setCategories(sortByDefaultOrder(catData as Category[]))
    }

    fetchCategories()
  }, [supabase])

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  })

  if (isLoading) {
    return <div className="p-4">로딩 중...</div>
  }

  // selectedMonth 의 매월 반복 가상 거래 합성 (이미 실행된 건 제외)
  const [selYear, selMonth] = selectedMonth.split('-').map(Number)
  const selDaysInMonth = new Date(selYear, selMonth, 0).getDate()
  const virtualRecurringTxns: Transaction[] = recurringRules
    .filter(r => !r.last_executed_date || !r.last_executed_date.startsWith(selectedMonth))
    .map(r => {
      const day = Math.min(r.day_of_month, selDaysInMonth)
      return {
        id: `recurring-${r.id}`,
        user_id: r.user_id,
        type: r.type,
        amount: r.amount,
        memo: r.memo ?? '',
        date: `${selectedMonth}-${String(day).padStart(2, '0')}`,
        category_id: r.category_id,
        categories: r.categories,
        profiles: null,
        isRecurring: true,
      }
    })

  const allTransactions = [...transactions, ...virtualRecurringTxns].sort(
    (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
  )

  const income = allTransactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + (t.amount || 0), 0)

  const expense = allTransactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + (t.amount || 0), 0)

  const balance = income - expense

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">거래 내역</h1>

      {/* 월 선택 */}
      <div className="mb-4">
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
        >
          {months.map(m => (
            <option key={m} value={m}>
              {m.split('-')[0]}년 {Number(m.split('-')[1])}월
            </option>
          ))}
        </select>
      </div>

      {/* 월별 요약 */}
      <div className="space-y-3 mb-6">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg p-4">
          <p className="text-sm opacity-80">잔액</p>
          <p className="text-3xl font-bold mt-2">{balance.toLocaleString()}원</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">지출</p>
            <p className="text-lg font-bold text-red-600 mt-1">
              -{expense.toLocaleString()}원
            </p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-gray-600">수입</p>
            <p className="text-lg font-bold text-green-600 mt-1">
              +{income.toLocaleString()}원
            </p>
          </div>
        </div>
      </div>

      {/* 거래 목록 */}
      {allTransactions.length === 0 ? (
        <p className="text-gray-500 text-center py-8">거래가 없습니다</p>
      ) : (
        <div className="space-y-3">
          {allTransactions.map(trans => (
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
              className={`w-full flex items-center justify-between p-4 rounded-lg border text-left transition ${
                trans.isRecurring
                  ? 'bg-white border-gray-100 opacity-70 hover:bg-gray-50'
                  : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
              }`}
            >
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {trans.isRecurring && <span title="매월 반복">🔁 </span>}
                  {trans.categories?.icon} {trans.categories?.name}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {trans.isRecurring
                    ? `예정 · ${trans.date}`
                    : `${trans.profiles?.nickname || trans.profiles?.email.split('@')[0]} · ${trans.date}`}
                </p>
                {trans.memo && (
                  <p className="text-xs text-gray-600 mt-1">{trans.memo}</p>
                )}
              </div>
              <p
                className={`text-right font-bold whitespace-nowrap ml-4 ${
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

      {editing && (
        <EditTransactionModal
          transaction={editing}
          categories={categories}
          supabase={supabase}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            fetchTransactions()
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
            fetchTransactions()
          }}
        />
      )}
    </div>
  )
}
