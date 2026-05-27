'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { sortByDefaultOrder } from '@/lib/categories'

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

  // 수정 모달 상태
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [editType, setEditType] = useState<'income' | 'expense'>('expense')
  const [editAmount, setEditAmount] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editMemo, setEditMemo] = useState('')
  const [isSaving, setIsSaving] = useState(false)

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

  const openEdit = (t: Transaction) => {
    setEditing(t)
    setEditType(t.type)
    setEditAmount(String(t.amount))
    setEditCategory(t.category_id ?? '')
    setEditDate(t.date)
    setEditMemo(t.memo ?? '')
  }

  const handleUpdate = async () => {
    if (!editing) return
    if (!editAmount || !editCategory) {
      alert('금액과 카테고리를 입력해주세요')
      return
    }

    setIsSaving(true)
    const { error } = await supabase
      .from('transactions')
      .update({
        type: editType,
        amount: Math.round(Number(editAmount)),
        category_id: editCategory,
        date: editDate,
        memo: editMemo,
      })
      .eq('id', editing.id)
    setIsSaving(false)

    if (error) {
      alert('수정 실패: ' + error.message)
      return
    }

    setEditing(null)
    fetchTransactions()
  }

  const handleDelete = async () => {
    if (!editing) return
    if (!window.confirm('이 거래를 삭제할까요?')) return

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', editing.id)

    if (error) {
      alert('삭제 실패: ' + error.message)
      return
    }

    setEditing(null)
    fetchTransactions()
  }

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

  const editCategories = categories.filter(c => c.type === editType)

  if (isLoading) {
    return <div className="p-4">로딩 중...</div>
  }

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
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-xs text-gray-600">수입</p>
          <p className="text-lg font-bold text-green-600 mt-1">
            +{income.toLocaleString()}원
          </p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-gray-600">지출</p>
          <p className="text-lg font-bold text-red-600 mt-1">
            -{expense.toLocaleString()}원
          </p>
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
              onClick={() => openEdit(trans)}
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

      {/* 수정 모달 */}
      {editing && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-white rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">거래 수정</h2>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
              >
                ×
              </button>
            </div>

            {/* 유형 */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setEditType('expense')
                  setEditCategory('')
                }}
                className={`flex-1 py-2 rounded-lg font-medium transition ${
                  editType === 'expense'
                    ? 'bg-gray-900 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                지출
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditType('income')
                  setEditCategory('')
                }}
                className={`flex-1 py-2 rounded-lg font-medium transition ${
                  editType === 'income'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                수입
              </button>
            </div>

            {/* 금액 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">금액 (원)</label>
              <input
                type="number"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 text-lg"
              />
            </div>

            {/* 카테고리 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">카테고리</label>
              <select
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">선택해주세요</option>
                {editCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.icon} {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 날짜 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">날짜</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 메모 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">메모</label>
              <input
                type="text"
                value={editMemo}
                onChange={(e) => setEditMemo(e.target.value)}
                placeholder="선택사항"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* 액션 */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-3 rounded-lg font-medium text-red-600 border border-red-300 hover:bg-red-50"
              >
                삭제
              </button>
              <button
                type="button"
                onClick={handleUpdate}
                disabled={isSaving}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium py-3 rounded-lg transition"
              >
                {isSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
