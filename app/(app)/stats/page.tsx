'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

interface Transaction {
  id: string
  type: 'income' | 'expense'
  amount: number
  date: string
  categories: { name: string; icon: string }
}

interface ChartData {
  name: string
  수입: number
  지출: number
}

interface CategoryChartData {
  name: string
  value: number
}

export default function StatsPage() {
  const supabase = createClient()
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [categoryData, setCategoryData] = useState<CategoryChartData[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6']

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data: members } = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', user.id)
          .single()

        if (!members) return

        // 최근 6개월 데이터
        const months: string[] = []
        for (let i = 5; i >= 0; i--) {
          const d = new Date()
          d.setMonth(d.getMonth() - i)
          const year = d.getFullYear()
          const month = String(d.getMonth() + 1).padStart(2, '0')
          months.push(`${year}-${month}`)
        }

        const { data: allTransactions } = await supabase
          .from('transactions')
          .select(`
            id,
            type,
            amount,
            date,
            categories (name, icon)
          `)
          .eq('household_id', members.household_id)
          .gte('date', `${months[0]}-01`)
          .lte('date', `${months[months.length - 1]}-31`)

        if (allTransactions) {
          // 월별 차트 데이터
          const monthlyData: Record<string, { 수입: number; 지출: number }> = {}
          months.forEach(m => {
            monthlyData[m] = { 수입: 0, 지출: 0 }
          })

          ;(allTransactions as unknown as Transaction[]).forEach(trans => {
            const month = trans.date.substring(0, 7)
            if (monthlyData[month]) {
              if (trans.type === 'income') {
                monthlyData[month].수입 += trans.amount || 0
              } else {
                monthlyData[month].지출 += trans.amount || 0
              }
            }
          })

          const chartDataFormatted = months.map(m => ({
            name: m.split('-')[1] + '월',
            ...monthlyData[m],
          }))

          setChartData(chartDataFormatted)

          // 선택 월 카테고리별 지출
          const [year, month] = selectedMonth.split('-')
          const monthTransactions = (allTransactions as unknown as Transaction[]).filter(
            t => t.date.startsWith(`${year}-${month}`) && t.type === 'expense'
          )

          const categoryTotals: Record<string, number> = {}
          monthTransactions.forEach(trans => {
            const catName = trans.categories?.name || '기타'
            categoryTotals[catName] = (categoryTotals[catName] || 0) + (trans.amount || 0)
          })

          const categoryDataFormatted = Object.entries(categoryTotals)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)

          setCategoryData(categoryDataFormatted)
        }
      } catch (error) {
        console.error('통계 조회 실패:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [supabase, selectedMonth])

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

  return (
    <div className="p-4 max-w-md mx-auto pb-24">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">통계</h1>

      {/* 월별 수입/지출 차트 */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">월별 수입/지출</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value: any) => `${Number(value).toLocaleString()}원`} />
              <Legend />
              <Bar dataKey="수입" fill="#10b981" />
              <Bar dataKey="지출" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-center py-8">데이터가 없습니다</p>
        )}
      </div>

      {/* 카테고리별 지출 */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            월 선택
          </label>
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

        <h2 className="font-bold text-gray-900 mb-4">카테고리별 지출 ({selectedMonth})</h2>
        {categoryData.length > 0 ? (
          <div className="space-y-2">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${(value as number).toLocaleString()}원`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {categoryData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => `${Number(value).toLocaleString()}원`} />
              </PieChart>
            </ResponsiveContainer>

            <div className="mt-4 space-y-2">
              {categoryData.map((cat, idx) => (
                <div key={cat.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    <span className="text-sm text-gray-900">{cat.name}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {cat.value.toLocaleString()}원
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-center py-8">이 달 지출이 없습니다</p>
        )}
      </div>
    </div>
  )
}
