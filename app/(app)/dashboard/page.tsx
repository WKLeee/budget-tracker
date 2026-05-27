'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Transaction {
  id: string
  type: 'income' | 'expense'
  amount: number
  memo: string
  date: string
  categories: { name: string; icon: string } | null
  profiles: { email: string } | null
}

export default function DashboardPage() {
  const supabase = createClient()
  const [thisMonth, setThisMonth] = useState({
    income: 0,
    expense: 0,
  })
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        // 사용자의 가계부 조회
        const { data: members } = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', user.id)
          .single()

        if (!members) return

        const currentMonth = new Date()
        const monthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`

        // 이번 달 거래 조회
        const { data: transData } = await supabase
          .from('transactions')
          .select(`
            id,
            type,
            amount,
            memo,
            date,
            categories (name, icon),
            profiles (email)
          `)
          .eq('household_id', members.household_id)
          .gte('date', `${monthStr}-01`)
          .lte('date', `${monthStr}-31`)
          .order('date', { ascending: false })
          .limit(5)

        if (transData) {
          const income = transData
            .filter(t => t.type === 'income')
            .reduce((sum, t) => sum + (t.amount || 0), 0)

          const expense = transData
            .filter(t => t.type === 'expense')
            .reduce((sum, t) => sum + (t.amount || 0), 0)

          setThisMonth({ income, expense })
          setTransactions((transData as unknown as Transaction[]) || [])
        }
      } catch (error) {
        console.error('데이터 조회 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchData()
  }, [supabase])

  if (isLoading) {
    return <div className="p-4">로딩 중...</div>
  }

  const balance = thisMonth.income - thisMonth.expense

  return (
    <div className="p-4 max-w-md mx-auto">
      {/* 요약 카드 */}
      <div className="space-y-3 mb-6">
        <div className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white rounded-lg p-4">
          <p className="text-sm opacity-80">이번 달 잔액</p>
          <p className="text-3xl font-bold mt-2">
            {balance.toLocaleString()}원
          </p>
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

      {/* 최근 거래 */}
      <div>
        <h2 className="text-lg font-bold text-gray-900 mb-3">최근 거래</h2>
        {transactions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">거래가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {transactions.map(trans => (
              <div
                key={trans.id}
                className="flex items-center justify-between py-3 border-b border-gray-100"
              >
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {trans.categories?.icon} {trans.categories?.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {trans.profiles?.email.split('@')[0]} · {trans.date}
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
