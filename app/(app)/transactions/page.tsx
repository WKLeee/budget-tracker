'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sortByDefaultOrder } from '@/lib/categories'
import EditTransactionModal from '@/components/EditTransactionModal'

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
}

interface Category {
  id: string
  name: string
  icon: string
  type: 'income' | 'expense'
}

export default function TransactionsPage() {
  const supabase = createClient()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [isLoading, setIsLoading] = useState(true)

  const [editing, setEditing] = useState<Transaction | null>(null)

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

  const income = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + (t.amount || 0), 0)

  const expense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + (t.amount || 0), 0)

  if (isLoading) {
    return <div className="p-4">로딩 중...</div>
  }

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
      {transactions.length === 0 ? (
        <p className="text-gray-500 text-center py-8">거래가 없습니다</p>
      ) : (
        <div className="space-y-3">
          {transactions.map(trans => (
            <button
              key={trans.id}
              type="button"
              onClick={() => setEditing(trans)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200 text-left hover:bg-gray-100 transition"
            >
              <div className="flex-1">
                <p className="font-medium text-gray-900">
                  {trans.categories?.icon} {trans.categories?.name}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {trans.profiles?.nickname || trans.profiles?.email.split('@')[0]} · {trans.date}
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
    </div>
  )
}
