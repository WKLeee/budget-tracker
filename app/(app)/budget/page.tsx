'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import AppLoading from '@/components/AppLoading'

interface Category {
  id: string
  name: string
  icon: string
  type: 'income' | 'expense'
}

interface Budget {
  id: string
  category_id: string
  amount: number
  month: string
}

interface CategoryWithBudget extends Category {
  budget?: Budget
  spent: number
}

export default function BudgetPage() {
  const supabase = createClient()
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [categories, setCategories] = useState<CategoryWithBudget[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

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

        // 카테고리 조회
        const { data: catData } = await supabase
          .from('categories')
          .select('*')
          .eq('household_id', members.household_id)
          .eq('type', 'expense')
          .order('is_default', { ascending: false })

        // 예산 조회
        const { data: budgetData } = await supabase
          .from('budgets')
          .select('*')
          .eq('household_id', members.household_id)
          .eq('month', selectedMonth)

        // 지출액 조회
        const { data: transData } = await supabase
          .from('transactions')
          .select('amount, category_id')
          .eq('household_id', members.household_id)
          .eq('type', 'expense')
          .gte('date', `${selectedMonth}-01`)
          .lte('date', `${selectedMonth}-31`)

        if (catData) {
          const budgetMap = Object.fromEntries(
            (budgetData || []).map(b => [b.category_id, b])
          )

          const spentMap: Record<string, number> = {}
          ;(transData || []).forEach(t => {
            spentMap[t.category_id] = (spentMap[t.category_id] || 0) + (t.amount || 0)
          })

          const categoriesWithBudget = catData.map(cat => ({
            ...cat,
            budget: budgetMap[cat.id],
            spent: spentMap[cat.id] || 0,
          }))

          setCategories(categoriesWithBudget as CategoryWithBudget[])
        }
      } catch (error) {
        console.error('데이터 조회 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [supabase, selectedMonth])

  const handleSaveBudget = async (categoryId: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user || !editValue) return

    const { data: memberRows } = await supabase
      .from('household_members')
      .select('household_id, joined_at')
      .eq('user_id', user.id)
      .order('joined_at', { ascending: false })

    const members = memberRows?.[0]

    if (!members) return

    const amount = Math.round(Number(editValue))

    const existing = categories.find(c => c.id === categoryId)?.budget

    if (existing) {
      // 업데이트
      await supabase
        .from('budgets')
        .update({ amount })
        .eq('id', existing.id)
    } else {
      // 새로 생성
      await supabase.from('budgets').insert({
        household_id: members.household_id,
        category_id: categoryId,
        amount,
        month: selectedMonth,
      })
    }

    setEditingId(null)
    setEditValue('')
    window.location.reload()
  }

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date()
    d.setMonth(d.getMonth() - i)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    return `${year}-${month}`
  })

  if (isLoading) {
    return <AppLoading />
  }

  const totalBudget = categories.reduce((sum, c) => sum + (c.budget?.amount || 0), 0)
  const totalSpent = categories.reduce((sum, c) => sum + c.spent, 0)

  return (
    <div className="p-4 max-w-md mx-auto pb-24">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">예산</h1>

      {/* 월 선택 */}
      <div className="mb-6">
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
      {totalBudget > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
          <p className="text-xs text-gray-600 mb-2">이번 달 예산 대비 지출</p>
          <div className="flex items-end gap-3 mb-2">
            <p className="text-3xl font-bold text-indigo-600">{totalSpent.toLocaleString()}</p>
            <p className="text-gray-600 mb-1">/ {totalBudget.toLocaleString()}원</p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition ${
                totalSpent > totalBudget ? 'bg-red-500' : 'bg-indigo-500'
              }`}
              style={{ width: `${Math.min((totalSpent / totalBudget) * 100, 100)}%` }}
            />
          </div>
          {totalSpent > totalBudget && (
            <p className="text-xs text-red-600 mt-2">
              🚨 예산 초과: {(totalSpent - totalBudget).toLocaleString()}원
            </p>
          )}
        </div>
      )}

      {/* 카테고리별 예산 */}
      <div className="space-y-3">
        {categories.map(cat => {
          const budgetAmount = cat.budget?.amount || 0
          const percentage = budgetAmount > 0 ? Math.min((cat.spent / budgetAmount) * 100, 100) : 0
          const isOver = budgetAmount > 0 && cat.spent > budgetAmount

          return (
            <div
              key={cat.id}
              className={`p-4 rounded-lg border ${
                isOver
                  ? 'bg-red-50 border-red-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="font-medium text-gray-900">
                  {cat.icon} {cat.name}
                </p>
                {editingId === cat.id ? (
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="금액"
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveBudget(cat.id)}
                      className="px-2 py-1 bg-indigo-600 text-white text-xs rounded"
                    >
                      저장
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-2 py-1 bg-gray-300 text-gray-900 text-xs rounded"
                    >
                      취소
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditingId(cat.id)
                      setEditValue(budgetAmount.toString())
                    }}
                    className="text-xs bg-white border border-gray-300 hover:bg-gray-100 px-3 py-1 rounded text-gray-700"
                  >
                    {budgetAmount > 0 ? '수정' : '설정'}
                  </button>
                )}
              </div>

              <p className={`text-sm font-medium mb-2 ${isOver ? 'text-red-600' : 'text-gray-900'}`}>
                {cat.spent.toLocaleString()}원
                {budgetAmount > 0 && ` / ${budgetAmount.toLocaleString()}원`}
              </p>

              {budgetAmount > 0 && (
                <>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition ${
                        isOver ? 'bg-red-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-600 mt-2">
                    {isOver ? (
                      <span className="text-red-600">
                        초과: {(cat.spent - budgetAmount).toLocaleString()}원
                      </span>
                    ) : (
                      <span>
                        남은 예산: {(budgetAmount - cat.spent).toLocaleString()}원
                      </span>
                    )}
                  </p>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
