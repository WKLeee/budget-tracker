'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { sortByDefaultOrder } from '@/lib/categories'

interface Category {
  id: string
  name: string
  icon: string
  type: 'income' | 'expense'
}

export default function NewTransactionPage() {
  const router = useRouter()
  const supabase = createClient()
  const [transactionType, setTransactionType] = useState<'income' | 'expense'>('expense')
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [selectedCategory, setSelectedCategory] = useState('')
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [householdId, setHouseholdId] = useState('')

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
      } catch (error) {
        console.error('데이터 조회 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [supabase, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!amount || !selectedCategory || !householdId) {
      alert('모든 필드를 입력해주세요')
      return
    }

    setIsSaving(true)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { error } = await supabase.from('transactions').insert({
        household_id: householdId,
        user_id: user.id,
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
    return <div className="p-4">로딩 중...</div>
  }

  const filteredCategories = categories.filter(c => c.type === transactionType)

  return (
    <div className="p-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">거래 추가</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
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
                  ? 'bg-gray-900 text-white'
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

        {/* 날짜 */}
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

        {/* 메모 */}
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
