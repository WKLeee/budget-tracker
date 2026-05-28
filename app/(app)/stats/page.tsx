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

interface Insights {
  selTotal: number
  prevTotal: number
  totalChangePct: number | null
  dailyAvg: number
  projection: number | null
  topCategoryChanges: { name: string; diffPct: number; sel: number; prev: number }[]
  isCurrentMonth: boolean
  daysPassed: number
  daysInMonth: number
}

export default function StatsPage() {
  const supabase = createClient()
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  const [chartData, setChartData] = useState<ChartData[]>([])
  const [categoryData, setCategoryData] = useState<CategoryChartData[]>([])
  const [insights, setInsights] = useState<Insights | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6']

  useEffect(() => {
    const fetchStats = async () => {
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

          // 인사이트 계산
          const selY = Number(year)
          const selM = Number(month)
          const prevDate = new Date(selY, selM - 2, 1)
          const prevPrefix = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

          const prevTransactions = (allTransactions as unknown as Transaction[]).filter(
            t => t.date.startsWith(prevPrefix) && t.type === 'expense'
          )

          const selTotal = monthTransactions.reduce((s, t) => s + (t.amount || 0), 0)
          const prevTotal = prevTransactions.reduce((s, t) => s + (t.amount || 0), 0)
          const totalChangePct =
            prevTotal > 0 ? ((selTotal - prevTotal) / prevTotal) * 100 : null

          // 카테고리별 변화
          const prevByCat: Record<string, number> = {}
          prevTransactions.forEach(t => {
            const n = t.categories?.name || '기타'
            prevByCat[n] = (prevByCat[n] || 0) + (t.amount || 0)
          })
          const allCatNames = new Set([
            ...Object.keys(categoryTotals),
            ...Object.keys(prevByCat),
          ])
          const topCategoryChanges = Array.from(allCatNames)
            .map(name => {
              const sel = categoryTotals[name] || 0
              const prev = prevByCat[name] || 0
              const diffPct =
                prev > 0 ? ((sel - prev) / prev) * 100 : sel > 0 ? Infinity : 0
              return { name, sel, prev, diffPct }
            })
            .filter(c => c.sel > 0 || c.prev > 0)
            .sort((a, b) => {
              const aMag = a.diffPct === Infinity ? Number.MAX_SAFE_INTEGER : Math.abs(a.diffPct)
              const bMag = b.diffPct === Infinity ? Number.MAX_SAFE_INTEGER : Math.abs(b.diffPct)
              return bMag - aMag
            })
            .slice(0, 3)

          // 일 평균 + 월말 예상
          const now = new Date()
          const isCurrentMonth =
            selY === now.getFullYear() && selM === now.getMonth() + 1
          const daysInMonth = new Date(selY, selM, 0).getDate()
          const daysPassed = isCurrentMonth ? now.getDate() : daysInMonth
          const dailyAvg = daysPassed > 0 ? selTotal / daysPassed : 0
          const projection = isCurrentMonth ? dailyAvg * daysInMonth : null

          setInsights({
            selTotal,
            prevTotal,
            totalChangePct,
            dailyAvg,
            projection,
            topCategoryChanges,
            isCurrentMonth,
            daysPassed,
            daysInMonth,
          })
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

  const fmt = (n: number) => Math.round(n).toLocaleString()

  return (
    <div className="p-4 max-w-md mx-auto pb-24">
      <h1 className="text-2xl font-bold text-gray-900 mb-4">통계</h1>

      {/* 인사이트 */}
      {insights && insights.selTotal > 0 && (
        <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6 space-y-3">
          <h2 className="font-bold text-gray-900">💡 이번 달 인사이트</h2>

          {/* 지난달 대비 변화 */}
          {insights.totalChangePct !== null && (
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-700">지난달 대비</span>
              <span
                className={`text-sm font-bold ${
                  insights.totalChangePct > 0
                    ? 'text-red-600'
                    : insights.totalChangePct < 0
                    ? 'text-green-600'
                    : 'text-gray-600'
                }`}
              >
                {insights.totalChangePct > 0 ? '▲' : insights.totalChangePct < 0 ? '▼' : '='}{' '}
                {Math.abs(insights.totalChangePct).toFixed(0)}%
                <span className="text-gray-500 font-normal ml-2">
                  ({fmt(insights.selTotal - insights.prevTotal)}원)
                </span>
              </span>
            </div>
          )}

          {/* 일 평균 + 예상 */}
          <div className="flex items-center justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-700">
              일 평균 지출{' '}
              <span className="text-xs text-gray-400">
                ({insights.daysPassed}일)
              </span>
            </span>
            <span className="text-sm font-bold text-gray-900">{fmt(insights.dailyAvg)}원</span>
          </div>

          {insights.projection !== null && (
            <div className="flex items-center justify-between py-2 border-b border-gray-100">
              <span className="text-sm text-gray-700">월말 예상 지출</span>
              <span className="text-sm font-bold text-indigo-600">
                {fmt(insights.projection)}원
              </span>
            </div>
          )}

          {/* 카테고리 변화 Top 3 */}
          {insights.topCategoryChanges.length > 0 && (
            <div className="pt-1">
              <p className="text-xs text-gray-500 mb-2">카테고리 변화 (지난달 대비)</p>
              <div className="space-y-1">
                {insights.topCategoryChanges.map(c => (
                  <div key={c.name} className="flex items-center justify-between text-sm">
                    <span className="text-gray-900">{c.name}</span>
                    <span
                      className={`font-medium ${
                        c.diffPct === Infinity
                          ? 'text-red-600'
                          : c.diffPct > 0
                          ? 'text-red-600'
                          : c.diffPct < 0
                          ? 'text-green-600'
                          : 'text-gray-600'
                      }`}
                    >
                      {c.diffPct === Infinity
                        ? '신규'
                        : c.sel === 0
                        ? '없음'
                        : `${c.diffPct > 0 ? '▲' : '▼'} ${Math.abs(c.diffPct).toFixed(0)}%`}
                      <span className="text-gray-400 font-normal ml-2 text-xs">
                        {fmt(c.sel)}원
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 월별 수입/지출 차트 */}
      <div className="bg-white p-4 rounded-lg border border-gray-200 mb-6">
        <h2 className="font-bold text-gray-900 mb-4">월별 수입/지출</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={chartData}
              margin={{ top: 16, right: 8, left: -16, bottom: 0 }}
              barCategoryGap="25%"
            >
              <defs>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0.65} />
                </linearGradient>
                <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0.65} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={(v: number) =>
                  v >= 100000000
                    ? `${(v / 100000000).toFixed(1).replace(/\.0$/, '')}억`
                    : v >= 10000
                    ? `${(v / 10000).toFixed(0)}만`
                    : `${v}`
                }
              />
              <Tooltip
                cursor={{ fill: 'rgba(99,102,241,0.05)' }}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  fontSize: 13,
                }}
                formatter={(value) => `${Number(value).toLocaleString()}원`}
              />
              <Legend
                iconType="circle"
                wrapperStyle={{ paddingTop: 8, fontSize: 13 }}
              />
              <Bar
                dataKey="수입"
                fill="url(#incomeGrad)"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
              />
              <Bar
                dataKey="지출"
                fill="url(#expenseGrad)"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
              />
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
                  innerRadius={50}
                  outerRadius={90}
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
